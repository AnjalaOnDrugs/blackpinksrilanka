/**
 * Room Live Activity Panel
 * Shows what each user is currently listening to
 */

window.ROOM = window.ROOM || {};

ROOM.Activity = {
  listEl: null,

  init: function () {
    this.listEl = document.getElementById('activityList');
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
      // Then by last seen
      var aTime = a.data.lastSeen ? a.data.lastSeen.seconds : 0;
      var bTime = b.data.lastSeen ? b.data.lastSeen.seconds : 0;
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
    var initial = d.username ? d.username.charAt(0).toUpperCase() : '?';
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
        trackHtml =
          '<div class="room-activity-track">' +
            '<div class="room-activity-mini-eq">' +
              '<div class="room-eq-bar" style="--eq-speed:0.4s;--eq-min:2px;--eq-max:8px;"></div>' +
              '<div class="room-eq-bar" style="--eq-speed:0.3s;--eq-min:3px;--eq-max:10px;"></div>' +
              '<div class="room-eq-bar" style="--eq-speed:0.5s;--eq-min:1px;--eq-max:7px;"></div>' +
            '</div>' +
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

    return '<div class="room-activity-card" data-id="' + participant.id + '">' +
      '<div class="room-activity-avatar" style="background:' + color + ';">' +
        '<span>' + initial + '</span>' +
        '<div class="room-activity-status ' + statusClass + '"></div>' +
      '</div>' +
      '<div class="room-activity-info">' +
        '<div class="room-activity-name">' + this.escapeHtml(d.username || 'Unknown') + '</div>' +
        trackHtml +
      '</div>' +
      albumArtHtml +
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
