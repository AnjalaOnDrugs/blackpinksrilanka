/**
 * Room Animations
 * Visual effects for mini events: confetti, banners, toasts, bursts
 */

window.ROOM = window.ROOM || {};

ROOM.Animations = {
  overlay: null,
  toastContainer: null,
  twinCardsContainer: null,
  bongPromptEl: null,
  bongPromptTimer: null,

  init: function () {
    this.overlay = document.getElementById('eventOverlay');
    this.toastContainer = document.getElementById('toastContainer');
    this.twinCardsContainer = document.getElementById('twinCards');
  },

  // ========== JOIN ANIMATION ==========
  playJoin: function (data) {
    this.showToast('join', '👋', '<strong>' + this.esc(data.username) + '</strong> joined the party!');
  },

  // ========== OVERTAKE ANIMATION ==========
  playOvertake: function (data) {
    var self = this;

    // Banner
    var banner = document.createElement('div');
    banner.className = 'room-event-banner';
    banner.innerHTML =
      '🏆 <strong>' + this.esc(data.username) + '</strong> overtook ' +
      this.esc(data.overtakenUsername) + ' → now <strong>#' + data.newRank + '</strong>!';
    this.overlay.appendChild(banner);

    setTimeout(function () {
      if (banner.parentNode) banner.remove();
    }, 4500);

    // Confetti burst
    this.spawnConfetti(50);

    // Glow the leaderboard entry
    if (data.userId) {
      ROOM.Leaderboard && ROOM.Leaderboard.glowLeader && ROOM.Leaderboard.glowLeader(data.userId);
    }

    // Toast
    this.showToast('overtake', '⚡',
      '<strong>' + this.esc(data.username) + '</strong> climbed to #' + data.newRank + '!');
  },

  // ========== SURPASS NOTIFICATION IN CHAT ==========
  // Shows a notification in the chat panel when someone surpasses another user
  // Top 3 surpasses get a special premium notification
  showSurpassNotification: function (data) {
    var bubbleLayer = document.getElementById('chatBubbleLayer');
    if (!bubbleLayer) return;

    var isTop3 = data.newRank <= 3;

    var notif = document.createElement('div');
    notif.className = 'room-surpass-notif' + (isTop3 ? ' room-surpass-notif--top3' : '');

    if (isTop3) {
      // Special premium notification for top 3 surpasses
      var crownEmoji = data.newRank === 1 ? '👑' : data.newRank === 2 ? '🥈' : '🥉';
      var rankLabel = data.newRank === 1 ? '1st Place!' : data.newRank === 2 ? '2nd Place!' : '3rd Place!';

      notif.innerHTML =
        '<div class="room-surpass-notif-glow"></div>' +
        '<div class="room-surpass-notif-crown">' + crownEmoji + '</div>' +
        '<div class="room-surpass-notif-content">' +
          '<div class="room-surpass-notif-title">RANK UP</div>' +
          '<div class="room-surpass-notif-names">' +
            '<strong>' + this.esc(data.username) + '</strong>' +
            '<span class="room-surpass-notif-arrow">→</span>' +
            '<span class="room-surpass-notif-rank">' + rankLabel + '</span>' +
          '</div>' +
          '<div class="room-surpass-notif-overtaken">passed ' + this.esc(data.overtakenUsername) + '</div>' +
        '</div>' +
        '<div class="room-surpass-notif-sparkles">' +
          '<span class="room-surpass-sparkle room-surpass-sparkle--1">✦</span>' +
          '<span class="room-surpass-sparkle room-surpass-sparkle--2">✦</span>' +
          '<span class="room-surpass-sparkle room-surpass-sparkle--3">✦</span>' +
          '<span class="room-surpass-sparkle room-surpass-sparkle--4">✦</span>' +
        '</div>';
    } else {
      // Normal surpass notification
      notif.innerHTML =
        '<div class="room-surpass-notif-content">' +
          '<span class="room-surpass-notif-icon">⚡</span>' +
          '<span><strong>' + this.esc(data.username) + '</strong> surpassed ' +
          this.esc(data.overtakenUsername) + ' → #' + data.newRank + '</span>' +
        '</div>';
    }

    bubbleLayer.appendChild(notif);

    // Remove after animation
    var duration = isTop3 ? 6000 : 4000;
    setTimeout(function () {
      if (notif.parentNode) {
        notif.classList.add('room-surpass-notif--exit');
        setTimeout(function () {
          if (notif.parentNode) notif.remove();
        }, 500);
      }
    }, duration);
  },

  // ========== MILESTONE ANIMATION ==========
  playMilestone: function (data) {
    var self = this;

    // Expanding rings
    for (var i = 0; i < 3; i++) {
      var ring = document.createElement('div');
      ring.className = 'room-milestone-ring';
      ring.style.setProperty('--ring-delay', (i * 0.3) + 's');
      this.overlay.appendChild(ring);

      (function (el) {
        setTimeout(function () { if (el.parentNode) el.remove(); }, 2500);
      })(ring);
    }

    // Big number
    var numEl = document.createElement('div');
    numEl.className = 'room-milestone-number';
    numEl.textContent = this.formatMilestone(data.minutes);
    this.overlay.appendChild(numEl);

    setTimeout(function () {
      if (numEl.parentNode) numEl.remove();
    }, 3000);

    // Confetti
    this.spawnConfetti(30);

    // Toast
    this.showToast('milestone', '🎉',
      '<strong>' + this.esc(data.username) + '</strong> hit ' +
      this.formatMilestone(data.minutes) + ' minutes!');
  },

  // ========== SAME SONG / TWINNING ANIMATION ==========
  playSameSong: function (data) {
    var self = this;
    var names = data.usernames || [];
    var count = data.count || names.length;
    var track = data.track || 'Unknown';
    var artist = data.artist || '';

    // Vibing vinyl glow
    var vinyl = document.getElementById('roomVinyl');
    if (vinyl) {
      vinyl.classList.add('room-vinyl--vibing');
      setTimeout(function () {
        vinyl.classList.remove('room-vinyl--vibing');
      }, 7000);
    }

    // === Build the twinning banner ===
    var twinBanner = document.createElement('div');
    twinBanner.className = 'room-twin-banner';

    // Streak multiplier badge
    var streakHtml = '';
    if (count >= 2) {
      var streakLabel = count === 2 ? 'TWIN' : count === 3 ? 'TRIPLE' : 'MEGA';
      streakHtml =
        '<div class="room-twin-streak">' +
        '<span class="room-twin-streak-x">x' + count + '</span>' +
        '<span class="room-twin-streak-label">' + streakLabel + ' STREAK</span>' +
        '</div>';
    }

    // Build names display
    var displayNames = this._buildNamesHtml(names);

    twinBanner.innerHTML =
      '<div class="room-twin-glow"></div>' +
      '<div class="room-twin-content">' +
      '<div class="room-twin-notes">' +
      '<span class="room-twin-note room-twin-note--1">♪</span>' +
      '<span class="room-twin-note room-twin-note--2">♫</span>' +
      '<span class="room-twin-note room-twin-note--3">♪</span>' +
      '<span class="room-twin-note room-twin-note--4">♫</span>' +
      '</div>' +
      streakHtml +
      '<div class="room-twin-label">🎵 ' + (data.isUpgrade ? 'STREAK UP' : 'TWINNING') + ' 🎵</div>' +
      '<div class="room-twin-names">' + displayNames + '</div>' +
      '<div class="room-twin-song">' +
      '<span class="room-twin-song-prefix">are vibing to</span>' +
      '<span class="room-twin-song-title">' + this.esc(track) + '</span>' +
      (artist ? '<span class="room-twin-song-artist">by ' + this.esc(artist) + '</span>' : '') +
      '</div>' +
      '<div class="room-twin-eq">' +
      '<div class="room-twin-eq-bar" style="--teq-speed:0.3s;--teq-max:24px;"></div>' +
      '<div class="room-twin-eq-bar" style="--teq-speed:0.45s;--teq-max:32px;"></div>' +
      '<div class="room-twin-eq-bar" style="--teq-speed:0.25s;--teq-max:20px;"></div>' +
      '<div class="room-twin-eq-bar" style="--teq-speed:0.5s;--teq-max:28px;"></div>' +
      '<div class="room-twin-eq-bar" style="--teq-speed:0.35s;--teq-max:36px;"></div>' +
      '<div class="room-twin-eq-bar" style="--teq-speed:0.4s;--teq-max:22px;"></div>' +
      '<div class="room-twin-eq-bar" style="--teq-speed:0.28s;--teq-max:30px;"></div>' +
      '</div>' +
      '</div>';

    this.overlay.appendChild(twinBanner);

    // Screen shake effect
    document.body.classList.add('room-screen-shake');
    setTimeout(function () {
      document.body.classList.remove('room-screen-shake');
    }, 600);

    // Spawn musical note particles across screen
    this.spawnTwinParticles(count * 8);

    // Confetti burst scaled to streak
    this.spawnConfetti(count * 20);

    // Remove big banner after animation — mini card will remain
    setTimeout(function () {
      if (twinBanner.parentNode) {
        twinBanner.classList.add('room-twin-banner--exit');
        setTimeout(function () {
          if (twinBanner.parentNode) twinBanner.remove();
        }, 600);
      }
    }, 5500);

    // Also show a toast
    var toastNames = names.length > 3 ?
      names.slice(0, 2).join(', ') + ' +' + (names.length - 2) :
      names.join(' & ');
    this.showToast('same-song', '🎵',
      '<strong>' + this.esc(toastNames) + '</strong> are twinning with <strong>' +
      this.esc(track) + '</strong>! <span class="room-toast-streak">x' + count + '</span>');
  },

  // ========== PERSISTENT TWINNING MINI CARDS ==========
  // Called every detection cycle with all active twinning groups
  updateTwinCards: function (twins) {
    if (!this.twinCardsContainer) return;

    var self = this;
    var keys = Object.keys(twins);

    // If no twinning, clear all cards
    if (keys.length === 0) {
      this.twinCardsContainer.innerHTML = '';
      return;
    }

    // Rebuild cards — simple and reliable
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var t = twins[key];
      var streakLabel = t.count === 2 ? 'TWIN' : t.count === 3 ? 'TRIPLE' : 'MEGA';
      var namesShort = t.usernames.length <= 3 ?
        t.usernames.map(function (n) { return self.esc(n); }).join(', ') :
        self.esc(t.usernames[0]) + ', ' + self.esc(t.usernames[1]) + ' +' + (t.usernames.length - 2);

      html +=
        '<div class="room-twin-card" data-twin-key="' + this.esc(key) + '">' +
          '<div class="room-twin-card-eq">' +
            '<div class="room-twin-eq-bar" style="--teq-speed:0.3s;--teq-max:12px;"></div>' +
            '<div class="room-twin-eq-bar" style="--teq-speed:0.45s;--teq-max:16px;"></div>' +
            '<div class="room-twin-eq-bar" style="--teq-speed:0.25s;--teq-max:10px;"></div>' +
            '<div class="room-twin-eq-bar" style="--teq-speed:0.4s;--teq-max:14px;"></div>' +
          '</div>' +
          '<div class="room-twin-card-info">' +
            '<div class="room-twin-card-title">' +
              '<span class="room-twin-card-badge">x' + t.count + '</span>' +
              '<span class="room-twin-card-label">' + streakLabel + '</span>' +
            '</div>' +
            '<div class="room-twin-card-song">' + this.esc(t.track) + '</div>' +
            '<div class="room-twin-card-names">' + namesShort + '</div>' +
          '</div>' +
        '</div>';
    }

    this.twinCardsContainer.innerHTML = html;
  },

  // Helper: build formatted names HTML for banners
  _buildNamesHtml: function (names) {
    if (names.length === 2) {
      return '<span class="room-twin-name">' + this.esc(names[0]) + '</span>' +
        ' <span class="room-twin-and">and</span> ' +
        '<span class="room-twin-name">' + this.esc(names[1]) + '</span>';
    } else if (names.length === 3) {
      return '<span class="room-twin-name">' + this.esc(names[0]) + '</span>' +
        '<span class="room-twin-comma">, </span>' +
        '<span class="room-twin-name">' + this.esc(names[1]) + '</span>' +
        ' <span class="room-twin-and">&</span> ' +
        '<span class="room-twin-name">' + this.esc(names[2]) + '</span>';
    } else if (names.length > 3) {
      return '<span class="room-twin-name">' + this.esc(names[0]) + '</span>' +
        '<span class="room-twin-comma">, </span>' +
        '<span class="room-twin-name">' + this.esc(names[1]) + '</span>' +
        ' <span class="room-twin-and">& ' + (names.length - 2) + ' more</span>';
    }
    return '';
  },

  // ========== TWINNING MUSIC NOTE PARTICLES ==========
  spawnTwinParticles: function (count) {
    if (!this.overlay) return;
    var notes = ['♪', '♫', '♬', '🎵', '🎶'];
    var overlay = this.overlay;

    for (var i = 0; i < count; i++) {
      var particle = document.createElement('div');
      particle.className = 'room-twin-particle';
      particle.textContent = notes[Math.floor(Math.random() * notes.length)];
      particle.style.left = (Math.random() * 100) + '%';
      particle.style.setProperty('--tp-speed', (2 + Math.random() * 3) + 's');
      particle.style.setProperty('--tp-delay', (Math.random() * 1.5) + 's');
      particle.style.setProperty('--tp-drift', (Math.random() * 120 - 60) + 'px');
      particle.style.setProperty('--tp-rot', (Math.random() * 360) + 'deg');
      particle.style.fontSize = (14 + Math.random() * 18) + 'px';
      overlay.appendChild(particle);

      (function (el) {
        setTimeout(function () {
          if (el.parentNode) el.remove();
        }, 5500);
      })(particle);
    }
  },

  // ========== SESSION START ANIMATION ==========
  playSessionStart: function (data) {
    var songInfo = '';
    if (data.track) {
      songInfo = ' — <strong>' + this.esc(data.track) + '</strong>' +
        (data.artist ? ' by ' + this.esc(data.artist) : '');
    }
    this.showToast('join', '🎧',
      '<strong>' + this.esc(data.username) + '</strong> started streaming!' + songInfo);
  },

  // ========== FIRST BLOOD ANIMATION ==========
  playFirstBlood: function (data) {
    var banner = document.createElement('div');
    banner.className = 'room-event-banner';
    banner.innerHTML = '🌅 <strong>' + this.esc(data.username) + '</strong> is the first streamer today!';
    this.overlay.appendChild(banner);

    setTimeout(function () {
      if (banner.parentNode) banner.remove();
    }, 4500);

    this.spawnConfetti(25);
  },

  // ========== STREAM COUNTED ANIMATION ==========
  playStreamCounted: function (data) {
    // Pulse the stream counter
    var counter = document.getElementById('streamCounter');
    if (counter) {
      counter.classList.add('room-stream-counter--pulse');
      setTimeout(function () {
        counter.classList.remove('room-stream-counter--pulse');
      }, 1000);
    }

    // Show a subtle toast with points info
    var ptsLabel = data.points ? ' <span class="room-toast-points">+' + data.points + ' pts</span>' : '';
    this.showToast('stream', '▶',
      '<strong>' + this.esc(data.username) + '</strong> +1 stream — ' +
      '<strong>' + this.esc(data.track) + '</strong>' +
      (data.artist ? ' by ' + this.esc(data.artist) : '') +
      ptsLabel +
      ' <span class="room-toast-duration">(' + data.duration + 's)</span>');
  },

  // ========== ENERGY THRESHOLD ANIMATION ==========
  playEnergy: function (data) {
    this.showToast('energy', '⚡',
      'Room energy at <strong>' + data.count + '</strong> listeners!');

    this.spawnConfetti(15);
  },

  // ========== STREAM MILESTONE CELEBRATION ==========
  playStreamMilestone: function (data) {
    var self = this;
    var totalStreams = data.totalStreams || 0;

    // Big celebration banner
    var banner = document.createElement('div');
    banner.className = 'room-twin-banner';
    banner.innerHTML =
      '<div class="room-twin-glow"></div>' +
      '<div class="room-twin-content">' +
        '<div class="room-twin-notes">' +
          '<span class="room-twin-note room-twin-note--1">🎉</span>' +
          '<span class="room-twin-note room-twin-note--2">🔥</span>' +
          '<span class="room-twin-note room-twin-note--3">🎉</span>' +
          '<span class="room-twin-note room-twin-note--4">🔥</span>' +
        '</div>' +
        '<div class="room-twin-streak">' +
          '<span class="room-twin-streak-x">' + totalStreams.toLocaleString() + '</span>' +
          '<span class="room-twin-streak-label">STREAMS</span>' +
        '</div>' +
        '<div class="room-twin-label">🎊 MILESTONE REACHED 🎊</div>' +
        '<div class="room-twin-song">' +
          '<span class="room-twin-song-title">Keep streaming! Next milestone at ' +
            (totalStreams + 100).toLocaleString() + '</span>' +
        '</div>' +
        '<div class="room-twin-eq">' +
          '<div class="room-twin-eq-bar" style="--teq-speed:0.3s;--teq-max:24px;"></div>' +
          '<div class="room-twin-eq-bar" style="--teq-speed:0.45s;--teq-max:32px;"></div>' +
          '<div class="room-twin-eq-bar" style="--teq-speed:0.25s;--teq-max:20px;"></div>' +
          '<div class="room-twin-eq-bar" style="--teq-speed:0.5s;--teq-max:28px;"></div>' +
          '<div class="room-twin-eq-bar" style="--teq-speed:0.35s;--teq-max:36px;"></div>' +
          '<div class="room-twin-eq-bar" style="--teq-speed:0.4s;--teq-max:22px;"></div>' +
          '<div class="room-twin-eq-bar" style="--teq-speed:0.28s;--teq-max:30px;"></div>' +
        '</div>' +
      '</div>';

    this.overlay.appendChild(banner);

    // Screen shake
    document.body.classList.add('room-screen-shake');
    setTimeout(function () {
      document.body.classList.remove('room-screen-shake');
    }, 600);

    // Large confetti burst
    this.spawnConfetti(80);

    // Pulse the energy bar
    var energyEl = document.getElementById('statsEnergy');
    if (energyEl) {
      energyEl.classList.add('room-stats-energy--celebrate');
      setTimeout(function () {
        energyEl.classList.remove('room-stats-energy--celebrate');
      }, 3000);
    }

    // Remove banner after animation
    setTimeout(function () {
      if (banner.parentNode) {
        banner.classList.add('room-twin-banner--exit');
        setTimeout(function () {
          if (banner.parentNode) banner.remove();
        }, 600);
      }
    }, 5500);

    // Toast notification
    this.showToast('milestone', '🎊',
      '<strong>' + totalStreams.toLocaleString() + ' streams!</strong> Milestone reached! 🎉');
  },

  // ========== BONG (POKE) ANIMATION ==========
  playBong: function (data) {
    var self = this;

    // Build the center-screen bong overlay
    var bongOverlay = document.createElement('div');
    bongOverlay.className = 'room-bong-overlay';

    var initial = data.targetUsername ? data.targetUsername.charAt(0).toUpperCase() : '?';
    var targetAvatarColor = data.targetAvatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';

    bongOverlay.innerHTML =
      '<div class="room-bong-backdrop"></div>' +
      '<div class="room-bong-scene">' +
        '<div class="room-bong-aura"></div>' +
        '<div class="room-bong-avatar" style="background:' + targetAvatarColor + ';">' +
          '<span>' + initial + '</span>' +
        '</div>' +
        '<div class="room-bong-lightstick">' +
          '<div class="room-bong-lightstick-trail"></div>' +
          '<img class="room-bong-lightstick-img" src="assets/logo/lightstick.png" alt="BLACKPINK lightstick">' +
        '</div>' +
        '<div class="room-bong-impact"></div>' +
        '<div class="room-bong-shockwave"></div>' +
        '<div class="room-bong-sparks">' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
        '</div>' +
        '<div class="room-bong-text">' +
          '<strong>' + this.esc(data.senderUsername) + '</strong> bonged you!' +
        '</div>' +
      '</div>';

    this.overlay.appendChild(bongOverlay);

    // Screen shake on the strike frame
    setTimeout(function () {
      document.body.classList.add('room-screen-shake');
      setTimeout(function () {
        document.body.classList.remove('room-screen-shake');
      }, 520);
    }, 640);

    // Confetti bursts synced with impact + rebound
    setTimeout(function () {
      self.spawnConfetti(24);
    }, 640);
    setTimeout(function () {
      self.spawnConfetti(12);
    }, 920);

    // Remove after animation
    setTimeout(function () {
      if (bongOverlay.parentNode) {
        bongOverlay.classList.add('room-bong-overlay--exit');
        setTimeout(function () {
          if (bongOverlay.parentNode) bongOverlay.remove();
        }, 450);
      }
    }, 3800);
  },

  promptBongBack: function (data) {
    var self = this;
    if (!data || !data.senderPhoneNumber || !data.senderUsername) return;

    this.dismissBongBackPrompt();

    var safeName = this.esc(data.senderUsername);
    var prompt = document.createElement('div');
    prompt.className = 'room-bong-back-prompt';
    prompt.innerHTML =
      '<div class="room-bong-back-card">' +
        '<div class="room-bong-back-title">Bong <strong>' + safeName + '</strong> back?</div>' +
        '<div class="room-bong-back-actions">' +
          '<button class="room-bong-back-btn room-bong-back-btn--mercy">I will show mercy</button>' +
          '<button class="room-bong-back-btn room-bong-back-btn--bong">' +
            '<img src="assets/logo/lightstick.png" alt="Lightstick">' +
            '<span>Bong</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(prompt);
    this.bongPromptEl = prompt;

    var mercyBtn = prompt.querySelector('.room-bong-back-btn--mercy');
    var bongBtn = prompt.querySelector('.room-bong-back-btn--bong');

    if (mercyBtn) {
      mercyBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        self.dismissBongBackPrompt();
        self.showToast('bong', 'OK', 'Mercy shown to <strong>' + safeName + '</strong>.');
      });
    }

    if (bongBtn) {
      bongBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        self.dismissBongBackPrompt();
        if (ROOM.Activity && ROOM.Activity.sendBongBack) {
          ROOM.Activity.sendBongBack({
            targetPhoneNumber: data.senderPhoneNumber,
            targetUsername: data.senderUsername,
            targetAvatarColor: data.senderAvatarColor
          });
        }
      });
    }

    this.bongPromptTimer = setTimeout(function () {
      self.dismissBongBackPrompt();
    }, 9000);
  },

  dismissBongBackPrompt: function () {
    if (this.bongPromptTimer) {
      clearTimeout(this.bongPromptTimer);
      this.bongPromptTimer = null;
    }

    if (!this.bongPromptEl) return;
    var prompt = this.bongPromptEl;
    this.bongPromptEl = null;
    prompt.classList.add('room-bong-back-prompt--exit');
    setTimeout(function () {
      if (prompt.parentNode) prompt.remove();
    }, 220);
  },

  // ========== BONG BACK (COUNTER) ANIMATION ==========
  playBongBack: function (data) {
    var self = this;
    var bongOverlay = document.createElement('div');
    bongOverlay.className = 'room-bong-overlay room-bong-overlay--counter';

    var initial = data.targetUsername ? data.targetUsername.charAt(0).toUpperCase() : '?';
    var targetAvatarColor = data.targetAvatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';

    bongOverlay.innerHTML =
      '<div class="room-bong-backdrop"></div>' +
      '<div class="room-bong-scene room-bong-scene--counter">' +
        '<div class="room-bong-riposte-badge">COUNTER BONG</div>' +
        '<div class="room-bong-aura"></div>' +
        '<div class="room-bong-avatar" style="background:' + targetAvatarColor + ';">' +
          '<span>' + initial + '</span>' +
        '</div>' +
        '<div class="room-bong-lightstick room-bong-lightstick--counter">' +
          '<div class="room-bong-lightstick-trail"></div>' +
          '<img class="room-bong-lightstick-img" src="assets/logo/Jennie_lightstick.png" alt="BLACKPINK lightstick">' +
        '</div>' +
        '<div class="room-bong-impact room-bong-impact--counter"></div>' +
        '<div class="room-bong-shockwave room-bong-shockwave--counter"></div>' +
        '<div class="room-bong-sparks">' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
          '<span class="room-bong-spark"></span>' +
        '</div>' +
        '<div class="room-bong-text room-bong-text--counter">' +
          'you got bonged back!' +
        '</div>' +
      '</div>';

    this.overlay.appendChild(bongOverlay);

    setTimeout(function () {
      document.body.classList.add('room-screen-shake');
      setTimeout(function () {
        document.body.classList.remove('room-screen-shake');
      }, 420);
    }, 520);

    setTimeout(function () {
      document.body.classList.add('room-screen-shake');
      setTimeout(function () {
        document.body.classList.remove('room-screen-shake');
      }, 320);
    }, 760);

    setTimeout(function () {
      self.spawnConfetti(30);
    }, 520);
    setTimeout(function () {
      self.spawnConfetti(18);
    }, 860);

    setTimeout(function () {
      if (bongOverlay.parentNode) {
        bongOverlay.classList.add('room-bong-overlay--exit');
        setTimeout(function () {
          if (bongOverlay.parentNode) bongOverlay.remove();
        }, 420);
      }
    }, 3600);
  },

  // ========== CONFETTI ==========
  spawnConfetti: function (count) {
    if (!this.overlay) return;

    var colors = ['#f7a6b9', '#ffc107', '#25D366', '#FA5BFF', '#fff', '#fcd5de'];
    var overlay = this.overlay;

    for (var i = 0; i < count; i++) {
      var confetti = document.createElement('div');
      confetti.className = 'room-confetti';
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = (Math.random() * 100) + '%';
      confetti.style.top = '-20px';
      confetti.style.setProperty('--cf-speed', (2 + Math.random() * 2) + 's');
      confetti.style.setProperty('--cf-delay', (Math.random() * 0.5) + 's');
      confetti.style.setProperty('--cf-x', '0px');
      confetti.style.setProperty('--cf-drift', (Math.random() * 100 - 50) + 'px');
      confetti.style.setProperty('--cf-rot', (Math.random() * 720 + 360) + 'deg');
      confetti.style.width = (4 + Math.random() * 6) + 'px';
      confetti.style.height = (6 + Math.random() * 8) + 'px';
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';

      overlay.appendChild(confetti);

      (function (el) {
        setTimeout(function () {
          if (el.parentNode) el.remove();
        }, 4500);
      })(confetti);
    }
  },

  // ========== TOAST NOTIFICATIONS ==========
  showToast: function (type, icon, html) {
    if (!this.toastContainer) return;

    var toast = document.createElement('div');
    toast.className = 'room-toast room-toast--' + type;
    toast.innerHTML =
      '<div class="room-toast-icon">' + icon + '</div>' +
      '<div class="room-toast-text">' + html + '</div>';

    this.toastContainer.appendChild(toast);

    // Remove after animation
    setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 5000);

    // Keep max 4 toasts
    var toasts = this.toastContainer.querySelectorAll('.room-toast');
    while (toasts.length > 4) {
      toasts[0].remove();
      toasts = this.toastContainer.querySelectorAll('.room-toast');
    }
  },

  formatMilestone: function (mins) {
    if (mins >= 1000) return (mins / 1000) + 'K';
    return mins.toString();
  },

  esc: function (text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
};
