/**
 * Room Run the Playlist
 * Personal hourly event: user must play 4 random BLACKPINK songs in order.
 * Spotify: 30s per song. YouTube: 60s per song.
 * 5 points awarded on completion of all 4. No partial points.
 */

window.ROOM = window.ROOM || {};

ROOM.RunPlaylist = {
  _checkInterval: null,
  _songCheckInterval: null,
  _timerInterval: null,
  _progressSaveInterval: null,
  _activeEventId: null,
  _eventData: null,
  _currentSongSeconds: 0,
  _currentSongPlatform: null,
  _isListeningToCorrectSong: false,

  _cardEl: null,
  _compactEl: null,
  _bubbleEl: null,
  _thankYouEl: null,
  _autoCompactTimer: null,
  _initialAutoCompactMs: 30000,
  _expandedAutoCompactMs: 8000,
  _capsuleSide: 'right',
  _swipeStartX: null,
  _swipeStartY: null,

  init: function () {
    this._startPeriodicCheck();
  },

  // ========== SCHEDULING ==========

  _startPeriodicCheck: function () {
    var self = this;
    var interval = CONFIG.runPlaylistCheckInterval || 60000;

    self._tryTrigger();

    this._checkInterval = setInterval(function () {
      self._tryTrigger();
    }, interval);
  },

  _tryTrigger: function () {
    if (this._activeEventId) return;
    if (!ROOM.currentUser) return;

    var chance = CONFIG.runPlaylistTriggerChance || 0.15;
    if (Math.random() > chance) return;

    // Pick 4 unique random songs from the catalog
    var allSongs = CONFIG.listenAlongSongs || [];
    if (allSongs.length < 4) return;

    var shuffled = allSongs.slice().sort(function () { return Math.random() - 0.5; });
    var picked = shuffled.slice(0, 4);

    var self = this;
    ConvexService.mutation('runPlaylist:startRunPlaylist', {
      roomId: ROOM.Firebase.roomId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      username: ROOM.currentUser.username,
      songs: picked.map(function (s) { return { name: s.name, artist: s.artist }; }),
      cooldownMs: CONFIG.runPlaylistCooldown
    }).then(function (eventId) {
      if (!eventId) return;
      // Fetch the created event
      ConvexService.query('runPlaylist:getActiveRunPlaylist', {
        roomId: ROOM.Firebase.roomId,
        phoneNumber: ROOM.currentUser.phoneNumber
      }).then(function (event) {
        if (event) {
          self._handleActiveEvent(event);
        }
      });
    });
  },

  // ========== EVENT HANDLING ==========

  _handleActiveEvent: function (event) {
    if (!event || this._activeEventId) return;
    if (event.status !== 'active') return;
    // Only show to the owning user
    if (!ROOM.currentUser || event.phoneNumber !== ROOM.currentUser.phoneNumber) return;

    this._activeEventId = event._id;
    this._eventData = {
      songs: event.songs.map(function (s) { return Object.assign({}, s); }),
      currentSongIndex: event.currentSongIndex,
      startedAt: event.startedAt
    };

    // Restore listen progress from server if available
    var currentSong = this._eventData.songs[this._eventData.currentSongIndex];
    if (currentSong && currentSong.listenedSeconds) {
      this._currentSongSeconds = currentSong.listenedSeconds;
      this._currentSongPlatform = currentSong.platform || null;
    } else {
      this._currentSongSeconds = 0;
      this._currentSongPlatform = null;
    }
    this._isListeningToCorrectSong = false;

    this._showEventCard();
    this._startSongCheck();
    this._startProgressSave();

    // Toast + push notification
    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('energy', '🎶',
        '<strong>Run the Playlist!</strong> Play 4 songs in order to earn 5 points!');
    }

    this._sendPushNotification(
      'Run the Playlist!',
      'Play 4 BLACKPINK songs in order to earn 5 points!',
      'run-playlist-start'
    );
  },

  // ========== SONG DETECTION ==========

  _startSongCheck: function () {
    var self = this;
    if (this._songCheckInterval) clearInterval(this._songCheckInterval);

    this._songCheckInterval = setInterval(function () {
      self._checkCurrentSong();
    }, CONFIG.runPlaylistSongCheckInterval || 3000);
  },

  _stopSongCheck: function () {
    if (this._songCheckInterval) {
      clearInterval(this._songCheckInterval);
      this._songCheckInterval = null;
    }
  },

  _checkCurrentSong: function () {
    if (!this._activeEventId || !this._eventData || !ROOM.currentUser) return;

    var idx = this._eventData.currentSongIndex;
    if (idx >= this._eventData.songs.length) return;

    var requiredSong = this._eventData.songs[idx];
    if (!requiredSong || requiredSong.status !== 'active') return;

    var participants = ROOM.Firebase.getParticipants();
    var me = null;
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === ROOM.currentUser.phoneNumber) {
        me = participants[i];
        break;
      }
    }

    if (!me || !me.data.currentTrack || !me.data.currentTrack.nowPlaying) {
      // Not playing anything — pause timer
      if (this._isListeningToCorrectSong) {
        this._isListeningToCorrectSong = false;
        this._pauseListenTimer();
      }
      return;
    }

    var isCorrect = ROOM.LastFM.isSameSong(
      me.data.currentTrack.name, me.data.currentTrack.artist,
      requiredSong.name, requiredSong.artist
    );

    if (isCorrect) {
      if (!this._isListeningToCorrectSong) {
        this._isListeningToCorrectSong = true;
        this._currentSongPlatform = ROOM.LastFM.detectPlatform(
          me.data.currentTrack.name,
          me.data.currentTrack.albumArt
        );
        this._startListenTimer();
        this._updateStatusBar();
      }
    } else {
      if (this._isListeningToCorrectSong) {
        this._isListeningToCorrectSong = false;
        this._pauseListenTimer();
        this._updateStatusBar();
      }
    }
  },

  // ========== LISTEN TIMER ==========

  _startListenTimer: function () {
    var self = this;
    if (this._timerInterval) return;

    this._timerInterval = setInterval(function () {
      self._tickTimer();
    }, 1000);
  },

  _pauseListenTimer: function () {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  },

  _tickTimer: function () {
    this._currentSongSeconds++;
    var required = this._currentSongPlatform === 'youtube' ? 60 : 30;
    this._updateSongProgress(this._eventData.currentSongIndex, this._currentSongSeconds, required);

    if (this._currentSongSeconds >= required) {
      this._completeSong();
    }
  },

  _completeSong: function () {
    this._pauseListenTimer();
    this._isListeningToCorrectSong = false;

    var idx = this._eventData.currentSongIndex;
    var self = this;

    ConvexService.mutation('runPlaylist:advanceSong', {
      runPlaylistId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      songIndex: idx,
      platform: this._currentSongPlatform || 'other',
      listenedSeconds: this._currentSongSeconds
    }).then(function (result) {
      if (!result) return;

      self._currentSongSeconds = 0;
      self._currentSongPlatform = null;

      if (result.pointsAwarded) {
        // All 4 songs done!
        self._eventData.songs[idx].status = 'completed';
        self._eventData.currentSongIndex = self._eventData.songs.length;
        self._handleCompletion(result.pointsAwarded);
      } else {
        // Advance to next
        self._eventData.songs[idx].status = 'completed';
        self._eventData.currentSongIndex = result.nextIndex;
        if (result.nextIndex < self._eventData.songs.length) {
          self._eventData.songs[result.nextIndex].status = 'active';
        }
        self._refreshSongList();

        if (ROOM.Animations && ROOM.Animations.showToast) {
          var nextSong = self._eventData.songs[result.nextIndex];
          ROOM.Animations.showToast('join', '✅',
            '<strong>Song completed!</strong> Now play <strong>' + self._esc(nextSong.name) + '</strong>');
        }
      }
    });
  },

  // ========== PROGRESS SAVE HEARTBEAT ==========

  _startProgressSave: function () {
    var self = this;
    if (this._progressSaveInterval) return;

    this._progressSaveInterval = setInterval(function () {
      if (!self._activeEventId || !self._isListeningToCorrectSong) return;
      if (!self._eventData || self._eventData.currentSongIndex >= self._eventData.songs.length) return;

      ConvexService.mutation('runPlaylist:updateListenProgress', {
        runPlaylistId: self._activeEventId,
        phoneNumber: ROOM.currentUser.phoneNumber,
        songIndex: self._eventData.currentSongIndex,
        platform: self._currentSongPlatform || 'other',
        listenedSeconds: self._currentSongSeconds
      });
    }, CONFIG.runPlaylistProgressSaveInterval || 5000);
  },

  _stopProgressSave: function () {
    if (this._progressSaveInterval) {
      clearInterval(this._progressSaveInterval);
      this._progressSaveInterval = null;
    }
  },

  // ========== UI: FULL VIEW CARD ==========

  _showEventCard: function () {
    var self = this;
    this._removeEventCard();

    var overlay = document.getElementById('eventOverlay');
    if (!overlay || !this._eventData) return;

    var card = document.createElement('div');
    card.className = 'room-run-playlist-card';

    card.innerHTML =
      '<div class="room-run-playlist-glow"></div>' +
      '<div class="room-run-playlist-content">' +
        '<div class="room-run-playlist-header">' +
          '<div class="room-run-playlist-badge">' +
            '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">' +
              '<path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>' +
            '</svg>' +
            ' RUN THE PLAYLIST' +
          '</div>' +
          '<div class="room-run-playlist-header-actions">' +
            '<button class="room-run-playlist-quit" id="runPlaylistQuitBtn" type="button">Quit</button>' +
            '<button class="room-run-playlist-minimize" id="runPlaylistMinimizeBtn" type="button" aria-label="Minimize">-</button>' +
          '</div>' +
        '</div>' +
        '<div class="room-run-playlist-title">Your Personal Playlist Challenge</div>' +
        '<div class="room-run-playlist-songs" id="runPlaylistSongs"></div>' +
        '<div class="room-run-playlist-status" id="runPlaylistStatus"></div>' +
        '<div class="room-run-playlist-points">' +
          '<span class="room-run-playlist-points-label">Complete all 4 songs for <strong>5 points</strong>!</span>' +
        '</div>' +
      '</div>';

    overlay.appendChild(card);
    this._cardEl = card;

    // Wire up buttons
    var quitBtn = card.querySelector('#runPlaylistQuitBtn');
    if (quitBtn) {
      quitBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._quitEvent();
      });
    }

    var minimizeBtn = card.querySelector('#runPlaylistMinimizeBtn');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._minimizeToCompact();
      });
    }

    this._refreshSongList();
    this._scheduleAutoCompact(this._initialAutoCompactMs);

    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(15);
    }
  },

  _refreshSongList: function () {
    var container = this._cardEl ? this._cardEl.querySelector('#runPlaylistSongs') : null;
    if (!container || !this._eventData) return;
    container.innerHTML = '';

    for (var i = 0; i < this._eventData.songs.length; i++) {
      var song = this._eventData.songs[i];
      var isActive = song.status === 'active';
      var isCompleted = song.status === 'completed';

      var statusIcon = isCompleted ? '✅' : isActive ? '🎵' : '🔒';
      var songClass = 'room-run-playlist-song';
      if (isActive) songClass += ' room-run-playlist-song--active';
      if (isCompleted) songClass += ' room-run-playlist-song--completed';
      if (song.status === 'pending') songClass += ' room-run-playlist-song--pending';

      var progressHtml = '';
      if (isActive) {
        var required = this._currentSongPlatform === 'youtube' ? 60 : 30;
        var pct = Math.min(100, (this._currentSongSeconds / required) * 100);
        progressHtml =
          '<div class="room-run-playlist-song-progress">' +
            '<div class="room-run-playlist-song-progress-bar">' +
              '<div class="room-run-playlist-song-progress-fill" data-song-index="' + i + '" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<span class="room-run-playlist-song-timer" data-song-timer="' + i + '">' +
              this._currentSongSeconds + 's / ' + required + 's' +
            '</span>' +
          '</div>';
      }

      var entry = document.createElement('div');
      entry.className = songClass;
      entry.innerHTML =
        '<div class="room-run-playlist-song-number">' + (i + 1) + '</div>' +
        '<div class="room-run-playlist-song-status">' + statusIcon + '</div>' +
        '<div class="room-run-playlist-song-info">' +
          '<div class="room-run-playlist-song-name">' + this._esc(song.name) + '</div>' +
          '<div class="room-run-playlist-song-artist">' + this._esc(song.artist) + '</div>' +
        '</div>' +
        progressHtml;

      container.appendChild(entry);
    }

    this._updateStatusBar();
  },

  _updateSongProgress: function (songIndex, seconds, required) {
    var fill = this._cardEl ? this._cardEl.querySelector('[data-song-index="' + songIndex + '"]') : null;
    if (fill) {
      fill.style.width = Math.min(100, (seconds / required) * 100) + '%';
    }
    var timer = this._cardEl ? this._cardEl.querySelector('[data-song-timer="' + songIndex + '"]') : null;
    if (timer) {
      timer.textContent = seconds + 's / ' + required + 's';
    }

    this._updateCapsuleProgress();
  },

  _updateStatusBar: function () {
    var statusEl = this._cardEl ? this._cardEl.querySelector('#runPlaylistStatus') : null;
    if (!statusEl || !this._eventData) return;

    var idx = this._eventData.currentSongIndex;
    if (idx >= this._eventData.songs.length) {
      statusEl.innerHTML =
        '<div class="room-run-playlist-status-icon">🎉</div>' +
        '<span><strong>All songs completed!</strong></span>';
      statusEl.classList.add('room-run-playlist-status--completed');
      return;
    }

    var currentSong = this._eventData.songs[idx];
    if (this._isListeningToCorrectSong) {
      var platform = this._currentSongPlatform === 'youtube' ? 'YouTube' : 'Spotify';
      statusEl.innerHTML =
        '<div class="room-run-playlist-status-icon">🎧</div>' +
        '<span>Listening on <strong>' + platform + '</strong>... keep playing!</span>';
      statusEl.classList.add('room-run-playlist-status--listening');
      statusEl.classList.remove('room-run-playlist-status--waiting');
    } else {
      statusEl.innerHTML =
        '<div class="room-run-playlist-status-icon">▶️</div>' +
        '<span>Play <strong>' + this._esc(currentSong.name) + '</strong> to continue!</span>';
      statusEl.classList.remove('room-run-playlist-status--listening');
      statusEl.classList.add('room-run-playlist-status--waiting');
    }
  },

  // ========== UI: COMPACT / CAPSULE VIEW ==========

  _scheduleAutoCompact: function (delayMs) {
    var self = this;
    var compactDelay = typeof delayMs === 'number' ? delayMs : this._initialAutoCompactMs;
    this._clearAutoCompactTimer();
    this._autoCompactTimer = setTimeout(function () {
      self._minimizeToCompact();
    }, compactDelay);
  },

  _clearAutoCompactTimer: function () {
    if (this._autoCompactTimer) {
      clearTimeout(this._autoCompactTimer);
      this._autoCompactTimer = null;
    }
  },

  _minimizeToCompact: function () {
    var self = this;
    if (!this._cardEl || !this._activeEventId) return;
    this._clearAutoCompactTimer();
    this._ensureCompactCard();
    this._refreshCompactFromState();
    this._cardEl.classList.add('room-run-playlist-card--minimized');
    if (this._compactEl) {
      this._compactEl.classList.add('room-run-playlist-capsule--visible');
      if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.register('run-playlist', this._compactEl, this._bubbleEl, this);
    }
    if (this._bubbleEl) {
      this._bubbleEl.classList.add('room-run-playlist-capsule-bubbles--visible');
    }
    requestAnimationFrame(function () {
      self._positionBubblesAboveCapsule();
    });
  },

  _expandFromCompact: function () {
    this._clearAutoCompactTimer();
    if (this._cardEl) {
      this._cardEl.classList.remove('room-run-playlist-card--minimized');
    }
    if (this._compactEl) {
      this._compactEl.classList.remove('room-run-playlist-capsule--visible');
      if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('run-playlist');
    }
    if (this._bubbleEl) {
      this._bubbleEl.classList.remove('room-run-playlist-capsule-bubbles--visible');
    }
    this._scheduleAutoCompact(this._expandedAutoCompactMs);
  },

  _ensureCompactCard: function () {
    var self = this;
    if (this._compactEl) return;

    var overlay = document.getElementById('eventOverlay');
    if (!overlay) return;

    var capsule = document.createElement('button');
    capsule.type = 'button';
    capsule.className = 'room-run-playlist-capsule';
    capsule.setAttribute('aria-label', 'Open Run the Playlist');
    capsule.innerHTML =
      '<div class="room-run-playlist-capsule-glare"></div>' +
      '<div class="room-run-playlist-capsule-icon">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">' +
          '<path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>' +
        '</svg>' +
      '</div>' +
      '<div class="room-run-playlist-capsule-label">RUN PLAYLIST</div>' +
      '<div class="room-run-playlist-capsule-progress" id="runPlaylistCapsuleProgress">0/4</div>' +
      '<div class="room-run-playlist-capsule-dots" id="runPlaylistCapsuleDots"></div>' +
      '<div class="room-run-playlist-capsule-glow"></div>';

    // No people bubbles needed for personal event, but keep container for CapsuleStack compatibility
    var peopleBubbles = document.createElement('div');
    peopleBubbles.className = 'room-run-playlist-capsule-bubbles';
    peopleBubbles.id = 'runPlaylistCapsuleBubbles';
    capsule._bubbleContainer = peopleBubbles;

    capsule.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (self._cardEl && !self._cardEl.classList.contains('room-run-playlist-card--minimized')) {
        self._minimizeToCompact();
      } else {
        self._expandFromCompact();
      }
    });

    this._attachSwipeListeners(capsule);

    overlay.appendChild(capsule);
    overlay.appendChild(peopleBubbles);
    this._compactEl = capsule;
    this._bubbleEl = peopleBubbles;

    if (this._capsuleSide === 'left') {
      capsule.classList.add('room-run-playlist-capsule--left');
      peopleBubbles.classList.add('room-run-playlist-capsule-bubbles--left');
    }
  },

  _removeCompactCard: function () {
    if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('run-playlist');
    if (this._bubbleEl) {
      this._bubbleEl.remove();
      this._bubbleEl = null;
    }
    if (!this._compactEl) return;
    this._compactEl.remove();
    this._compactEl = null;
  },

  _refreshCompactFromState: function () {
    if (!this._compactEl || !this._eventData) return;

    var completed = 0;
    for (var i = 0; i < this._eventData.songs.length; i++) {
      if (this._eventData.songs[i].status === 'completed') completed++;
    }

    var progressEl = this._compactEl.querySelector('#runPlaylistCapsuleProgress');
    if (progressEl) {
      progressEl.textContent = completed + '/4';
    }

    this._updateCapsuleDots();
  },

  _updateCapsuleDots: function () {
    var dotsEl = this._compactEl ? this._compactEl.querySelector('#runPlaylistCapsuleDots') : null;
    if (!dotsEl || !this._eventData) return;
    dotsEl.innerHTML = '';

    for (var i = 0; i < this._eventData.songs.length; i++) {
      var dot = document.createElement('div');
      dot.className = 'room-run-playlist-capsule-dot';
      if (this._eventData.songs[i].status === 'completed') {
        dot.classList.add('room-run-playlist-capsule-dot--completed');
      } else if (this._eventData.songs[i].status === 'active') {
        dot.classList.add('room-run-playlist-capsule-dot--active');
      }
      dotsEl.appendChild(dot);
    }
  },

  _updateCapsuleProgress: function () {
    if (!this._compactEl || !this._eventData) return;

    var completed = 0;
    for (var i = 0; i < this._eventData.songs.length; i++) {
      if (this._eventData.songs[i].status === 'completed') completed++;
    }

    var progressEl = this._compactEl.querySelector('#runPlaylistCapsuleProgress');
    if (progressEl) {
      progressEl.textContent = completed + '/4';
    }

    this._updateCapsuleDots();
  },

  _positionBubblesAboveCapsule: function () {
    if (!this._compactEl || !this._bubbleEl) return;
    var rect = this._compactEl.getBoundingClientRect();
    this._bubbleEl.style.top = (rect.top - 10) + 'px';

    if (this._capsuleSide === 'left') {
      this._bubbleEl.style.left = '12px';
      this._bubbleEl.style.right = 'auto';
    } else {
      this._bubbleEl.style.right = '12px';
      this._bubbleEl.style.left = 'auto';
    }
  },

  _attachSwipeListeners: function (el) {
    var self = this;

    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      self._swipeStartX = e.touches[0].clientX;
      self._swipeStartY = e.touches[0].clientY;
    }, { passive: true });

    el.addEventListener('touchend', function (e) {
      if (self._swipeStartX === null) return;
      var touch = e.changedTouches[0];
      var dx = touch.clientX - self._swipeStartX;
      var dy = touch.clientY - self._swipeStartY;
      self._swipeStartX = null;
      self._swipeStartY = null;

      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;

      e.preventDefault();
      e.stopPropagation();

      if (dx < 0 && self._capsuleSide === 'right') {
        self._setCapsuleSide('left');
      } else if (dx > 0 && self._capsuleSide === 'left') {
        self._setCapsuleSide('right');
      }
    });

    el.addEventListener('mousedown', function (e) {
      self._swipeStartX = e.clientX;
      self._swipeStartY = e.clientY;
    });

    el.addEventListener('mouseup', function (e) {
      if (self._swipeStartX === null) return;
      var dx = e.clientX - self._swipeStartX;
      var dy = e.clientY - self._swipeStartY;
      self._swipeStartX = null;
      self._swipeStartY = null;

      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;

      if (dx < 0 && self._capsuleSide === 'right') {
        self._setCapsuleSide('left');
      } else if (dx > 0 && self._capsuleSide === 'left') {
        self._setCapsuleSide('right');
      }
    });
  },

  _setCapsuleSide: function (side, fromStack) {
    this._capsuleSide = side;

    if (this._compactEl) {
      if (side === 'left') {
        this._compactEl.classList.add('room-run-playlist-capsule--left');
      } else {
        this._compactEl.classList.remove('room-run-playlist-capsule--left');
      }
    }

    if (this._bubbleEl) {
      if (side === 'left') {
        this._bubbleEl.classList.add('room-run-playlist-capsule-bubbles--left');
      } else {
        this._bubbleEl.classList.remove('room-run-playlist-capsule-bubbles--left');
      }
    }

    this._positionBubblesAboveCapsule();

    if (!fromStack && window.ROOM && ROOM.CapsuleStack && ROOM.CapsuleStack.setSide) {
      ROOM.CapsuleStack.setSide(side);
    }
  },

  // ========== UI: REMOVE / RESET ==========

  _removeEventCard: function () {
    this._clearAutoCompactTimer();

    if (!this._cardEl) {
      this._removeCompactCard();
      return;
    }

    var card = this._cardEl;
    this._cardEl = null;

    card.classList.add('room-run-playlist-card--exit');
    setTimeout(function () {
      if (card.parentNode) card.remove();
    }, 500);

    this._removeCompactCard();
  },

  _resetState: function () {
    this._activeEventId = null;
    this._eventData = null;
    this._currentSongSeconds = 0;
    this._currentSongPlatform = null;
    this._isListeningToCorrectSong = false;
    this._stopSongCheck();
    this._pauseListenTimer();
    this._stopProgressSave();
  },

  // ========== QUIT ==========

  _quitEvent: function () {
    if (!this._activeEventId) return;

    var self = this;
    ConvexService.mutation('runPlaylist:endRunPlaylist', {
      runPlaylistId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber
    }).then(function () {
      self._removeEventCard();
      self._resetState();

      if (ROOM.Animations && ROOM.Animations.showToast) {
        ROOM.Animations.showToast('energy', '❌',
          '<strong>Playlist challenge ended.</strong> No points awarded.');
      }
    });
  },

  // ========== COMPLETION ==========

  _handleCompletion: function (pointsAwarded) {
    this._stopSongCheck();
    this._pauseListenTimer();
    this._stopProgressSave();

    // Brief delay to show final state, then show thank you
    var self = this;
    setTimeout(function () {
      self._removeEventCard();
      self._showThankYouDialog(pointsAwarded);
      self._resetState();
    }, 1000);
  },

  // ========== UI: THANK YOU DIALOG ==========

  _showThankYouDialog: function (pointsAwarded) {
    var self = this;

    if (this._thankYouEl) {
      this._thankYouEl.remove();
      this._thankYouEl = null;
    }

    var songsHtml = '';
    if (this._eventData && this._eventData.songs) {
      for (var i = 0; i < this._eventData.songs.length; i++) {
        var s = this._eventData.songs[i];
        songsHtml +=
          '<div class="room-run-playlist-ty-song">' +
            '<span class="room-run-playlist-ty-song-check">✅</span>' +
            '<span class="room-run-playlist-ty-song-name">' + this._esc(s.name) + '</span>' +
            '<span class="room-run-playlist-ty-song-artist">' + this._esc(s.artist) + '</span>' +
          '</div>';
      }
    }

    var overlay = document.createElement('div');
    overlay.className = 'room-run-playlist-thankyou';
    overlay.innerHTML =
      '<div class="room-run-playlist-ty-backdrop"></div>' +
      '<div class="room-run-playlist-ty-modal">' +
        '<div class="room-run-playlist-ty-icon">' +
          '<svg viewBox="0 0 24 24" fill="#FA5BFF" width="56" height="56">' +
            '<path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>' +
          '</svg>' +
        '</div>' +
        '<div class="room-run-playlist-ty-title">Playlist Complete!</div>' +
        '<div class="room-run-playlist-ty-points-big">+' + (pointsAwarded || 5) + ' points earned!</div>' +
        '<div class="room-run-playlist-ty-desc">You played all 4 songs! Amazing!</div>' +
        '<div class="room-run-playlist-ty-list">' + songsHtml + '</div>' +
        '<button class="room-run-playlist-ty-close" id="runPlaylistCloseBtn">Close</button>' +
      '</div>';

    document.body.appendChild(overlay);
    this._thankYouEl = overlay;

    var closeBtn = document.getElementById('runPlaylistCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        self._dismissThankYou();
      });
    }

    setTimeout(function () {
      self._dismissThankYou();
    }, 8000);

    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(40);
    }
  },

  _dismissThankYou: function () {
    if (!this._thankYouEl) return;
    var el = this._thankYouEl;
    this._thankYouEl = null;

    el.classList.add('room-run-playlist-thankyou--exit');
    setTimeout(function () {
      if (el.parentNode) el.remove();
    }, 400);
  },

  // ========== UTILITIES ==========

  _sendPushNotification: function (title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var n = new Notification(title, {
        body: body,
        icon: 'assets/logo/lightstick.png',
        tag: tag || 'run-playlist',
        renotify: true
      });
      n.onclick = function () {
        window.focus();
        n.close();
      };
    } catch (e) { /* silent fail */ }
  },

  _esc: function (text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  },

  destroy: function () {
    if (this._checkInterval) clearInterval(this._checkInterval);
    this._clearAutoCompactTimer();
    this._stopSongCheck();
    this._pauseListenTimer();
    this._stopProgressSave();
    this._removeEventCard();
    this._removeCompactCard();
    if (this._thankYouEl) {
      this._thankYouEl.remove();
      this._thankYouEl = null;
    }
  }
};
