/**
 * Room Events Engine
 * Detects and dispatches mini events (overtakes, milestones, same song, etc.)
 */

window.ROOM = window.ROOM || {};

ROOM.CapsuleStack = {
  stack: [],
  side: 'right', // 'right' or 'left'
  register: function (capsuleId, el, bubbleEl, instance) {
    var existing = this.stack.find(function (c) { return c.id === capsuleId; });
    if (existing) {
      existing.el = el;
      existing.bubbleEl = bubbleEl;
      existing.instance = instance;
    } else {
      this.stack.push({ id: capsuleId, el: el, bubbleEl: bubbleEl, instance: instance });
      var self = this;
      if (el) {
        el.addEventListener('click', function (e) {
          var idx = self.stack.findIndex(function (c) { return c.id === capsuleId; });
          if (idx > -1 && idx !== self.stack.length - 1) {
            // Clicked a capsule that is NOT at the front
            e.preventDefault();
            e.stopPropagation();
            // Bring to front
            self.bringToFront(capsuleId);
          }
        }, true); // Use capture phase to intercept before normal button click
      }
    }

    // Sync the newly registered capsule with current side
    if (instance && typeof instance._setCapsuleSide === 'function') {
      instance._setCapsuleSide(this.side, true);
    }

    this.render();
  },
  unregister: function (capsuleId) {
    this.stack = this.stack.filter(function (c) { return c.id !== capsuleId; });
    this.render();
  },
  bringToFront: function (capsuleId) {
    var idx = this.stack.findIndex(function (c) { return c.id === capsuleId; });
    if (idx > -1 && idx !== this.stack.length - 1) {
      var capsule = this.stack.splice(idx, 1)[0];
      this.stack.push(capsule);
      this.render();
    }
  },
  setSide: function (side) {
    if (this.side === side) return;
    this.side = side;
    var self = this;
    this.stack.forEach(function (item) {
      if (item.instance && typeof item.instance._setCapsuleSide === 'function') {
        item.instance._setCapsuleSide(self.side, true);
      }
    });
  },
  render: function () {
    var total = this.stack.length;
    for (var i = 0; i < total; i++) {
      var item = this.stack[i];
      if (!item.el) continue;
      var offset = total - 1 - i;
      item.el.style.transition = 'margin 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, scale 0.4s cubic-bezier(0.4, 0, 0.2, 1), filter 0.4s ease';
      item.el.style.zIndex = Math.max(100, 191 - offset);
      if (offset > 0) {
        // Stacked behind
        item.el.style.marginTop = (offset * -60) + 'px'; // stack them higher
        item.el.style.scale = Math.max(0.8, 1 - offset * 0.08); // shrink them to create depth
        item.el.style.opacity = Math.max(0.6, 1 - offset * 0.2);
        item.el.style.filter = 'brightness(' + Math.max(0.5, 1 - offset * 0.2) + ')';
        if (item.bubbleEl) item.bubbleEl.style.display = 'none';
      } else {
        // Front capsule
        item.el.style.marginTop = '0px';
        item.el.style.scale = '1';
        item.el.style.opacity = '1';
        item.el.style.filter = 'none';
        if (item.bubbleEl) {
          // ensure it doesn't get stuck hidden
          item.bubbleEl.style.display = '';
        }
      }
    }
  }
};

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
      case 'bong':
        // Only the target user sees the full center-screen animation
        if (ROOM.currentUser && eventData.data.targetPhoneNumber === ROOM.currentUser.phoneNumber) {
          ROOM.Animations.playBong(eventData.data);
          ROOM.Animations.promptBongBack(eventData.data);
        }
        break;
      case 'bong_back':
        // Only the target user sees bong-back animation
        if (ROOM.currentUser && eventData.data.targetPhoneNumber === ROOM.currentUser.phoneNumber) {
          ROOM.Animations.playBongBack(eventData.data);
        }
        break;
      case 'listen_along_start':
        ROOM.ListenAlong && ROOM.ListenAlong.handleStart(eventData.data);
        break;
      case 'listen_along_join':
        ROOM.ListenAlong && ROOM.ListenAlong.handleJoin(eventData.data);
        break;
      case 'listen_along_end':
        ROOM.ListenAlong && ROOM.ListenAlong.handleEnd(eventData.data);
        break;
      case 'fill_map_start':
        ROOM.FillMap && ROOM.FillMap.handleStart(eventData.data);
        break;
      case 'fill_map_fill':
        ROOM.FillMap && ROOM.FillMap.handleFill(eventData.data);
        break;
      case 'fill_map_complete':
        ROOM.FillMap && ROOM.FillMap.handleComplete(eventData.data);
        break;
      case 'fill_map_failed':
        ROOM.FillMap && ROOM.FillMap.handleFailed(eventData.data);
        break;
      case 'vroom_start':
        ROOM.Vroom && ROOM.Vroom.handleStart(eventData.data);
        break;
      case 'vroom_join':
        ROOM.Vroom && ROOM.Vroom.handleJoin(eventData.data);
        break;
      case 'vroom_progress':
        ROOM.Vroom && ROOM.Vroom.handleProgress(eventData.data);
        break;
      case 'vroom_finish':
        ROOM.Vroom && ROOM.Vroom.handleFinish(eventData.data);
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
