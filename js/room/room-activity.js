/**
 * Room Live Activity Panel
 * Shows what each user is currently listening to
 */

window.ROOM = window.ROOM || {};

ROOM.Activity = {
  listEl: null,
  _bongCooldowns: {},
  lightstickAsset: 'assets/logo/lightstick.png',
  jennieLightstickAsset: 'assets/logo/Jennie_lightstick.png',

  init: function () {
    this.listEl = document.getElementById('activityList');
    this.setupActions();
  },

  setupActions: function () {
    var self = this;

    // Event delegation on the activity list
    if (!this.listEl) return;
    this.listEl.addEventListener('click', function (e) {
      // Handle actions menu toggle
      var menuToggle = e.target.closest('.room-activity-menu-toggle');
      if (menuToggle) {
        e.stopPropagation();
        self.toggleDropdown(menuToggle);
        return;
      }

      // Handle bong button click
      var bongBtn = e.target.closest('.room-activity-bong-btn');
      if (bongBtn) {
        e.stopPropagation();
        self.sendBong(bongBtn);
        return;
      }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function () {
      self.closeAllDropdowns();
    });
  },

  toggleDropdown: function (menuToggleBtn) {
    var card = menuToggleBtn.closest('.room-activity-card');
    if (!card) return;
    var isOpen = card.classList.contains('room-activity-card--menu-open');

    this.closeAllDropdowns();

    if (!isOpen) {
      card.classList.add('room-activity-card--menu-open');
      menuToggleBtn.setAttribute('aria-expanded', 'true');
    }
  },

  closeAllDropdowns: function () {
    if (!this.listEl) return;
    var openCards = this.listEl.querySelectorAll('.room-activity-card--menu-open');
    for (var i = 0; i < openCards.length; i++) {
      openCards[i].classList.remove('room-activity-card--menu-open');
    }
    var expandedToggles = this.listEl.querySelectorAll('.room-activity-menu-toggle[aria-expanded="true"]');
    for (var j = 0; j < expandedToggles.length; j++) {
      expandedToggles[j].setAttribute('aria-expanded', 'false');
    }
  },

  sendBong: function (btn) {
    var targetPhone = btn.dataset.targetPhone;
    var targetUsername = btn.dataset.targetUsername;
    var targetColor = btn.dataset.targetColor;

    // Client-side 30s cooldown per target
    var cooldownKey = targetPhone;
    if (this._bongCooldowns[cooldownKey] && Date.now() - this._bongCooldowns[cooldownKey] < 30000) {
      ROOM.Animations.showToast('bong', '⏳', 'Wait before bonging <strong>' + this.escapeHtml(targetUsername) + '</strong> again!');
      return;
    }

    this._bongCooldowns[cooldownKey] = Date.now();
    this.closeAllDropdowns();

    // Fire the bong mutation
    ConvexService.mutation('events:sendBong', {
      roomId: ROOM.Firebase.roomId,
      senderPhoneNumber: ROOM.currentUser.phoneNumber,
      senderUsername: ROOM.currentUser.username,
      senderAvatarColor: ROOM.currentUser.avatarColor,
      targetPhoneNumber: targetPhone,
      targetUsername: targetUsername,
      targetAvatarColor: targetColor
    });

    // Confirmation toast for sender
    ROOM.Animations.showToast(
      'bong',
      '<img class="room-bong-toast-icon" src="' + this.lightstickAsset + '" alt="Lightstick">',
      'You bonged <strong>' + this.escapeHtml(targetUsername) + '</strong>!'
    );
  },

  sendBongBack: function (payload) {
    var targetPhone = payload && (payload.targetPhoneNumber || payload.targetPhone);
    var targetUsername = payload && payload.targetUsername;
    var targetColor = payload && payload.targetAvatarColor;
    if (!targetPhone || !targetUsername) return;

    // Separate cooldown bucket from normal bong actions
    var cooldownKey = 'back:' + targetPhone;
    if (this._bongCooldowns[cooldownKey] && Date.now() - this._bongCooldowns[cooldownKey] < 30000) {
      ROOM.Animations.showToast('bong', '⏳', 'You just bonged back <strong>' + this.escapeHtml(targetUsername) + '</strong>!');
      return;
    }

    this._bongCooldowns[cooldownKey] = Date.now();

    ConvexService.mutation('events:sendBongBack', {
      roomId: ROOM.Firebase.roomId,
      senderPhoneNumber: ROOM.currentUser.phoneNumber,
      senderUsername: ROOM.currentUser.username,
      senderAvatarColor: ROOM.currentUser.avatarColor,
      targetPhoneNumber: targetPhone,
      targetUsername: targetUsername,
      targetAvatarColor: targetColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)'
    });

    ROOM.Animations.showToast(
      'bong',
      '<img class="room-bong-toast-icon" src="' + this.lightstickAsset + '" alt="Lightstick">',
      'Counter bong sent to <strong>' + this.escapeHtml(targetUsername) + '</strong>!'
    );
  },

  lightstickSvg: function () {
    return '<img class="room-bong-icon room-bong-icon--menu" src="' + this.lightstickAsset + '" alt="Lightstick">';
  },

  update: function (participants) {
    if (!this.listEl) return;

    var now = Date.now();
    var checkInExpiry = CONFIG.checkInInterval || 3600000;
    function presencePriority(p) {
      if (p.data.isOnline) return 0;
      if (p.data.offlineTracking && p.data.lastCheckIn && (now - p.data.lastCheckIn) < checkInExpiry) return 1;
      return 2;
    }
    // Sort: online first, then offline-tracked, then idle
    var sorted = participants.slice().sort(function (a, b) {
      var pa = presencePriority(a), pb = presencePriority(b);
      if (pa !== pb) return pa - pb;
      // Then by currently playing
      var aPlaying = a.data.currentTrack && a.data.currentTrack.nowPlaying;
      var bPlaying = b.data.currentTrack && b.data.currentTrack.nowPlaying;
      if (aPlaying && !bPlaying) return -1;
      if (!aPlaying && bPlaying) return 1;
      // Then by last seen (plain ms timestamp from Firebase RTDB presence)
      var aTime = a.data.lastSeen || 0;
      var bTime = b.data.lastSeen || 0;
      return bTime - aTime;
    });

    var html = '';
    for (var i = 0; i < sorted.length; i++) {
      html += this.renderCard(sorted[i]);
    }

    this.listEl.innerHTML = html;
  },

  renderCard: function (participant) {
    var d = participant.data;
    var color = d.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
    var av = ROOM.avatarInner({ profilePicture: d.profilePicture, username: d.username });
    var isOnline = d.isOnline;
    var isOfflineTracked = !isOnline && d.offlineTracking && d.lastCheckIn &&
      (Date.now() - d.lastCheckIn) < (CONFIG.checkInInterval || 3600000);
    var statusClass = isOnline ? 'room-activity-status--online'
      : isOfflineTracked ? 'room-activity-status--tracked'
      : 'room-activity-status--idle';

    var trackHtml = '';
    var albumArtHtml = '';

    if (d.currentTrack && d.currentTrack.name) {
      if (d.currentTrack.nowPlaying) {
        // Detect platform for badge
        var platform = ROOM.LastFM && ROOM.LastFM.detectPlatform
          ? ROOM.LastFM.detectPlatform(d.currentTrack.name, d.currentTrack.albumArt)
          : 'other';
        var platformBadge = platform === 'youtube'
          ? '<span class="room-activity-platform room-activity-platform--yt">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 00.5 6.19 31.74 31.74 0 000 12a31.74 31.74 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.84.55 9.38.55 9.38.55s7.54 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.74 31.74 0 0024 12a31.74 31.74 0 00-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></svg>' +
            '</span>'
          : platform === 'spotify'
          ? '<span class="room-activity-platform room-activity-platform--sp">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.7 1.32.42.18.48.66.24 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.99-.12-1.11-.6-.12-.48.12-.99.6-1.11 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.21 1.17zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-.96.6-1.5.3z"/></svg>' +
            '</span>'
          : '<span class="room-activity-platform room-activity-platform--other">' +
              '<img src="assets/logo/music.png" alt="" width="16" height="16" style="display:block;">' +
            '</span>';

        trackHtml =
          '<div class="room-activity-track">' +
            '<div class="room-activity-mini-eq">' +
              '<div class="room-eq-bar" style="--eq-speed:0.4s;--eq-min:2px;--eq-max:8px;"></div>' +
              '<div class="room-eq-bar" style="--eq-speed:0.3s;--eq-min:3px;--eq-max:10px;"></div>' +
              '<div class="room-eq-bar" style="--eq-speed:0.5s;--eq-min:1px;--eq-max:7px;"></div>' +
            '</div>' +
            platformBadge +
            '<span>' + this.escapeHtml(d.currentTrack.name) + ' - ' + this.escapeHtml(d.currentTrack.artist) + '</span>' +
          '</div>';
      } else {
        var timeAgo = this.getTimeAgo(d.currentTrack.timestamp);
        trackHtml =
          '<div class="room-activity-track room-activity-track--idle">' +
            '<span>Last played ' + timeAgo + '</span>' +
          '</div>';
      }

      if (d.currentTrack.albumArt) {
        albumArtHtml =
          '<div class="room-activity-albumart">' +
            '<img src="' + d.currentTrack.albumArt + '" alt="" loading="lazy">' +
          '</div>';
      }
    } else if (d.lastfmUsername) {
      trackHtml =
        '<div class="room-activity-track room-activity-track--idle">' +
          '<span>No recent activity</span>' +
        '</div>';
    } else {
      trackHtml =
        '<div class="room-activity-track room-activity-track--idle">' +
          '<span>Last.fm not linked</span>' +
        '</div>';
    }

    // Actions dropdown (not shown on own card)
    // participant.id is the phone number (set by convex/participants.ts listByRoom)
    var actionsHtml = '';
    var menuHtml = '';
    var participantPhone = participant.id;
    if (ROOM.currentUser && participantPhone && participantPhone !== ROOM.currentUser.phoneNumber) {
      actionsHtml =
        '<div class="room-activity-actions">' +
          '<button class="room-activity-menu-toggle" aria-label="Open actions" aria-expanded="false">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">' +
              '<path d="M6 9l6 6 6-6"></path>' +
            '</svg>' +
          '</button>' +
        '</div>';

      menuHtml =
        '<div class="room-activity-dropdown">' +
          '<button class="room-activity-dropdown-item room-activity-bong-btn"' +
            ' data-target-phone="' + this.escapeHtml(participantPhone) + '"' +
            ' data-target-username="' + this.escapeHtml(d.username || 'Unknown') + '"' +
            ' data-target-color="' + color + '">' +
            this.lightstickSvg() +
            '<span>Bong</span>' +
          '</button>' +
        '</div>';
    }

    return '<div class="room-activity-card" data-id="' + participant.id + '">' +
      '<div class="room-activity-card-main">' +
        '<div class="room-activity-avatar" style="' + (av.hasImage ? 'background:transparent;' : 'background:' + color + ';') + '">' +
          av.html +
          '<div class="room-activity-status ' + statusClass + '"></div>' +
        '</div>' +
        '<div class="room-activity-info">' +
          '<div class="room-activity-name">' + this.escapeHtml(d.username || 'Unknown') + '</div>' +
          trackHtml +
        '</div>' +
        albumArtHtml +
        actionsHtml +
      '</div>' +
      menuHtml +
    '</div>';
  },

  getTimeAgo: function (timestamp) {
    if (!timestamp) return 'a while ago';
    var now = Math.floor(Date.now() / 1000);
    var diff = now - timestamp;

    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  },

  // Pulse animation on a specific activity card
  pulseCard: function (participantId) {
    var el = document.querySelector('.room-activity-card[data-id="' + participantId + '"]');
    if (el) {
      el.classList.add('room-activity-card--session-start');
      setTimeout(function () {
        el.classList.remove('room-activity-card--session-start');
      }, 2000);
    }
  },

  escapeHtml: function (text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
