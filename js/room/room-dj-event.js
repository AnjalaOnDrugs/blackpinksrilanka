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
  _pendingConfirmSong: null,
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
  _votesByPhone: {},
  _voteUp: 0,
  _voteDown: 0,
  _onlinePool: [],
  _djHistory: [],
  _djRoundNumber: 1,
  _songsPerDj: 2,

  init: function () {
    // No periodic trigger — DJ event is admin-started
  },

  // ========== EVENT HANDLERS (called from room-events.js) ==========

  handleStart: function (data) {
    this._activeEventId = data.djEventId;
    this._onlinePool = data.onlinePool || [];
    this._djHistory = [data.djPhoneNumber];
    this._djRoundNumber = data.roundNumber || 1;
    this._songsPerDj = data.songsPerDj || 2;
    this._setCurrentDj(data);
    this._showEventCard();
  },

  handleNewDj: function (data) {
    if (!this._activeEventId) return;
    this._djRoundNumber = data.roundNumber || 1;
    this._songsPerDj = data.songsPerDj || 2;
    // Only push to history if this is a genuinely new DJ (round 1)
    if (this._djRoundNumber === 1) {
      this._djHistory.push(data.djPhoneNumber);
    }
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
    this._renderParticipantsList();

    // Epic join flash effect
    this._spawnListenerJoinEffect(data);

    if (ROOM.currentUser && data.phoneNumber === ROOM.currentUser.phoneNumber) {
      this._hasListened = true;
      this._updateListenStatus(true);
    }
  },

  handleVote: function (data) {
    if (!this._activeEventId) return;
    this._voteUp = data.totalUp || 0;
    this._voteDown = data.totalDown || 0;
    this._votesByPhone[data.voterPhoneNumber] = data.vote;
    this._updateVoteDisplay();

    if (ROOM.currentUser && data.voterPhoneNumber === ROOM.currentUser.phoneNumber) {
      this._hasVoted = true;
      this._disableVoteButtons();
    }

    // Re-render to show persistent vote badge
    this._renderParticipantsList();

    // Animated pop on the voter's avatar
    if (this._cardEl) {
      var listenerAvatar = this._cardEl.querySelector('.room-dj-listener[data-phone="' + data.voterPhoneNumber + '"] .room-dj-listener-avatar');
      if (listenerAvatar) {
        var thumb = document.createElement('div');
        thumb.className = 'room-dj-thumb-anim';
        thumb.textContent = data.vote === 'up' ? '👍' : '👎';
        listenerAvatar.appendChild(thumb);
        setTimeout(function () {
          if (thumb.parentNode) thumb.parentNode.removeChild(thumb);
        }, 1200);
      }
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
    this._clearThumbAnims();
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
    this._djRoundNumber = (event.currentDj && event.currentDj.roundNumber) || 1;
    this._songsPerDj = 2;
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
        for (var j = 0; j < event.votes.length; j++) {
          this._votesByPhone[event.votes[j].phoneNumber] = event.votes[j].vote;
        }
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
    this._pendingConfirmSong = null;
    this._hasVoted = false;
    this._hasListened = false;
    this._listenersByPhone = {};
    this._votesByPhone = {};
    this._voteUp = 0;
    this._voteDown = 0;
    this._stopRoundTimer();
    this._stopListenCheck();
    this._stopSongDetection();
    this._clearThumbAnims();
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

    var track = me.data.currentTrack;
    if (this._pendingConfirmSong && this._pendingConfirmSong.name === track.name) return;

    this._pendingConfirmSong = track;
    this._showConfirmSongUI(track);
  },

  _showConfirmSongUI: function (track) {
    if (!this._cardEl) return;
    var statusEl = this._cardEl.querySelector('#djStatus');
    if (!statusEl) return;

    var self = this;
    var safeName = this._esc(track.name);
    statusEl.innerHTML = '<div class="room-dj-status-icon">🎵</div><span>Detected: <strong>' + safeName + '</strong></span>' +
      '<button class="room-dj-confirm-btn" id="djConfirmBtn" type="button">Confirm</button>';

    var btn = statusEl.querySelector('#djConfirmBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        self._stopSongDetection();
        statusEl.innerHTML = '<div class="room-dj-status-icon">⏳</div><span>Starting round...</span>';

        ConvexService.mutation('djEvent:chooseSong', {
          roomId: ROOM.Firebase.roomId,
          djEventId: self._activeEventId,
          phoneNumber: ROOM.currentUser.phoneNumber,
          songName: track.name,
          songArtist: track.artist,
          albumArt: track.albumArt || undefined,
          roundDurationMs: CONFIG.djEventRoundDuration || 120000
        });
      });
    }
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
      '<div class="room-dj-club-ceiling" aria-hidden="true"></div>' +
      '<div class="room-dj-stage-fog" aria-hidden="true"></div>' +
      '<div class="room-dj-light-beams" aria-hidden="true">' +
      '<span class="room-dj-light-beam room-dj-light-beam--1"></span>' +
      '<span class="room-dj-light-beam room-dj-light-beam--2"></span>' +
      '<span class="room-dj-light-beam room-dj-light-beam--3"></span>' +
      '<span class="room-dj-light-beam room-dj-light-beam--4"></span>' +
      '</div>' +
      '<div class="room-dj-booth">' +
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
      '<div class="room-dj-booth-rig" aria-hidden="true">' +
      '<span class="room-dj-speaker room-dj-speaker--left"></span>' +
      '<span class="room-dj-rack"></span>' +
      '<span class="room-dj-speaker room-dj-speaker--right"></span>' +
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
      '<div class="room-dj-round-badge" id="djRoundBadge">Song ' +
      this._djRoundNumber + '/' + this._songsPerDj +
      '</div>' +
      '<div class="room-dj-deck" aria-hidden="true">' +
      '<span class="room-dj-platter"></span>' +
      '<span class="room-dj-mixer"></span>' +
      '<span class="room-dj-platter"></span>' +
      '</div>' +
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

    var overlay = document.getElementById('eventOverlay');
    if (!overlay) return;
    overlay.appendChild(card);
    this._cardEl = card;
    this._setPlayingVisualState(!!this._song);

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
    this._renderParticipantsList();

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

    // Update name and role
    var nameEl = this._cardEl.querySelector('#djName');
    if (nameEl) nameEl.textContent = this._currentDj.username;

    var roleEl = this._cardEl.querySelector('#djRole');
    if (roleEl) {
      roleEl.innerHTML = isDj
        ? '&#127908; You are the DJ!'
        : '&#127911; ' + djName + ' is the DJ';
    }

    // Update round badge
    var roundBadgeEl = this._cardEl.querySelector('#djRoundBadge');
    if (roundBadgeEl) roundBadgeEl.textContent = 'Song ' + this._djRoundNumber + '/' + this._songsPerDj;

    // Update progress
    var progressEl = this._cardEl.querySelector('#djProgressLabel');
    if (progressEl) progressEl.textContent = (total - remaining) + '/' + total;

    // Reset song status
    var statusEl = this._cardEl.querySelector('#djStatus');
    if (statusEl) {
      statusEl.classList.remove('room-dj-status--joined');
      statusEl.innerHTML = isDj
        ? '<div class="room-dj-status-icon">&#127925;</div><span>Play any song to start your set!</span>'
        : '<div class="room-dj-status-icon">&#9203;</div><span>Waiting for ' + djName + ' to choose a song...</span>';
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

    // Rerender attendees and compact card
    this._renderParticipantsList();
    this._refreshCompactFromState();
    this._setPlayingVisualState(false);

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
      statusEl.classList.remove('room-dj-status--joined');
      if (isDj) {
        statusEl.innerHTML =
          '<div class="room-dj-status-icon">&#127926;</div><span>Your pick is playing! Enjoy the vibes.</span>';
      } else {
        statusEl.innerHTML =
          '<div class="room-dj-status-icon">&#127911;</div><span>Play <strong>' +
          this._esc(this._song.name) + '</strong> to earn points!</span>';
      }
    }

    // Show song info
    var songSection = this._cardEl.querySelector('#djSongSection');
    if (songSection && !songSection.querySelector('.room-dj-song-info')) {
      var artHtml = this._song.albumArt
        ? '<img src="' + this._esc(this._song.albumArt) + '" alt="" class="room-dj-song-art-img" loading="lazy">'
        : '<div class="room-dj-song-art-placeholder">&#9835;</div>';

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

    // Update listen status and compact card
    this._updateListenStatus(this._hasListened);
    this._refreshCompactFromState();
    this._setPlayingVisualState(true);
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
    } else {
      statusEl.classList.remove('room-dj-status--joined');
    }
  },

  _setPlayingVisualState: function (isPlaying) {
    if (this._cardEl) {
      this._cardEl.classList.toggle('room-dj-card--playing', !!isPlaying);
    }
    if (this._compactEl) {
      this._compactEl.classList.toggle('room-dj-capsule--playing', !!isPlaying);
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

  _renderParticipantsList: function () {
    var container = this._cardEl ? this._cardEl.querySelector('#djListeners') : null;
    if (!container) return;

    var self = this;
    var participants = ROOM.Firebase.getParticipants().filter(function (p) { return p.data.isOnline; });
    // Filter out the DJ — only show audience
    var djPhone = this._currentDj ? this._currentDj.phoneNumber : null;
    participants = participants.filter(function (p) { return p.id !== djPhone; });
    container.innerHTML = '';

    // Count listeners for crowd intensity
    var listenerCount = Object.keys(this._listenersByPhone).length;
    var intensityClass = listenerCount >= 6 ? 'room-dj-crowd--fire'
      : listenerCount >= 3 ? 'room-dj-crowd--hype'
        : listenerCount >= 1 ? 'room-dj-crowd--vibing'
          : '';

    // Update crowd intensity on the card
    if (this._cardEl) {
      this._cardEl.classList.remove('room-dj-crowd--vibing', 'room-dj-crowd--hype', 'room-dj-crowd--fire');
      if (intensityClass) this._cardEl.classList.add(intensityClass);
    }

    if (participants.length > 0) {
      var label = document.createElement('div');
      label.className = 'room-dj-listeners-label';
      label.textContent = 'Audience';
      if (listenerCount > 0) {
        var badge = document.createElement('span');
        badge.className = 'room-dj-listeners-count';
        badge.textContent = listenerCount + ' playing';
        label.appendChild(badge);
      }
      container.appendChild(label);
    }

    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      var isListening = !!this._listenersByPhone[p.id];
      var vote = this._votesByPhone[p.id] || null;

      var pic = ROOM.profilePicMap ? ROOM.profilePicMap[p.id] : null;
      var av = ROOM.avatarInner({ profilePicture: pic, username: p.data.username });
      var color = p.data.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';

      var entry = document.createElement('div');
      entry.className = 'room-dj-listener' +
        (isListening ? ' room-dj-listener--listening' : '') +
        (vote === 'up' ? ' room-dj-listener--voted-up' : '') +
        (vote === 'down' ? ' room-dj-listener--voted-down' : '');
      entry.setAttribute('data-phone', p.id);

      var voteBadgeHtml = '';
      if (vote === 'up') {
        voteBadgeHtml = '<div class="room-dj-vote-badge room-dj-vote-badge--up">👍</div>';
      } else if (vote === 'down') {
        voteBadgeHtml = '<div class="room-dj-vote-badge room-dj-vote-badge--down">👎</div>';
      }

      entry.innerHTML =
        '<div class="room-dj-listener-avatar" style="' +
        (av.hasImage ? 'background:transparent;' : 'background:' + color + ';') + '">' +
        av.html +
        (isListening ? '<div class="room-dj-listener-pulse"></div>' : '') +
        voteBadgeHtml +
        '</div>';

      container.appendChild(entry);
    }
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

    var overlay = document.getElementById('eventOverlay');
    if (!overlay) return;
    overlay.appendChild(capsule);
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
    this._compactEl.classList.toggle('room-dj-capsule--playing', !!this._song);
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

  _clearThumbAnims: function () {
    if (!this._cardEl) return;
    var thumbs = this._cardEl.querySelectorAll('.room-dj-thumb-anim');
    for (var i = 0; i < thumbs.length; i++) {
      if (thumbs[i].parentNode) thumbs[i].parentNode.removeChild(thumbs[i]);
    }
  },

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

  _spawnListenerJoinEffect: function (data) {
    if (!this._cardEl) return;

    var listenerCount = Object.keys(this._listenersByPhone).length;
    var username = data.username || '???';

    // Screen-wide flash on the card
    var flash = document.createElement('div');
    flash.className = 'room-dj-join-flash';
    this._cardEl.querySelector('.room-dj-content').appendChild(flash);
    setTimeout(function () { if (flash.parentNode) flash.remove(); }, 800);

    // Floating name tag that rises
    var floater = document.createElement('div');
    floater.className = 'room-dj-join-floater';
    floater.innerHTML = '<span class="room-dj-join-floater-icon">🎵</span> ' +
      '<span class="room-dj-join-floater-name">' + this._esc(username) + '</span>' +
      ' <span class="room-dj-join-floater-text">joined the vibe!</span>';
    this._cardEl.querySelector('.room-dj-content').appendChild(floater);
    setTimeout(function () { if (floater.parentNode) floater.remove(); }, 2500);

    // At high crowd levels, spawn extra particles
    if (listenerCount >= 3 && ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(listenerCount >= 6 ? 15 : 8);
    }

    // Highlight the newly joined listener entry
    var entry = this._cardEl.querySelector('.room-dj-listener[data-phone="' + data.phoneNumber + '"]');
    if (entry) {
      entry.classList.add('room-dj-listener--just-joined');
      setTimeout(function () { entry.classList.remove('room-dj-listener--just-joined'); }, 2000);
    }
  },

  _esc: function (text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  },

  _checkSoloMemberSong: function () {
    if (!this._song || !this._currentDj) return;

    if (document.querySelector('.room-dj-solo-popup')) return;

    var artist = (this._song.artist || '').toUpperCase();
    var songName = (this._song.name || '').toUpperCase();
    var djName = this._esc(this._currentDj.username);

    var soloMembers = [
      { key: 'LISA', name: 'Lisa', img: 'assets/bps/lisa.png' },
      { key: 'JENNIE', name: 'Jennie', img: 'assets/bps/jennie.png' },
      { key: 'ROSÉ', name: 'Rosé', img: 'assets/bps/rose.png' },
      { key: 'ROSE', name: 'Rosé', img: 'assets/bps/rose.png' },
      { key: 'JISOO', name: 'Jisoo', img: 'assets/bps/kim.png' },
      { key: 'ROSIE', name: 'Rosé', img: 'assets/bps/rose.png' }
    ];

    var matched = null;
    for (var i = 0; i < soloMembers.length; i++) {
      var m = soloMembers[i];
      if (artist.indexOf(m.key) !== -1 || songName.indexOf(m.key) !== -1) {
        matched = m;
        break;
      }
    }

    if (matched) {
      this._showSoloMemberPopup(matched, djName);
    }
  },

  _showSoloMemberPopup: function (member, djName) {
    var popup = document.createElement('div');
    popup.className = 'room-dj-solo-popup';

    var bubble = document.createElement('div');
    bubble.className = 'room-dj-solo-bubble';
    bubble.innerHTML = djName + " that's a good choice! 💖";

    var img = document.createElement('img');
    img.src = member.img;
    img.className = 'room-dj-solo-img';
    img.alt = member.name;

    popup.appendChild(img);
    popup.appendChild(bubble);

    document.body.appendChild(popup);

    setTimeout(function () {
      popup.classList.add('room-dj-solo-popup--exit');
      setTimeout(function () {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
      }, 600);
    }, 5000);
  },

  destroy: function () {
    this._stopAllTimers();
    this._removeEventCard();
    this._activeEventId = null;
    this._currentDj = null;
    this._song = null;
  }
};
