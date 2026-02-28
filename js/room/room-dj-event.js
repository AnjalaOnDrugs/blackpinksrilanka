/**
 * Room DJ Event
 * During THE Hour, online users take turns as DJ.
 * DJ plays a song (detected via Last.fm), others play along for points and vote.
 */

window.ROOM = window.ROOM || {};

ROOM.DjEvent = {
  _activeEventId: null,
  _currentDj: null,
  _song: null,
  _hasVoted: false,
  _hasListened: false,
  _cardEl: null,
  _compactEl: null,
  _bubbleEl: null,
  _selectionTimer: null,
  _selectionCountdown: null,
  _roundTimer: null,
  _roundCountdown: null,
  _songCheckInterval: null,
  _listenCheckInterval: null,
  _capsuleSide: 'right',
  _swipeStartX: null,
  _swipeStartY: null,
  _listenersByPhone: {},
  _voteUp: 0,
  _voteDown: 0,
  _onlinePool: [],
  _djHistory: [],

  init: function () {
    // No periodic trigger — DJ event is admin-started
  },

  // ========== EVENT HANDLERS (called from room-events.js) ==========

  handleStart: function (data) {
    this._activeEventId = data.djEventId;
    this._onlinePool = data.onlinePool || [];
    this._djHistory = [data.djPhoneNumber];
    this._setCurrentDj(data);
    this._showEventCard();
  },

  handleNewDj: function (data) {
    if (!this._activeEventId) return;
    this._djHistory.push(data.djPhoneNumber);
    this._setCurrentDj(data);
    this._resetRound();
    this._updateCardForNewDj();
  },

  handleSongChosen: function (data) {
    if (!this._activeEventId) return;
    this._song = {
      name: data.songName,
      artist: data.songArtist,
      albumArt: data.albumArt
    };
    if (this._currentDj) {
      this._currentDj.songChosenAt = Date.now();
      this._currentDj.roundEndsAt = data.roundEndsAt;
    }
    this._stopSelectionTimer();
    this._updateCardForSongChosen();
    this._startRoundCountdown(data.roundEndsAt);
    this._startListenCheck();
  },

  handleListenerJoin: function (data) {
    if (!this._activeEventId) return;
    if (this._listenersByPhone[data.phoneNumber]) return;
    this._listenersByPhone[data.phoneNumber] = data;
    this._addListenerToCard(data);

    if (ROOM.currentUser && data.phoneNumber === ROOM.currentUser.phoneNumber) {
      this._hasListened = true;
      this._updateListenStatus(true);
    }
  },

  handleVote: function (data) {
    if (!this._activeEventId) return;
    this._voteUp = data.totalUp || 0;
    this._voteDown = data.totalDown || 0;
    this._updateVoteDisplay();

    if (ROOM.currentUser && data.voterPhoneNumber === ROOM.currentUser.phoneNumber) {
      this._hasVoted = true;
      this._disableVoteButtons();
    }
  },

  handleSkip: function (data) {
    if (!this._activeEventId) return;
    // Show brief skip message
    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('energy', '⏭️',
        '<strong>' + this._esc(data.djUsername) + '</strong> was skipped (no song chosen)');
    }
  },

  handleRoundEnd: function (data) {
    if (!this._activeEventId) return;
    // Brief round summary toast
    if (data.song && ROOM.Animations && ROOM.Animations.showToast) {
      var msg = '<strong>' + this._esc(data.djUsername) + '</strong> earned ' +
        '<strong>' + (data.djPoints || 0) + ' pts</strong> (' +
        (data.thumbsUp || 0) + ' 👍)';
      ROOM.Animations.showToast('energy', '🎧', msg);
    }
  },

  handleEnd: function (data) {
    this._stopAllTimers();
    this._removeEventCard();
    this._activeEventId = null;
    this._currentDj = null;
    this._song = null;
    this._onlinePool = [];
    this._djHistory = [];

    if (ROOM.Animations && ROOM.Animations.showToast) {
      var reason = data && data.reason === 'admin' ? 'ended by admin' : 'all DJs finished';
      ROOM.Animations.showToast('energy', '🎶', '<strong>DJ Event</strong> ' + reason + '!');
    }
  },

  // Called from Convex subscription for late joiners
  handleActiveEvent: function (event) {
    if (!event || this._activeEventId) return;

    this._activeEventId = event._id;
    this._onlinePool = event.onlinePool || [];
    this._djHistory = event.djHistory || [];
    this._listenersByPhone = {};
    this._voteUp = 0;
    this._voteDown = 0;

    if (event.currentDj) {
      this._currentDj = {
        phoneNumber: event.currentDj.phoneNumber,
        username: event.currentDj.username,
        avatarColor: event.currentDj.avatarColor,
        profilePicture: event.currentDj.profilePicture,
        selectedAt: event.currentDj.selectedAt
      };

      if (event.currentDj.song) {
        this._song = event.currentDj.song;
      }

      // Restore listeners
      if (event.listeners) {
        for (var i = 0; i < event.listeners.length; i++) {
          this._listenersByPhone[event.listeners[i].phoneNumber] = event.listeners[i];
        }
        // Check if current user already listened
        if (ROOM.currentUser && this._listenersByPhone[ROOM.currentUser.phoneNumber]) {
          this._hasListened = true;
        }
      }

      // Restore votes
      if (event.votes) {
        this._voteUp = event.votes.filter(function (v) { return v.vote === 'up'; }).length;
        this._voteDown = event.votes.filter(function (v) { return v.vote === 'down'; }).length;
        // Check if current user already voted
        if (ROOM.currentUser) {
          this._hasVoted = event.votes.some(function (v) {
            return v.phoneNumber === ROOM.currentUser.phoneNumber;
          });
        }
      }
    }

    this._showEventCard();

    // If song already chosen, set up round countdown
    if (this._song && this._currentDj && this._currentDj.roundEndsAt) {
      if (Date.now() < this._currentDj.roundEndsAt) {
        this._updateCardForSongChosen();
        this._startRoundCountdown(this._currentDj.roundEndsAt);
        if (!this._hasListened) {
          this._startListenCheck();
        }
      }
    } else if (this._currentDj && !this._song) {
      // Song not chosen yet — start selection timer
      var elapsed = Date.now() - this._currentDj.selectedAt;
      var timeout = (CONFIG.djEventSelectionTimeout || 60000) - elapsed;
      if (timeout > 0) {
        this._startSelectionTimer(timeout);
      }
    }
  },

  // ========== INTERNAL STATE ==========

  _setCurrentDj: function (data) {
    this._currentDj = {
      phoneNumber: data.djPhoneNumber,
      username: data.djUsername,
      avatarColor: data.djAvatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)',
      profilePicture: data.djProfilePicture,
      selectedAt: data.selectedAt || Date.now(),
      roundEndsAt: null
    };
    this._song = null;
    this._startSelectionTimer(CONFIG.djEventSelectionTimeout || 60000);
    this._startSongDetection();
  },

  _resetRound: function () {
    this._song = null;
    this._hasVoted = false;
    this._hasListened = false;
    this._listenersByPhone = {};
    this._voteUp = 0;
    this._voteDown = 0;
    this._stopRoundTimer();
    this._stopListenCheck();
    this._stopSongDetection();
  },

  // ========== SONG DETECTION (DJ's client) ==========

  _startSongDetection: function () {
    var self = this;
    this._stopSongDetection();

    if (!ROOM.currentUser || !this._currentDj) return;
    if (this._currentDj.phoneNumber !== ROOM.currentUser.phoneNumber) return;

    // DJ is the current user — detect their song
    var graceMs = CONFIG.djEventSongGracePeriod || 5000;
    var checkMs = CONFIG.djEventSongCheckInterval || 5000;

    setTimeout(function () {
      self._songCheckInterval = setInterval(function () {
        self._checkDjSong();
      }, checkMs);
      // Also check immediately after grace
      self._checkDjSong();
    }, graceMs);
  },

  _stopSongDetection: function () {
    if (this._songCheckInterval) {
      clearInterval(this._songCheckInterval);
      this._songCheckInterval = null;
    }
  },

  _checkDjSong: function () {
    if (!this._activeEventId || !ROOM.currentUser || this._song) return;
    if (!this._currentDj || this._currentDj.phoneNumber !== ROOM.currentUser.phoneNumber) return;

    var participants = ROOM.Firebase.getParticipants();
    var me = null;
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === ROOM.currentUser.phoneNumber) {
        me = participants[i];
        break;
      }
    }

    if (!me || !me.data.currentTrack || !me.data.currentTrack.nowPlaying) return;

    // Song detected!
    this._stopSongDetection();

    ConvexService.mutation('djEvent:chooseSong', {
      roomId: ROOM.Firebase.roomId,
      djEventId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      songName: me.data.currentTrack.name,
      songArtist: me.data.currentTrack.artist,
      albumArt: me.data.currentTrack.albumArt || undefined,
      roundDurationMs: CONFIG.djEventRoundDuration || 120000
    });
  },

  // ========== LISTEN DETECTION (non-DJ clients) ==========

  _startListenCheck: function () {
    var self = this;
    this._stopListenCheck();

    if (!ROOM.currentUser || !this._song) return;
    if (this._currentDj && this._currentDj.phoneNumber === ROOM.currentUser.phoneNumber) return;
    if (this._hasListened) return;

    this._listenCheckInterval = setInterval(function () {
      self._checkListen();
    }, CONFIG.djEventSongCheckInterval || 5000);
  },

  _stopListenCheck: function () {
    if (this._listenCheckInterval) {
      clearInterval(this._listenCheckInterval);
      this._listenCheckInterval = null;
    }
  },

  _checkListen: function () {
    if (!this._activeEventId || !ROOM.currentUser || this._hasListened || !this._song) return;

    var participants = ROOM.Firebase.getParticipants();
    var me = null;
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === ROOM.currentUser.phoneNumber) {
        me = participants[i];
        break;
      }
    }

    if (!me || !me.data.currentTrack || !me.data.currentTrack.nowPlaying) return;

    var isCorrectSong = ROOM.LastFM.isSameSong(
      me.data.currentTrack.name, me.data.currentTrack.artist,
      this._song.name, this._song.artist
    );
    if (!isCorrectSong) return;

    this._hasListened = true;
    this._stopListenCheck();
    this._updateListenStatus(true);

    ConvexService.mutation('djEvent:joinAsListener', {
      roomId: ROOM.Firebase.roomId,
      djEventId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      username: ROOM.currentUser.username
    });
  },

  // ========== TIMERS ==========

  _startSelectionTimer: function (timeoutMs) {
    var self = this;
    this._stopSelectionTimer();

    var endsAt = Date.now() + timeoutMs;

    function updateSelection() {
      var remaining = endsAt - Date.now();
      if (remaining <= 0) {
        clearInterval(self._selectionCountdown);
        self._selectionCountdown = null;
        self._onSelectionTimeout();
        return;
      }
      var secs = Math.ceil(remaining / 1000);
      var countdownEl = self._cardEl ? self._cardEl.querySelector('#djCountdown') : null;
      if (countdownEl) countdownEl.textContent = '0:' + (secs < 10 ? '0' : '') + secs;

      var compactCountdownEl = self._compactEl ? self._compactEl.querySelector('#djCapsuleCountdown') : null;
      if (compactCountdownEl) compactCountdownEl.textContent = '0:' + (secs < 10 ? '0' : '') + secs;
    }

    updateSelection();
    this._selectionCountdown = setInterval(updateSelection, 1000);
  },

  _stopSelectionTimer: function () {
    if (this._selectionCountdown) {
      clearInterval(this._selectionCountdown);
      this._selectionCountdown = null;
    }
  },

  _onSelectionTimeout: function () {
    if (!this._activeEventId || !this._currentDj || this._song) return;

    // Only the "leader" client triggers skip (lowest phoneNumber among online users)
    var participants = ROOM.Firebase.getParticipants();
    var onlinePhones = participants
      .filter(function (p) { return p.data.isOnline; })
      .map(function (p) { return p.id; })
      .sort();

    if (!ROOM.currentUser || onlinePhones[0] !== ROOM.currentUser.phoneNumber) return;

    ConvexService.mutation('djEvent:skipDj', {
      roomId: ROOM.Firebase.roomId,
      djEventId: this._activeEventId
    });
  },

  _startRoundCountdown: function (endsAt) {
    var self = this;
    this._stopRoundTimer();

    function updateRound() {
      var remaining = endsAt - Date.now();
      if (remaining <= 0) {
        clearInterval(self._roundCountdown);
        self._roundCountdown = null;
        self._onRoundEnd();
        return;
      }
      var mins = Math.floor(remaining / 60000);
      var secs = Math.floor((remaining % 60000) / 1000);
      var text = mins + ':' + (secs < 10 ? '0' : '') + secs;

      var countdownEl = self._cardEl ? self._cardEl.querySelector('#djCountdown') : null;
      if (countdownEl) countdownEl.textContent = text;

      var compactCountdownEl = self._compactEl ? self._compactEl.querySelector('#djCapsuleCountdown') : null;
      if (compactCountdownEl) compactCountdownEl.textContent = text;
    }

    updateRound();
    this._roundCountdown = setInterval(updateRound, 1000);
  },

  _stopRoundTimer: function () {
    if (this._roundCountdown) {
      clearInterval(this._roundCountdown);
      this._roundCountdown = null;
    }
  },

  _onRoundEnd: function () {
    if (!this._activeEventId) return;

    // Only the "leader" triggers end round
    var participants = ROOM.Firebase.getParticipants();
    var onlinePhones = participants
      .filter(function (p) { return p.data.isOnline; })
      .map(function (p) { return p.id; })
      .sort();

    if (!ROOM.currentUser || onlinePhones[0] !== ROOM.currentUser.phoneNumber) return;

    ConvexService.mutation('djEvent:endRound', {
      roomId: ROOM.Firebase.roomId,
      djEventId: this._activeEventId
    });
  },

  _stopAllTimers: function () {
    this._stopSelectionTimer();
    this._stopRoundTimer();
    this._stopSongDetection();
    this._stopListenCheck();
  },

  // ========== UI: FULL VIEW CARD ==========

  _showEventCard: function () {
    var self = this;
    this._removeEventCard();

    var isDj = ROOM.currentUser && this._currentDj &&
      this._currentDj.phoneNumber === ROOM.currentUser.phoneNumber;

    var djName = this._currentDj ? this._esc(this._currentDj.username) : '...';
    var remaining = this._onlinePool.length - this._djHistory.length;
    var total = this._onlinePool.length;

    var pic = this._currentDj ? this._currentDj.profilePicture : null;
    var color = this._currentDj ? this._currentDj.avatarColor : 'linear-gradient(135deg, #f7a6b9, #e8758a)';
    var av = ROOM.avatarInner({
      profilePicture: pic,
      username: this._currentDj ? this._currentDj.username : '?'
    });

    var card = document.createElement('div');
    card.className = 'room-dj-card';

    card.innerHTML =
      '<div class="room-dj-glow"></div>' +
      '<div class="room-dj-content">' +
      '<div class="room-dj-header">' +
      '<div class="room-dj-badge">🎧 DJ EVENT</div>' +
      '<div class="room-dj-header-actions">' +
      '<span class="room-dj-progress-label" id="djProgressLabel">' +
      (total - remaining) + '/' + total +
      '</span>' +
      '<span class="room-dj-countdown" id="djCountdown">1:00</span>' +
      '<button class="room-dj-minimize" id="djMinimizeBtn" type="button" aria-label="Minimize DJ Event">\u2013</button>' +
      '</div>' +
      '</div>' +
      '<div class="room-dj-avatar-wrap">' +
      '<div class="room-dj-avatar" id="djAvatar" style="' +
      (av.hasImage ? 'background:transparent;overflow:hidden;' : 'background:' + color + ';') + '">' +
      av.html +
      '</div>' +
      '<div class="room-dj-name" id="djName">' + djName + '</div>' +
      '<div class="room-dj-role" id="djRole">' +
      (isDj ? '🎤 You are the DJ!' : '🎧 ' + djName + ' is the DJ') +
      '</div>' +
      '</div>' +
      '<div class="room-dj-song-section" id="djSongSection">' +
      '<div class="room-dj-status" id="djStatus">' +
      (isDj
        ? '<div class="room-dj-status-icon">🎵</div><span>Play any song to start your set!</span>'
        : '<div class="room-dj-status-icon">⏳</div><span>Waiting for ' + djName + ' to choose a song...</span>'
      ) +
      '</div>' +
      '</div>' +
      '<div class="room-dj-vote-section" id="djVoteSection" style="display:none;">' +
      '<div class="room-dj-vote-label">Rate the DJ\'s pick</div>' +
      '<div class="room-dj-vote-buttons">' +
      '<button class="room-dj-vote-btn room-dj-vote-up" id="djVoteUpBtn" type="button">' +
      '👍 <span id="djVoteUpCount">0</span>' +
      '</button>' +
      '<button class="room-dj-vote-btn room-dj-vote-down" id="djVoteDownBtn" type="button">' +
      '👎 <span id="djVoteDownCount">0</span>' +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="room-dj-listeners" id="djListeners"></div>' +
      '</div>';

    document.body.appendChild(card);
    this._cardEl = card;

    // Minimize button
    var minimizeBtn = card.querySelector('#djMinimizeBtn');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._minimizeToCompact();
      });
    }

    // Vote buttons
    var upBtn = card.querySelector('#djVoteUpBtn');
    var downBtn = card.querySelector('#djVoteDownBtn');
    if (upBtn) {
      upBtn.addEventListener('click', function (e) {
        e.preventDefault();
        self._castVote('up');
      });
    }
    if (downBtn) {
      downBtn.addEventListener('click', function (e) {
        e.preventDefault();
        self._castVote('down');
      });
    }

    // Update existing state
    this._updateVoteDisplay();
    if (this._hasVoted) this._disableVoteButtons();

    // Render existing listeners
    var keys = Object.keys(this._listenersByPhone);
    for (var i = 0; i < keys.length; i++) {
      this._addListenerToCard(this._listenersByPhone[keys[i]]);
    }

    // Push notification
    if (this._currentDj) {
      this._sendPushNotification(
        'DJ Event Started!',
        (isDj ? 'You are the DJ! Play a song!' : this._currentDj.username + ' is the DJ!'),
        'dj-event'
      );
    }

    // Confetti
    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(20);
    }
  },

  _updateCardForNewDj: function () {
    if (!this._cardEl || !this._currentDj) return;

    var isDj = ROOM.currentUser &&
      this._currentDj.phoneNumber === ROOM.currentUser.phoneNumber;
    var djName = this._esc(this._currentDj.username);
    var remaining = this._onlinePool.length - this._djHistory.length;
    var total = this._onlinePool.length;

    // Update avatar
    var avatarEl = this._cardEl.querySelector('#djAvatar');
    var pic = this._currentDj.profilePicture;
    var color = this._currentDj.avatarColor;
    var av = ROOM.avatarInner({
      profilePicture: pic,
      username: this._currentDj.username
    });
    if (avatarEl) {
      avatarEl.style.cssText = av.hasImage
        ? 'background:transparent;overflow:hidden;'
        : 'background:' + color + ';';
      avatarEl.innerHTML = av.html;
    }

    // Update name & role
    var nameEl = this._cardEl.querySelector('#djName');
    if (nameEl) nameEl.textContent = this._currentDj.username;

    var roleEl = this._cardEl.querySelector('#djRole');
    if (roleEl) {
      roleEl.innerHTML = isDj
        ? '🎤 You are the DJ!'
        : '🎧 ' + djName + ' is the DJ';
    }

    // Update progress
    var progressEl = this._cardEl.querySelector('#djProgressLabel');
    if (progressEl) progressEl.textContent = (total - remaining) + '/' + total;

    // Reset song section
    var statusEl = this._cardEl.querySelector('#djStatus');
    if (statusEl) {
      statusEl.innerHTML = isDj
        ? '<div class="room-dj-status-icon">🎵</div><span>Play any song to start your set!</span>'
        : '<div class="room-dj-status-icon">⏳</div><span>Waiting for ' + djName + ' to choose a song...</span>';
    }

    // Hide song info if it was showing
    var songSection = this._cardEl.querySelector('#djSongSection');
    if (songSection) {
      var songInfo = songSection.querySelector('.room-dj-song-info');
      if (songInfo) songInfo.remove();
    }

    // Hide vote section
    var voteSection = this._cardEl.querySelector('#djVoteSection');
    if (voteSection) voteSection.style.display = 'none';

    // Reset vote counts
    var upCount = this._cardEl.querySelector('#djVoteUpCount');
    var downCount = this._cardEl.querySelector('#djVoteDownCount');
    if (upCount) upCount.textContent = '0';
    if (downCount) downCount.textContent = '0';

    // Re-enable vote buttons
    var upBtn = this._cardEl.querySelector('#djVoteUpBtn');
    var downBtn = this._cardEl.querySelector('#djVoteDownBtn');
    if (upBtn) { upBtn.disabled = false; upBtn.classList.remove('room-dj-vote-btn--voted'); }
    if (downBtn) { downBtn.disabled = false; downBtn.classList.remove('room-dj-vote-btn--voted'); }

    // Clear listeners
    var listenersEl = this._cardEl.querySelector('#djListeners');
    if (listenersEl) listenersEl.innerHTML = '';

    // Update compact card
    this._refreshCompactFromState();

    // Push notification
    this._sendPushNotification(
      'New DJ!',
      (isDj ? 'Your turn! Play a song!' : this._currentDj.username + ' is now the DJ!'),
      'dj-event-new'
    );
  },

  _updateCardForSongChosen: function () {
    if (!this._cardEl || !this._song) return;

    var isDj = ROOM.currentUser && this._currentDj &&
      this._currentDj.phoneNumber === ROOM.currentUser.phoneNumber;

    // Update status
    var statusEl = this._cardEl.querySelector('#djStatus');
    if (statusEl) {
      if (isDj) {
        statusEl.innerHTML =
          '<div class="room-dj-status-icon">🎶</div><span>Your pick is playing! Enjoy the vibes.</span>';
      } else {
        statusEl.innerHTML =
          '<div class="room-dj-status-icon">🎧</div><span>Play <strong>' +
          this._esc(this._song.name) + '</strong> to earn points!</span>';
      }
    }

    // Show song info
    var songSection = this._cardEl.querySelector('#djSongSection');
    if (songSection && !songSection.querySelector('.room-dj-song-info')) {
      var artHtml = this._song.albumArt
        ? '<img src="' + this._esc(this._song.albumArt) + '" alt="" class="room-dj-song-art-img" loading="lazy">'
        : '<div class="room-dj-song-art-placeholder">♪</div>';

      var songInfoEl = document.createElement('div');
      songInfoEl.className = 'room-dj-song-info';
      songInfoEl.innerHTML =
        '<div class="room-dj-song-art">' + artHtml + '</div>' +
        '<div class="room-dj-song-details">' +
        '<div class="room-dj-song-name">' + this._esc(this._song.name) + '</div>' +
        '<div class="room-dj-song-artist">' + this._esc(this._song.artist) + '</div>' +
        '</div>';

      songSection.insertBefore(songInfoEl, statusEl);
    }

    // Show vote section (hide for DJ)
    var voteSection = this._cardEl.querySelector('#djVoteSection');
    if (voteSection && !isDj) {
      voteSection.style.display = '';
    }

    // Update listen status
    this._updateListenStatus(this._hasListened);

    // Update compact card
    this._refreshCompactFromState();
  },

  _updateListenStatus: function (listened) {
    var statusEl = this._cardEl ? this._cardEl.querySelector('#djStatus') : null;
    if (!statusEl || !this._song) return;

    var isDj = ROOM.currentUser && this._currentDj &&
      this._currentDj.phoneNumber === ROOM.currentUser.phoneNumber;
    if (isDj) return;

    if (listened) {
      statusEl.innerHTML =
        '<div class="room-dj-status-icon">✅</div><span>You\'re listening! +2 pts earned</span>';
      statusEl.classList.add('room-dj-status--joined');
    }
  },

  _updateVoteDisplay: function () {
    var upCount = this._cardEl ? this._cardEl.querySelector('#djVoteUpCount') : null;
    var downCount = this._cardEl ? this._cardEl.querySelector('#djVoteDownCount') : null;
    if (upCount) upCount.textContent = this._voteUp;
    if (downCount) downCount.textContent = this._voteDown;
  },

  _disableVoteButtons: function () {
    var upBtn = this._cardEl ? this._cardEl.querySelector('#djVoteUpBtn') : null;
    var downBtn = this._cardEl ? this._cardEl.querySelector('#djVoteDownBtn') : null;
    if (upBtn) { upBtn.disabled = true; upBtn.classList.add('room-dj-vote-btn--voted'); }
    if (downBtn) { downBtn.disabled = true; downBtn.classList.add('room-dj-vote-btn--voted'); }
  },

  _castVote: function (vote) {
    if (this._hasVoted || !this._activeEventId || !ROOM.currentUser) return;

    this._hasVoted = true;
    this._disableVoteButtons();

    ConvexService.mutation('djEvent:voteDj', {
      roomId: ROOM.Firebase.roomId,
      djEventId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      vote: vote
    });
  },

  _addListenerToCard: function (data) {
    var container = this._cardEl ? this._cardEl.querySelector('#djListeners') : null;
    if (!container) return;
    if (container.querySelector('[data-phone="' + data.phoneNumber + '"]')) return;

    var pic = (ROOM.profilePicMap && data.phoneNumber) ? ROOM.profilePicMap[data.phoneNumber] : null;
    var av = ROOM.avatarInner({ profilePicture: pic, username: data.username });
    var color = 'linear-gradient(135deg, #f7a6b9, #e8758a)';

    var entry = document.createElement('div');
    entry.className = 'room-dj-listener';
    entry.setAttribute('data-phone', data.phoneNumber);
    entry.innerHTML =
      '<div class="room-dj-listener-avatar" style="' +
      (av.hasImage ? 'background:transparent;overflow:hidden;' : 'background:' + color + ';') + '">' +
      av.html +
      '</div>' +
      '<span class="room-dj-listener-name">' + this._esc(data.username) + '</span>';

    container.appendChild(entry);

    // Animate
    entry.style.opacity = '0';
    entry.style.transform = 'scale(0.8)';
    requestAnimationFrame(function () {
      entry.style.transition = 'all 0.3s ease';
      entry.style.opacity = '1';
      entry.style.transform = 'scale(1)';
    });
  },

  // ========== UI: COMPACT / CAPSULE ==========

  _minimizeToCompact: function () {
    if (!this._cardEl || !this._activeEventId) return;
    this._ensureCompactCard();
    this._refreshCompactFromState();
    this._cardEl.classList.add('room-dj-card--minimized');
    if (this._compactEl) {
      this._compactEl.classList.add('room-dj-capsule--visible');
      if (ROOM.CapsuleStack) ROOM.CapsuleStack.register('dj-event', this._compactEl, this._bubbleEl, this);
    }
  },

  _expandFromCompact: function () {
    if (this._cardEl) {
      this._cardEl.classList.remove('room-dj-card--minimized');
    }
    if (this._compactEl) {
      this._compactEl.classList.remove('room-dj-capsule--visible');
      if (ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('dj-event');
    }
  },

  _ensureCompactCard: function () {
    var self = this;
    if (this._compactEl) return;

    var capsule = document.createElement('button');
    capsule.type = 'button';
    capsule.className = 'room-dj-capsule';
    capsule.setAttribute('aria-label', 'Open DJ Event');
    capsule.innerHTML =
      '<div class="room-dj-capsule-glare"></div>' +
      '<div class="room-dj-capsule-icon">🎧</div>' +
      '<div class="room-dj-capsule-label">DJ EVENT</div>' +
      '<div class="room-dj-capsule-title" id="djCapsuleTitle">...</div>' +
      '<div class="room-dj-capsule-countdown" id="djCapsuleCountdown">--:--</div>' +
      '<div class="room-dj-capsule-glow"></div>';

    capsule.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (self._cardEl && !self._cardEl.classList.contains('room-dj-card--minimized')) {
        self._minimizeToCompact();
      } else {
        self._expandFromCompact();
      }
    });

    this._attachSwipeListeners(capsule);

    document.body.appendChild(capsule);
    this._compactEl = capsule;

    if (this._capsuleSide === 'left') {
      capsule.classList.add('room-dj-capsule--left');
    }
  },

  _removeCompactCard: function () {
    if (ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('dj-event');
    if (this._bubbleEl) {
      this._bubbleEl.remove();
      this._bubbleEl = null;
    }
    if (!this._compactEl) return;
    this._compactEl.remove();
    this._compactEl = null;
  },

  _refreshCompactFromState: function () {
    if (!this._compactEl) return;

    var titleEl = this._compactEl.querySelector('#djCapsuleTitle');
    if (titleEl) {
      if (this._song) {
        titleEl.textContent = this._song.name;
      } else if (this._currentDj) {
        titleEl.textContent = this._currentDj.username;
      }
    }
  },

  _removeEventCard: function () {
    if (this._cardEl) {
      var card = this._cardEl;
      this._cardEl = null;
      card.classList.add('room-dj-card--exit');
      setTimeout(function () {
        if (card.parentNode) card.remove();
      }, 500);
    }
    this._removeCompactCard();
    this._listenersByPhone = {};
  },

  // ========== SWIPE ==========

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
        this._compactEl.classList.add('room-dj-capsule--left');
      } else {
        this._compactEl.classList.remove('room-dj-capsule--left');
      }
    }
    if (!fromStack && ROOM.CapsuleStack && ROOM.CapsuleStack.setSide) {
      ROOM.CapsuleStack.setSide(side);
    }
  },

  // ========== UTILITIES ==========

  _sendPushNotification: function (title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var n = new Notification(title, {
        body: body,
        icon: 'assets/logo/lightstick.png',
        tag: tag || 'dj-event',
        renotify: true
      });
      n.onclick = function () { window.focus(); n.close(); };
    } catch (e) { /* silent */ }
  },

  _esc: function (text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  },

  destroy: function () {
    this._stopAllTimers();
    this._removeEventCard();
    this._activeEventId = null;
    this._currentDj = null;
    this._song = null;
  }
};
