/**
 * Room Main - Entry Point
 * Auth guard, initialization orchestrator, heartbeat, cleanup
 */

window.ROOM = window.ROOM || {};

ROOM.currentUser = null;

// ========== AUTH GUARD & INIT ==========
checkAuthState().then(async function (user) {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  try {
    // Get user data
    var userData = await getCurrentUserData();
    if (!userData) {
      window.location.href = 'login.html';
      return;
    }

    ROOM.currentUser = {
      phoneNumber: userData.phoneNumber,
      username: userData.username || 'BLINK',
      lastfmUsername: userData.lastfmUsername || null,
      avatarColor: userData.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)'
    };

    // Set profile initial
    var profileInitial = document.getElementById('roomProfileInitial');
    if (profileInitial) {
      profileInitial.textContent = ROOM.currentUser.username.charAt(0).toUpperCase();
    }

    // Get room ID from URL
    var params = new URLSearchParams(window.location.search);
    var roomId = params.get('id') || 'streaming';

    // Initialize all services
    await initRoom(roomId);

  } catch (err) {
    console.error('Room init error:', err);
    document.getElementById('roomLoading').innerHTML =
      '<div class="room-loading-text" style="color:#ff6b7a;">Failed to join. <a href="members.html" style="color:#f7a6b9;">Go back</a></div>';
  }
});

async function initRoom(roomId) {
  // 1. Firebase (real-time data)
  ROOM.Firebase.init(roomId);

  // 2. Join the room
  await ROOM.Firebase.joinRoom(ROOM.currentUser);

  // 3. Check if user needs to link Last.fm
  if (!ROOM.currentUser.lastfmUsername) {
    await showLastfmModal();
  }

  // 4. Agora RTM (chat)
  await ROOM.Agora.init(ROOM.currentUser.phoneNumber, roomId);

  // 5. Last.fm polling
  ROOM.LastFM.init();

  // 6. Initialize UI modules
  ROOM.Leaderboard.init();
  ROOM.Activity.init();
  ROOM.Chat.init();
  ROOM.Voice.init();
  ROOM.Events.init();
  ROOM.Animations.init();
  ROOM.Atmosphere.init();

  // 7. Setup mobile tabs
  setupMobileTabs();

  // 8. Hide loading, show room
  document.getElementById('roomLoading').style.display = 'none';
  document.getElementById('roomTopbar').style.display = '';
  document.getElementById('roomLayout').style.display = '';

  // Show bottom nav on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('bottomNav').style.display = 'flex';
    // Default to stage (chat) panel on mobile
    switchMobilePanel('panelStage');
  }

  // 9. Stream counter expand/collapse toggle
  setupStreamCounterToggle();

  // 10. Check-in system (offline tracking)
  // Small delay to let participants cache populate from Convex
  setTimeout(function () { initCheckIn(); }, 2000);

  // 10. Heartbeat (every 30s)
  startHeartbeat();

  // 11. Cleanup on page unload
  setupCleanup();
}

// ========== LAST.FM MODAL ==========
function showLastfmModal() {
  return new Promise(function (resolve) {
    var modal = document.getElementById('lastfmModal');
    if (!modal) { resolve(); return; }

    // Hide loading while showing modal
    document.getElementById('roomLoading').style.display = 'none';
    modal.style.display = 'flex';

    var linkBtn = document.getElementById('lastfmLinkBtn');
    var skipBtn = document.getElementById('lastfmSkipBtn');
    var input = document.getElementById('lastfmUsernameInput');

    function onLink() {
      var username = input.value.trim();
      if (!username) {
        input.style.borderColor = '#ff6b7a';
        return;
      }

      ROOM.currentUser.lastfmUsername = username;
      ROOM.Firebase.updateLastfmUsername(ROOM.currentUser.phoneNumber, username);

      modal.style.display = 'none';
      document.getElementById('roomLoading').style.display = 'flex';
      cleanup();
      resolve();
    }

    function onSkip() {
      modal.style.display = 'none';
      document.getElementById('roomLoading').style.display = 'flex';
      cleanup();
      resolve();
    }

    function cleanup() {
      linkBtn.removeEventListener('click', onLink);
      skipBtn.removeEventListener('click', onSkip);
    }

    linkBtn.addEventListener('click', onLink);
    skipBtn.addEventListener('click', onSkip);

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') onLink();
    });

    input.focus();
  });
}

// ========== MOBILE TABS ==========
function setupMobileTabs() {
  var tabs = document.querySelectorAll('.room-bottom-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var panelId = tab.dataset.panel;
      switchMobilePanel(panelId);

      // Update active tab
      tabs.forEach(function (t) { t.classList.remove('room-bottom-tab--active'); });
      tab.classList.add('room-bottom-tab--active');
    });
  });

  // Handle resize
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var nav = document.getElementById('bottomNav');
      if (window.innerWidth <= 768) {
        nav.style.display = 'flex';
      } else {
        nav.style.display = 'none';
        // Show all panels on desktop
        document.querySelectorAll('.room-panel').forEach(function (p) {
          p.classList.remove('room-panel--mobile-active');
          p.classList.add('room-panel--active');
        });
      }
    }, 200);
  });
}

function switchMobilePanel(panelId) {
  var panels = document.querySelectorAll('.room-panel');
  panels.forEach(function (p) {
    p.classList.remove('room-panel--mobile-active');
  });

  var target = document.getElementById(panelId);
  if (target) {
    target.classList.add('room-panel--mobile-active');
  }

  // Always show chat input when on stage panel
  var chatBar = document.getElementById('chatInputBar');
  if (chatBar) {
    chatBar.style.display = panelId === 'panelStage' ? '' : 'none';
  }
}

// ========== CHECK-IN SYSTEM ==========
// Offline tracking: users check in every hour to keep being tracked when they leave the page.
// If they don't check in within the interval, tracking stops (same as current offline behavior).

var checkInTimerInterval = null;

function initCheckIn() {
  var btn = document.getElementById('checkInBtn');
  var timerEl = document.getElementById('checkInTimer');
  var container = document.getElementById('checkInContainer');
  if (!btn || !container) return;

  btn.addEventListener('click', function () {
    performCheckIn();
  });

  // Check if user already has an active check-in (from a previous session)
  var participants = ROOM.Firebase.getParticipants();
  var me = participants.find(function (p) { return p.id === ROOM.currentUser.phoneNumber; });
  if (me && me.data.offlineTracking && me.data.lastCheckIn) {
    var elapsed = Date.now() - me.data.lastCheckIn;
    var interval = CONFIG.checkInInterval || 3600000;
    if (elapsed < interval) {
      // Restore the timer from where it was
      startCheckInCountdown(interval - elapsed);
      return;
    }
  }

  // Show the initial check-in prompt
  showCheckInButton();

  // Show reminder toast to encourage check-in
  setTimeout(function () {
    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('join', '📋', '<strong>Check in</strong> to start tracking your streams!');
    }
  }, 1500);
}

function performCheckIn() {
  if (!ROOM.currentUser) return;

  ConvexService.mutation('participants:checkIn', {
    roomId: ROOM.Firebase.roomId,
    phoneNumber: ROOM.currentUser.phoneNumber
  }).then(function () {
    startCheckInCountdown(CONFIG.checkInInterval || 3600000);

    // Show a nice toast
    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('join', '✅', 'Checked in! Offline tracking is <strong>active</strong> for the next hour.');
    }
  });
}

function startCheckInCountdown(durationMs) {
  var btn = document.getElementById('checkInBtn');
  var timerEl = document.getElementById('checkInTimer');
  var statusEl = document.getElementById('checkInStatus');
  var container = document.getElementById('checkInContainer');

  if (btn) btn.style.display = 'none';
  if (statusEl) statusEl.style.display = '';
  if (container) container.classList.add('room-checkin--active');

  var endTime = Date.now() + durationMs;

  if (checkInTimerInterval) clearInterval(checkInTimerInterval);

  function updateTimer() {
    var remaining = endTime - Date.now();
    if (remaining <= 0) {
      // Timer expired — show check-in button again
      clearInterval(checkInTimerInterval);
      checkInTimerInterval = null;
      showCheckInButton();
      return;
    }

    var mins = Math.floor(remaining / 60000);
    var secs = Math.floor((remaining % 60000) / 1000);
    if (timerEl) {
      timerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    }
  }

  updateTimer();
  checkInTimerInterval = setInterval(updateTimer, 1000);
}

function showCheckInButton() {
  var btn = document.getElementById('checkInBtn');
  var statusEl = document.getElementById('checkInStatus');
  var container = document.getElementById('checkInContainer');

  if (btn) btn.style.display = '';
  if (statusEl) statusEl.style.display = 'none';
  if (container) container.classList.remove('room-checkin--active');

  // Pulse animation to draw attention
  if (btn) {
    btn.classList.add('room-checkin-btn--pulse');
    setTimeout(function () {
      btn.classList.remove('room-checkin-btn--pulse');
    }, 3000);
  }
}

// ========== STREAM COUNTER TOGGLE ==========
function setupStreamCounterToggle() {
  var toggle = document.getElementById('streamCounterToggle');
  var breakdown = document.getElementById('streamCounterBreakdown');
  var chevron = document.getElementById('streamCounterChevron');
  if (!toggle || !breakdown) return;

  toggle.addEventListener('click', function () {
    var isOpen = breakdown.classList.toggle('room-stream-counter-breakdown--open');
    if (chevron) chevron.classList.toggle('room-stream-counter-chevron--open', isOpen);
  });
}

// ========== HEARTBEAT ==========
var heartbeatInterval = null;

function startHeartbeat() {
  heartbeatInterval = setInterval(function () {
    if (ROOM.currentUser) {
      ROOM.Firebase.heartbeat(ROOM.currentUser.phoneNumber);
    }
  }, CONFIG.heartbeatInterval || 30000);
}

// ========== CLEANUP ==========
function setupCleanup() {
  window.addEventListener('beforeunload', function () {
    if (ROOM.currentUser) {
      ROOM.Firebase.leaveRoom(ROOM.currentUser.phoneNumber);
    }
    ROOM.Agora.destroy();
    ROOM.Voice.destroy();
    ROOM.LastFM.destroy();
    ROOM.Events.destroy();
    ROOM.Firebase.destroy();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (checkInTimerInterval) clearInterval(checkInTimerInterval);
  });

  // Also handle visibility change (mobile tab switch)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (ROOM.currentUser) {
        // Use sendBeacon-style update for reliability
        ROOM.Firebase.heartbeat(ROOM.currentUser.phoneNumber);
      }
    } else if (document.visibilityState === 'visible') {
      // When user returns, check if they need to check in
      if (ROOM.currentUser && ROOM.LastFM && !ROOM.LastFM.isCheckedIn()) {
        // Only show reminder if the check-in button is visible (not already checked in)
        var btn = document.getElementById('checkInBtn');
        if (btn && btn.style.display !== 'none') {
          // Pulse the button to draw attention
          btn.classList.add('room-checkin-btn--pulse');
          setTimeout(function () {
            btn.classList.remove('room-checkin-btn--pulse');
          }, 4500);

          // Show reminder toast
          if (ROOM.Animations && ROOM.Animations.showToast) {
            ROOM.Animations.showToast('join', '📋', '<strong>Check in</strong> to track your streams!');
          }
        }
      }
    }
  });
}
