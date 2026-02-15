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

  // 9. Heartbeat (every 30s)
  startHeartbeat();

  // 10. Cleanup on page unload
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
    ROOM.LastFM.destroy();
    ROOM.Events.destroy();
    ROOM.Firebase.destroy();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  });

  // Also handle visibility change (mobile tab switch)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (ROOM.currentUser) {
        // Use sendBeacon-style update for reliability
        ROOM.Firebase.heartbeat(ROOM.currentUser.phoneNumber);
      }
    }
  });
}
