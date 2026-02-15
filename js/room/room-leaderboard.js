/**
 * Room Leaderboard
 * Renders and animates the leaderboard with FLIP technique for rank changes
 */

window.ROOM = window.ROOM || {};

ROOM.Leaderboard = {
  previousRanks: {},
  podiumEl: null,
  listEl: null,
  selfEl: null,

  init: function () {
    this.podiumEl = document.getElementById('leaderboardPodium');
    this.listEl = document.getElementById('leaderboardList');
    this.selfEl = document.getElementById('leaderboardSelf');
  },

  update: function (participants) {
    // Sort by totalMinutes descending
    var sorted = participants.slice().sort(function (a, b) {
      return (b.data.totalMinutes || 0) - (a.data.totalMinutes || 0);
    });

    // Detect overtakes
    var self = this;
    sorted.forEach(function (p, i) {
      var newRank = i + 1;
      var oldRank = self.previousRanks[p.id];

      if (oldRank && newRank < oldRank) {
        // This user climbed
        var overtakenUser = sorted[newRank]; // the person now below
        ROOM.Events && ROOM.Events.checkOvertake &&
          ROOM.Events.checkOvertake(p, newRank, oldRank, overtakenUser);
      }

      self.previousRanks[p.id] = newRank;
    });

    // Check milestones
    sorted.forEach(function (p) {
      ROOM.Events && ROOM.Events.checkMilestones && ROOM.Events.checkMilestones(p);
    });

    this.render(sorted);
  },

  render: function (sorted) {
    if (!this.podiumEl || !this.listEl) return;

    // Top 3 podium
    var podiumHtml = '';
    var top3 = sorted.slice(0, 3);

    for (var i = 0; i < top3.length; i++) {
      podiumHtml += this.renderLeader(top3[i], i + 1, false);
    }
    this.podiumEl.innerHTML = podiumHtml;

    // Rest of leaderboard (rank 4+)
    var restHtml = '';
    var rest = sorted.slice(3);
    for (var j = 0; j < rest.length; j++) {
      restHtml += this.renderLeader(rest[j], j + 4, true);
    }
    this.listEl.innerHTML = restHtml;

    // Pin current user if they're outside top visible area
    if (this.selfEl && ROOM.currentUser) {
      var selfIndex = -1;
      for (var k = 0; k < sorted.length; k++) {
        if (sorted[k].id === ROOM.currentUser.phoneNumber) {
          selfIndex = k;
          break;
        }
      }

      if (selfIndex >= 3) {
        this.selfEl.style.display = 'block';
        this.selfEl.innerHTML = this.renderLeader(sorted[selfIndex], selfIndex + 1, true, true);
      } else {
        this.selfEl.style.display = 'none';
      }
    }
  },

  renderLeader: function (participant, rank, compact, isSelf) {
    var d = participant.data;
    var rankClass = '';
    var rankContent = '';
    var badgeHtml = '';
    var streakHtml = '';

    if (rank === 1) {
      rankClass = 'room-leader--1st';
      rankContent = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>';
      badgeHtml = '<div class="room-leader-badge room-leader-badge--gold"><span>#1</span></div>';
    } else if (rank === 2) {
      rankClass = 'room-leader--2nd';
      rankContent = '<span class="room-leader-rank--silver">' + rank + '</span>';
      badgeHtml = '<div class="room-leader-badge room-leader-badge--silver"><span>#2</span></div>';
    } else if (rank === 3) {
      rankClass = 'room-leader--3rd';
      rankContent = '<span class="room-leader-rank--bronze">' + rank + '</span>';
      badgeHtml = '<div class="room-leader-badge room-leader-badge--bronze"><span>#3</span></div>';
    } else {
      rankContent = '<span class="room-leader-rank--default">' + rank + '</span>';
    }

    // Streak flame
    if (d.streakMinutes && d.streakMinutes >= 30) {
      var flameSize = d.streakMinutes >= 120 ? '🔥' : (d.streakMinutes >= 60 ? '🔥' : '🔥');
      streakHtml = '<span class="room-leader-streak">' + flameSize + '</span>';
    }

    var compactClass = compact ? ' room-leader--compact' : '';
    var selfClass = isSelf ? ' room-leader--self' : '';
    var color = d.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
    var initial = d.username ? d.username.charAt(0).toUpperCase() : '?';
    var minutes = d.totalMinutes || 0;
    var score = this.formatMinutes(minutes);

    return '<div class="room-leader ' + rankClass + compactClass + selfClass + '" data-id="' + participant.id + '">' +
      '<div class="room-leader-rank">' + rankContent + '</div>' +
      '<div class="room-leader-avatar" style="background:' + color + ';">' +
        '<span>' + initial + '</span>' +
        streakHtml +
      '</div>' +
      '<div class="room-leader-info">' +
        '<div class="room-leader-name">' + this.escapeHtml(d.username || 'Unknown') + '</div>' +
        '<div class="room-leader-score">' + score + ' streamed</div>' +
      '</div>' +
      badgeHtml +
    '</div>';
  },

  formatMinutes: function (mins) {
    if (mins >= 1440) {
      return Math.floor(mins / 60).toLocaleString() + ' hrs';
    } else if (mins >= 60) {
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      return h + 'h ' + m + 'm';
    }
    return mins.toLocaleString() + ' mins';
  },

  // Apply overtake glow animation to a specific leader card
  glowLeader: function (participantId) {
    var el = document.querySelector('.room-leader[data-id="' + participantId + '"]');
    if (el) {
      el.classList.add('room-leader--overtake-glow');
      setTimeout(function () {
        el.classList.remove('room-leader--overtake-glow');
      }, 2000);
    }
  },

  escapeHtml: function (text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
