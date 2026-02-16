/**
 * Room Events Engine
 * Detects and dispatches mini events (overtakes, milestones, same song, etc.)
 */

window.ROOM = window.ROOM || {};

ROOM.Events = {
  sameSongCooldown: {},
  lastEnergyThreshold: 0,
  energyThresholds: [3, 5, 8, 10, 15, 20],
  sameSongInterval: null,
  mostPlayedInterval: null,

  init: function () {
    var self = this;

    // Periodic fallback — refreshUI already triggers these on participant changes
    // with a 2s debounce, so these just catch edge cases
    this.sameSongInterval = setInterval(function () {
      ROOM.LastFM && ROOM.LastFM.detectSameSong && ROOM.LastFM.detectSameSong();
    }, 30000);

    this.mostPlayedInterval = setInterval(function () {
      ROOM.LastFM && ROOM.LastFM.calculateMostPlayed && ROOM.LastFM.calculateMostPlayed();
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

  updateEnergy: function (onlineCount) {
    // Update energy meter
    var fill = document.getElementById('energyFill');
    if (fill) {
      var maxEnergy = 20;
      var percentage = Math.min((onlineCount / maxEnergy) * 100, 100);
      fill.style.width = percentage + '%';
    }

    // Check energy thresholds
    for (var i = 0; i < this.energyThresholds.length; i++) {
      var threshold = this.energyThresholds[i];
      if (onlineCount >= threshold && this.lastEnergyThreshold < threshold) {
        this.lastEnergyThreshold = threshold;

        // Only the first user to cross fires the event
        if (ROOM.currentUser) {
          ROOM.Firebase.fireEvent('energy', {
            count: onlineCount,
            threshold: threshold
          });
        }
        break;
      }
    }

    if (onlineCount < this.lastEnergyThreshold) {
      // Reset when users drop below
      for (var j = this.energyThresholds.length - 1; j >= 0; j--) {
        if (onlineCount >= this.energyThresholds[j]) {
          this.lastEnergyThreshold = this.energyThresholds[j];
          break;
        }
        if (j === 0) this.lastEnergyThreshold = 0;
      }
    }
  },

  destroy: function () {
    if (this.sameSongInterval) clearInterval(this.sameSongInterval);
    if (this.mostPlayedInterval) clearInterval(this.mostPlayedInterval);
  }
};
