/**
 * Room Events Engine
 * Detects and dispatches mini events (overtakes, milestones, same song, etc.)
 */

window.ROOM = window.ROOM || {};

ROOM.Events = {
  sameSongCooldown: {},
  sameSongInterval: null,

  init: function () {
    // Periodic fallback — refreshUI already triggers these on participant changes
    // with a 2s debounce, so these just catch edge cases
    this.sameSongInterval = setInterval(function () {
      ROOM.LastFM && ROOM.LastFM.detectSameSong && ROOM.LastFM.detectSameSong();
    }, 30000);
  },

  handleEvent: function (eventData) {
    if (!eventData || !eventData.type) return;

    // Don't replay events older than 10 seconds
    if (eventData.createdAt) {
      var eventTime = eventData.createdAt.seconds || (eventData.createdAt / 1000);
      var now = Date.now() / 1000;
      if (now - eventTime > 10) return;
    }

    switch (eventData.type) {
      case 'join':
        ROOM.Animations.playJoin(eventData.data);
        break;
      case 'overtake':
        ROOM.Animations.playOvertake(eventData.data);
        // Also show surpass notification in chat
        ROOM.Animations.showSurpassNotification(eventData.data);
        break;
      case 'milestone':
        ROOM.Animations.playMilestone(eventData.data);
        break;
      case 'same_song':
        ROOM.Animations.playSameSong(eventData.data);
        break;
      case 'session_start':
        ROOM.Animations.playSessionStart(eventData.data);
        break;
      case 'first_blood':
        ROOM.Animations.playFirstBlood(eventData.data);
        break;
      case 'energy':
        ROOM.Animations.playEnergy(eventData.data);
        break;
      case 'stream_counted':
        ROOM.Animations.playStreamCounted(eventData.data);
        break;
      case 'stream_milestone':
        ROOM.Animations.playStreamMilestone(eventData.data);
        break;
    }
  },

  checkOvertake: function (participant, newRank, oldRank, overtakenParticipant) {
    // Only fire if this is the current user doing the overtaking
    // (to prevent duplicate events from multiple clients)
    if (!ROOM.currentUser || participant.id !== ROOM.currentUser.phoneNumber) return;

    var overtakenName = overtakenParticipant ? overtakenParticipant.data.username : 'someone';

    ROOM.Firebase.fireEvent('overtake', {
      username: participant.data.username,
      overtakenUsername: overtakenName,
      newRank: newRank,
      oldRank: oldRank,
      userId: participant.id
    });
  },

  checkMilestones: function (participant) {
    // Only check for current user to prevent duplicates
    if (!ROOM.currentUser || participant.id !== ROOM.currentUser.phoneNumber) return;

    var thresholds = [100, 250, 500, 1000, 2500, 5000, 10000];
    var achieved = participant.data.milestones || [];
    var minutes = participant.data.totalMinutes || 0;

    for (var i = 0; i < thresholds.length; i++) {
      var t = thresholds[i];
      if (minutes >= t && achieved.indexOf(t) === -1) {
        ROOM.Firebase.fireEvent('milestone', {
          username: participant.data.username,
          minutes: t
        });
        ROOM.Firebase.addMilestone(participant.id, t);
      }
    }
  },

  /**
   * Update the stream energy bar in the stats card.
   * Fills based on totalStreams % 100 (resets after every 100).
   */
  updateStreamEnergy: function (totalStreams) {
    var progress = totalStreams % 100;
    var percentage = progress; // 0-99 maps to 0-99%
    var fill = document.getElementById('statsEnergyFill');
    var countEl = document.getElementById('statsEnergyCount');

    if (fill) {
      fill.style.width = percentage + '%';
    }
    if (countEl) {
      countEl.textContent = progress;
    }
  },

  destroy: function () {
    if (this.sameSongInterval) clearInterval(this.sameSongInterval);
  }
};
