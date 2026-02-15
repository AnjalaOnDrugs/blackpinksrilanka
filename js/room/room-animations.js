/**
 * Room Animations
 * Visual effects for mini events: confetti, banners, toasts, bursts
 */

window.ROOM = window.ROOM || {};

ROOM.Animations = {
  overlay: null,
  toastContainer: null,

  init: function () {
    this.overlay = document.getElementById('eventOverlay');
    this.toastContainer = document.getElementById('toastContainer');
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

  // ========== SAME SONG ANIMATION ==========
  playSameSong: function (data) {
    // Add vibing glow to vinyl
    var vinyl = document.getElementById('roomVinyl');
    if (vinyl) {
      vinyl.classList.add('room-vinyl--vibing');
      setTimeout(function () {
        vinyl.classList.remove('room-vinyl--vibing');
      }, 5000);
    }

    var names = data.usernames || [];
    var count = data.count || names.length;
    var displayNames = names.length > 3 ?
      names.slice(0, 2).join(', ') + ' +' + (names.length - 2) :
      names.join(' & ');

    this.showToast('same-song', '🎵',
      '<strong>' + count + ' BLINKs</strong> vibing to <strong>' +
      this.esc(data.track) + '</strong>!');
  },

  // ========== SESSION START ANIMATION ==========
  playSessionStart: function (data) {
    this.showToast('join', '🎧',
      '<strong>' + this.esc(data.username) + '</strong> started streaming!');
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

  // ========== ENERGY THRESHOLD ANIMATION ==========
  playEnergy: function (data) {
    // Energy meter pulse
    var meter = document.getElementById('energyMeter');
    if (meter) {
      meter.style.boxShadow = '0 0 20px rgba(255, 193, 7, 0.4)';
      setTimeout(function () {
        meter.style.boxShadow = 'none';
      }, 2000);
    }

    this.showToast('energy', '⚡',
      'Room energy at <strong>' + data.count + '</strong> listeners!');

    this.spawnConfetti(15);
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
