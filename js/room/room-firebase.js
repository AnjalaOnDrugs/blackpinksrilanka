/**
 * Room Data Service (Convex Backend + Firebase RTDB Presence)
 * Convex handles room data, participants, and events.
 * Firebase RTDB handles real-time presence (online/offline) via onDisconnect().
 * Maintains the same ROOM.Firebase API surface so other modules work unchanged.
 */

window.ROOM = window.ROOM || {};

ROOM.Firebase = {
  participantsCache: [],
  rawParticipantsCache: [],
  _tracksCache: {},              // phoneNumber → currentTrack (separate subscription)
  unsubscribers: [],
  roomId: null,
  _initTimestamp: null,
  _lastfmDebounceTimer: null,
  _processedEventIds: {},
  _presenceChangeHandler: null,
  _initialSyncTimer: null,       // short-lived timer to catch initial data race
  _pfpCache: {},
  _lastPhoneHash: '',
  _unsubPfps: null,

  init: function (roomId) {
    this.roomId = roomId;
    this._initTimestamp = Date.now();

    // Initialize Convex client
    ConvexService.init(CONFIG.convexUrl);

    // Ensure room document exists
    ConvexService.mutation('rooms:ensureRoom', { roomId: roomId });

    var self = this;

    // 1. Subscribe to participants (drives leaderboard + activity)
    // NOTE: currentTrack is excluded from this query to reduce bandwidth.
    // Track data comes from the separate listTracks subscription below.
    self._pfpCache = {};
    self._lastPhoneHash = '';
    var unsub1 = ConvexService.watch(
      'participants:listByRoom',
      { roomId: roomId },
      function (participants) {
        self.rawParticipantsCache = participants || [];

        var phoneNumbers = self.rawParticipantsCache.map(function (p) { return p.id; }).sort();
        var phoneHash = phoneNumbers.join(',');
        if (self._lastPhoneHash !== phoneHash) {
          self._lastPhoneHash = phoneHash;
          if (self._unsubPfps) self._unsubPfps();
          self._unsubPfps = ConvexService.watch('users:getProfilePictures', { roomId: roomId, phoneNumbers: phoneNumbers }, function (pfps) {
            if (!pfps) return;
            for (var i = 0; i < pfps.length; i++) {
              self._pfpCache[pfps[i].phoneNumber] = pfps[i].profilePicture;
            }
            self.refreshUI();
          });
        }

        self.refreshUI();
      }
    );

    // 1a. Subscribe to track data separately (lightweight, changes often)
    var unsub1a = ConvexService.watch(
      'participants:listTracks',
      { roomId: roomId },
      function (tracks) {
        if (!tracks) return;
        self._tracksCache = {};
        for (var i = 0; i < tracks.length; i++) {
          self._tracksCache[tracks[i].phoneNumber] = tracks[i].currentTrack;
        }
        self.refreshUI();
      }
    );

    // 1b. Listen for presence changes from Firebase RTDB
    // When any user's online status changes, re-merge and refresh UI
    this._presenceChangeHandler = function () {
      self.refreshUI();
    };
    ROOM.Presence.onPresenceChange(this._presenceChangeHandler);

    // 1c. Initial sync: Convex subscription and RTDB presence arrive asynchronously.
    // The first refreshUI() from either source may run before the other has data,
    // resulting in an empty or incomplete render. Run a few catch-up refreshes
    // during the first 6 seconds to ensure the UI renders once both sources are ready.
    var syncCount = 0;
    this._initialSyncTimer = setInterval(function () {
      syncCount++;
      if (self.rawParticipantsCache && self.rawParticipantsCache.length > 0) {
        self.refreshUI();
      }
      // Stop after 6 attempts (6 seconds) — by then both sources should have delivered
      if (syncCount >= 6) {
        clearInterval(self._initialSyncTimer);
        self._initialSyncTimer = null;
      }
    }, 1000);

    // 2. Subscribe to events (drives mini event animations)
    var isInitialEventLoad = true;
    var unsub2 = ConvexService.watch(
      'events:listRecent',
      { roomId: roomId, since: this._initTimestamp },
      function (events) {
        if (!events) return;
        events.forEach(function (evt) {
          // Skip events we've already processed (watch fires with full list on every update)
          if (evt._id && self._processedEventIds[evt._id]) return;

          // Only handle new events avoiding all client-server clock drift issues
          if (!isInitialEventLoad) {
            if (ROOM.Events && ROOM.Events.handleEvent) {
              ROOM.Events.handleEvent({
                type: evt.type,
                data: evt.data,
                createdAt: { seconds: evt.createdAt / 1000 }
              });
            }
          }

          // Mark as processed
          if (evt._id) {
            self._processedEventIds[evt._id] = true;
          }
        });
        isInitialEventLoad = false;
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

        // Update points display
        var ptsEl = document.getElementById('breakdownPoints');
        if (ptsEl) ptsEl.textContent = (data.totalPoints || 0).toLocaleString();
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

    // 5. Subscribe to active listen-along events (for late joiners)
    var unsub5 = ConvexService.watch(
      'listenAlong:getActiveListenAlong',
      { roomId: roomId },
      function (event) {
        if (event && event.status === 'active') {
          if (ROOM.ListenAlong && ROOM.ListenAlong.handleActiveEvent) {
            ROOM.ListenAlong.handleActiveEvent(event);
          }
        }
      }
    );

    // 6. Subscribe to active Fill the Map events (for late joiners)
    var unsub6 = ConvexService.watch(
      'fillTheMap:getActiveFillTheMap',
      { roomId: roomId },
      function (event) {
        if (event && event.status === 'active') {
          if (ROOM.FillMap && ROOM.FillMap.handleActiveEvent) {
            ROOM.FillMap.handleActiveEvent(event);
          }
        }
      }
    );

    // 7. Subscribe to active Run the Playlist events for this user (personal event)
    var unsub7 = ConvexService.watch(
      'runPlaylist:getActiveRunPlaylist',
      { roomId: roomId, phoneNumber: ROOM.currentUser.phoneNumber },
      function (event) {
        if (event && event.status === 'active') {
          if (ROOM.RunPlaylist && ROOM.RunPlaylist._handleActiveEvent) {
            ROOM.RunPlaylist._handleActiveEvent(event);
          }
        }
      }
    );

    // 8. Subscribe to active Vroom race events (late-join + live progress)
    // vroom_progress events are no longer broadcast via the events table —
    // this subscription drives live lane updates directly from the vroom document.
    var unsub8 = ConvexService.watch(
      'vroom:getActiveVroom',
      { roomId: roomId },
      function (event) {
        if (event && event.status === 'active') {
          if (ROOM.Vroom && ROOM.Vroom._activeEventId && ROOM.Vroom._activeEventId === event._id) {
            // Already tracking this vroom — live progress update
            ROOM.Vroom.handleLiveUpdate && ROOM.Vroom.handleLiveUpdate(event);
          } else if (ROOM.Vroom && ROOM.Vroom.handleActiveEvent) {
            // New/untracked vroom — full catch-up
            ROOM.Vroom.handleActiveEvent(event);
          }
        }
      }
    );

    // 9a. Subscribe to active DJ event (for late joiners)
    var unsub9a = ConvexService.watch(
      'djEvent:getActiveDjEvent',
      { roomId: roomId },
      function (event) {
        if (event && event.status === 'active') {
          if (ROOM.DjEvent && ROOM.DjEvent.handleActiveEvent) {
            ROOM.DjEvent.handleActiveEvent(event);
          }
        }
      }
    );

    // 9. Subscribe to unread GIF messages for the current user (offline catch-up)
    var gifProcessedIds = {};
    var isInitialGifLoad = true;
    var unsub9 = ConvexService.watch(
      'gifMessages:listUnread',
      { roomId: roomId, phoneNumber: ROOM.currentUser.phoneNumber },
      function (gifs) {
        if (!gifs || !gifs.length) { isInitialGifLoad = false; return; }

        if (isInitialGifLoad) {
          // First load — pass all unread GIFs to inbox queue
          if (ROOM.Gif && ROOM.Gif.handleUnreadGifs) {
            ROOM.Gif.handleUnreadGifs(gifs);
          }
          gifs.forEach(function (g) { if (g._id) gifProcessedIds[g._id] = true; });
          isInitialGifLoad = false;
        } else {
          // Subsequent updates — play genuinely new GIFs as fallback
          // (primary delivery is via events subscription, but this catches
          //  cases where the event was missed due to network issues)
          var newInboxGifs = [];
          gifs.forEach(function (g) {
            if (g._id && !gifProcessedIds[g._id]) {
              gifProcessedIds[g._id] = true;
              newInboxGifs.push(g);
            }
          });
          if (newInboxGifs.length > 0 && ROOM.Gif && ROOM.Gif.handleUnreadGifs) {
            // playGifMessage has built-in dedup via _recentlyPlayedIds,
            // so this won't double-play GIFs already shown via the event
            ROOM.Gif.handleUnreadGifs(newInboxGifs);
          }
        }
      }
    );

    this.unsubscribers.push(unsub1, unsub1a, unsub2, unsub3, unsub3b, unsub4, unsub5, unsub6, unsub7, unsub8, unsub9a, unsub9);
    var selfRef = this;
    this.unsubscribers.push(function () { if (selfRef._unsubPfps) selfRef._unsubPfps(); });
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

  // heartbeat removed — presence is now handled by Firebase RTDB (room-presence.js)

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
    // Clear initial sync timer
    if (this._initialSyncTimer) {
      clearInterval(this._initialSyncTimer);
      this._initialSyncTimer = null;
    }
    // Unregister presence change listener
    if (this._presenceChangeHandler) {
      ROOM.Presence.offPresenceChange(this._presenceChangeHandler);
      this._presenceChangeHandler = null;
    }
    this.unsubscribers.forEach(function (unsub) {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribers = [];
    this._unsubPfps = null;
    this._pfpCache = {};
    this._lastPhoneHash = '';
    ConvexService.destroy();
  },

  refreshUI: function () {
    var self = this;

    // Merge Convex participant data with Firebase RTDB presence and track data
    var tracksCache = this._tracksCache;
    this.participantsCache = (this.rawParticipantsCache || []).map(function (p) {
      // Clone participant data to avoid mutating raw cache directly
      var processed = Object.assign({}, p); // Shallow clone participant object
      processed.data = Object.assign({}, p.data); // Shallow clone data object

      // Merge currentTrack from separate tracks subscription
      processed.data.currentTrack = tracksCache[p.id] || null;
      processed.data.profilePicture = self._pfpCache[p.id] || null;

      // Override isOnline and lastSeen from Firebase RTDB presence
      var presenceOnline = ROOM.Presence.isOnline(p.id);
      var presenceLastSeen = ROOM.Presence.getLastSeen(p.id);
      processed.data.isOnline = presenceOnline;
      if (presenceLastSeen) {
        processed.data.lastSeen = presenceLastSeen;
      }

      return processed;
    });

    // Build profile picture lookup map (phone -> dataURL)
    ROOM.profilePicMap = {};
    this.participantsCache.forEach(function (p) {
      if (p.data.profilePicture) {
        ROOM.profilePicMap[p.id] = p.data.profilePicture;
      }
    });

    // Update online count
    var onlineCount = this.participantsCache.filter(function (p) {
      return p.data.isOnline;
    }).length;
    var countEl = document.getElementById('onlineCount');
    if (countEl) countEl.textContent = onlineCount + ' online';

    // Notify leaderboard, activity, and voice module
    if (ROOM.Leaderboard && ROOM.Leaderboard.update) {
      ROOM.Leaderboard.update(this.participantsCache);
    }
    if (ROOM.Activity && ROOM.Activity.update) {
      ROOM.Activity.update(this.participantsCache);
    }
    // Refresh voice module's isTop5 status (computed client-side)
    if (ROOM.Voice && ROOM.Voice.refreshVoiceAccess) {
      ROOM.Voice.refreshVoiceAccess();
    }

    // Debounce twinning detection (doesn't need to run on every presence/data update)
    clearTimeout(this._lastfmDebounceTimer);
    this._lastfmDebounceTimer = setTimeout(function () {
      if (ROOM.LastFM && ROOM.LastFM.detectSameSong) {
        ROOM.LastFM.detectSameSong();
      }
    }, 2000);
  }
};
