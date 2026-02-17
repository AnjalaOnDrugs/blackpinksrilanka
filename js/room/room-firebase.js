/**
 * Room Data Service (Convex Backend)
 * Replaces Firestore with Convex for room data, participants, and events.
 * Maintains the same ROOM.Firebase API surface so other modules work unchanged.
 */

window.ROOM = window.ROOM || {};

ROOM.Firebase = {
  participantsCache: [],
  rawParticipantsCache: [],
  cleanupInterval: null,
  unsubscribers: [],
  roomId: null,
  _initTimestamp: null,
  _lastfmDebounceTimer: null,

  init: function (roomId) {
    this.roomId = roomId;
    this._initTimestamp = Date.now();

    // Initialize Convex client
    ConvexService.init(CONFIG.convexUrl);

    // Ensure room document exists
    ConvexService.mutation('rooms:ensureRoom', { roomId: roomId });

    var self = this;

    // 1. Subscribe to participants (drives leaderboard + activity)
    var unsub1 = ConvexService.watch(
      'participants:listByRoom',
      { roomId: roomId },
      function (participants) {
        self.rawParticipantsCache = participants || [];
        self.refreshUI();
      }
    );

    // Start periodic cleanup (every 5s) to check for stale users who closed browser
    this.cleanupInterval = setInterval(function () {
      self.refreshUI();
    }, 5000);

    // 2. Subscribe to events (drives mini event animations)
    var eventSince = this._initTimestamp;
    var unsub2 = ConvexService.watch(
      'events:listRecent',
      { roomId: roomId, since: eventSince },
      function (events) {
        if (!events) return;
        events.forEach(function (evt) {
          // Only handle events created after init (don't replay old events)
          if (evt.createdAt > self._initTimestamp) {
            // Don't replay events older than 10 seconds
            var now = Date.now();
            if (now - evt.createdAt < 10000) {
              if (ROOM.Events && ROOM.Events.handleEvent) {
                ROOM.Events.handleEvent({
                  type: evt.type,
                  data: evt.data,
                  createdAt: { seconds: evt.createdAt / 1000 }
                });
              }
            }
          }
        });
      }
    );

    // 3. Subscribe to stream counts by platform (drives stats card)
    var unsub3 = ConvexService.watch(
      'streams:getRoomStreamsByPlatform',
      { roomId: roomId },
      function (data) {
        if (!data) return;
        var ytEl = document.getElementById('ytStreamCount');
        var spEl = document.getElementById('spStreamCount');
        if (ytEl) ytEl.textContent = (data.youtube || 0).toLocaleString();
        if (spEl) spEl.textContent = (data.spotify || 0).toLocaleString();

        // Update energy bar (fills per 100 streams)
        if (ROOM.Events && ROOM.Events.updateStreamEnergy) {
          ROOM.Events.updateStreamEnergy(data.total || 0);
        }
      }
    );

    // 3b. Subscribe to current user's verified stream counts (drives verified card + breakdown)
    var unsub3b = ConvexService.watch(
      'streams:getUserStreamCounts',
      { roomId: roomId, phoneNumber: ROOM.currentUser.phoneNumber },
      function (data) {
        if (!data) return;

        var totalEl = document.getElementById('streamCountNumber');
        if (totalEl) totalEl.textContent = (data.totalStreams || 0).toLocaleString();

        var bMainTotal = document.getElementById('breakdownMainTotal');
        var bMainSp = document.getElementById('breakdownMainSpotify');
        var bMainYt = document.getElementById('breakdownMainYoutube');
        var bMainOther = document.getElementById('breakdownMainOther');
        var bBp = document.getElementById('breakdownBlackpink');
        var bOther = document.getElementById('breakdownOther');

        if (bMainTotal) bMainTotal.textContent = (data.totalStreams || 0).toLocaleString();
        if (bMainSp) bMainSp.textContent = (data.mainSpotify || 0).toLocaleString();
        if (bMainYt) bMainYt.textContent = (data.mainYoutube || 0).toLocaleString();
        if (bMainOther) bMainOther.textContent = (data.mainOther || 0).toLocaleString();
        if (bBp) bBp.textContent = (data.totalBlackpink || 0).toLocaleString();
        if (bOther) bOther.textContent = (data.totalOther || 0).toLocaleString();
      }
    );

    // 4. Subscribe to chat messages (Convex fallback when Agora unavailable)
    var msgSince = this._initTimestamp;
    var unsub4 = ConvexService.watch(
      'messages:listRecent',
      { roomId: roomId, since: msgSince },
      function (messages) {
        if (!messages) return;
        messages.forEach(function (msg) {
          // Only display messages from other users created after init
          if (msg.createdAt > self._initTimestamp &&
            msg.userId !== ROOM.currentUser.phoneNumber) {
            if (ROOM.Chat && ROOM.Chat.displayMessage) {
              ROOM.Chat.displayMessage(msg);
            }
          }
        });
      }
    );

    this.unsubscribers.push(unsub1, unsub2, unsub3, unsub3b, unsub4);
  },

  getParticipants: function () {
    return this.participantsCache;
  },

  joinRoom: function (userData) {
    var self = this;
    var colors = [
      'linear-gradient(135deg, #f7a6b9, #e8758a)',
      'linear-gradient(135deg, #25D366, #1da851)',
      'linear-gradient(135deg, #FA5BFF, #c44fd4)',
      'linear-gradient(135deg, #ffc107, #e0a800)',
      'linear-gradient(135deg, #64B5F6, #1976D2)',
      'linear-gradient(135deg, #FF7043, #D84315)',
      'linear-gradient(135deg, #AB47BC, #7B1FA2)',
      'linear-gradient(135deg, #26A69A, #00897B)'
    ];
    var randomColor = colors[Math.floor(Math.random() * colors.length)];

    return ConvexService.mutation('participants:joinRoom', {
      roomId: this.roomId,
      phoneNumber: userData.phoneNumber,
      username: userData.username,
      lastfmUsername: userData.lastfmUsername || undefined,
      avatarColor: randomColor
    }).then(function () {
      return self.fireEvent('join', { username: userData.username });
    });
  },

  leaveRoom: function (phoneNumber) {
    return ConvexService.mutation('participants:leaveRoom', {
      roomId: this.roomId,
      phoneNumber: phoneNumber
    });
  },

  heartbeat: function (phoneNumber) {
    return ConvexService.mutation('participants:heartbeat', {
      roomId: this.roomId,
      phoneNumber: phoneNumber
    });
  },

  updateParticipantTrack: function (phoneNumber, trackData) {
    return ConvexService.mutation('participants:updateTrack', {
      roomId: this.roomId,
      phoneNumber: phoneNumber,
      trackData: trackData
    });
  },

  updateParticipantMinutes: function (phoneNumber, totalMinutes) {
    return ConvexService.mutation('participants:updateMinutes', {
      roomId: this.roomId,
      phoneNumber: phoneNumber,
      totalMinutes: totalMinutes
    });
  },

  updateLastfmUsername: function (phoneNumber, lastfmUsername) {
    // Update in room participants
    ConvexService.mutation('participants:updateLastfmUsername', {
      roomId: this.roomId,
      phoneNumber: phoneNumber,
      lastfmUsername: lastfmUsername
    });
    // Also update in users collection for persistence
    return ConvexService.mutation('users:updateLastfmUsername', {
      phoneNumber: phoneNumber,
      lastfmUsername: lastfmUsername
    });
  },

  fireEvent: function (type, data) {
    return ConvexService.mutation('events:fireEvent', {
      roomId: this.roomId,
      type: type,
      data: data
    });
  },

  addMilestone: function (phoneNumber, milestone) {
    return ConvexService.mutation('participants:addMilestone', {
      roomId: this.roomId,
      phoneNumber: phoneNumber,
      milestone: milestone
    });
  },

  sendChatMessage: function (msgData) {
    return ConvexService.mutation('messages:send', {
      roomId: this.roomId,
      type: msgData.type,
      userId: ROOM.currentUser.phoneNumber,
      username: msgData.username,
      text: msgData.text || null,
      emoji: msgData.emoji || null,
      emojiName: msgData.emojiName || null,
      color: msgData.color,
      timestamp: msgData.timestamp
    });
  },

  destroy: function () {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.unsubscribers.forEach(function (unsub) {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribers = [];
    ConvexService.destroy();
  },

  refreshUI: function () {
    var self = this;
    var now = Date.now();

    // Process raw participants to handle timeouts
    this.participantsCache = (this.rawParticipantsCache || []).map(function (p) {
      // Clone participant data to avoid mutating raw cache directly
      var processed = Object.assign({}, p); // Shallow clone participant object
      processed.data = Object.assign({}, p.data); // Shallow clone data object

      // Check for stale heartbeat (allow 45s grace period, heartbeat is 30s)
      if (processed.data.isOnline) {
        var timeSinceLastSeen = now - (processed.data.lastSeen || 0);
        if (timeSinceLastSeen > 45000) {
          processed.data.isOnline = false;
        }
      }
      return processed;
    });

    // Update online count
    var onlineCount = this.participantsCache.filter(function (p) {
      return p.data.isOnline;
    }).length;
    var countEl = document.getElementById('onlineCount');
    if (countEl) countEl.textContent = onlineCount + ' online';

    // Notify leaderboard and activity
    if (ROOM.Leaderboard && ROOM.Leaderboard.update) {
      ROOM.Leaderboard.update(this.participantsCache);
    }
    if (ROOM.Activity && ROOM.Activity.update) {
      ROOM.Activity.update(this.participantsCache);
    }

    // Debounce twinning detection (doesn't need to run on every heartbeat)
    clearTimeout(this._lastfmDebounceTimer);
    this._lastfmDebounceTimer = setTimeout(function () {
      if (ROOM.LastFM && ROOM.LastFM.detectSameSong) {
        ROOM.LastFM.detectSameSong();
      }
    }, 2000);
  }
};
