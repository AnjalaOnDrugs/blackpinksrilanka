/**
 * Room Vroom — "My Lamborghini Go Vroom Vroom"
 * 4-lane member race fueled by solo song streams.
 * Auto-triggers every 2 hours; users join by streaming their bias member's solo.
 * First member lane to hit target streams wins the race.
 */

window.ROOM = window.ROOM || {};

ROOM.Vroom = {
  _checkInterval: null,
  _joinCheckInterval: null,
  _activeEventId: null,
  _target: 0,
  _lanes: null,
  _winner: null,
  _hasJoined: false,
  _joinedMember: null,
  _userBias: null,
  _biasFetched: false,
  _cardEl: null,
  _compactEl: null,
  _bubbleEl: null,
  _autoCompactTimer: null,
  _initialAutoCompactMs: 12000,
  _expandedAutoCompactMs: 20000,
  _capsuleSide: 'right',
  _swipeStartX: null,
  _swipeStartY: null,
  _resultEl: null,
  _streamWatchUnsub: null,
  _lastKnownStreamCounts: null,

  init: function () {
    this._fetchUserBias();
    this._startPeriodicCheck();
  },

  // ========== BIAS FETCHING ==========

  _fetchUserBias: function () {
    var self = this;
    if (!ROOM.currentUser) return;

    ConvexService.query('users:getByPhone', {
      phoneNumber: ROOM.currentUser.phoneNumber
    }).then(function (user) {
      if (user && user.bias) {
        self._userBias = user.bias.toLowerCase();
      }
      self._biasFetched = true;
    }).catch(function () {
      self._biasFetched = true;
    });
  },

  // ========== SCHEDULING ==========

  _startPeriodicCheck: function () {
    var self = this;
    var interval = CONFIG.vroomCheckInterval || 60000;

    self._tryTrigger();

    this._checkInterval = setInterval(function () {
      self._tryTrigger();
    }, interval);
  },

  _tryTrigger: function () {
    if (this._activeEventId) return;

    var participants = ROOM.Firebase.getParticipants();
    var onlineUsers = participants.filter(function (p) { return p.data.isOnline; });

    if (onlineUsers.length < 2) return;
    if (!ROOM.currentUser) return;

    var chance = CONFIG.vroomTriggerChance || 0.15;
    if (Math.random() > chance) return;

    ConvexService.mutation('vroom:startVroom', {
      roomId: ROOM.Firebase.roomId,
      onlineCount: onlineUsers.length,
      cooldownMs: CONFIG.vroomCooldown
    });
  },

  // ========== EVENT HANDLERS (called from room-events.js) ==========

  handleStart: function (data) {
    this._activeEventId = data.vroomId;
    this._target = data.target;
    this._lanes = {
      jisoo: { streams: 0, participants: [] },
      jennie: { streams: 0, participants: [] },
      rose: { streams: 0, participants: [] },
      lisa: { streams: 0, participants: [] }
    };
    this._winner = null;
    this._hasJoined = false;
    this._joinedMember = null;

    this._showFullView();
    this._startJoinCheck();

    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('energy', '🏎️',
        '<strong>My Lamborghini Go Vroom Vroom!</strong> Stream a solo song to fuel your bias!');
    }

    this._sendPushNotification(
      '🏎️ Vroom Race Started!',
      'Stream your bias member\'s solo song to help them win the race!',
      'vroom-start'
    );
  },

  handleJoin: function (data) {
    if (!this._activeEventId || !this._lanes) return;
    var member = data.member;
    if (!this._lanes[member]) return;

    // Check if already in lane
    var already = false;
    for (var i = 0; i < this._lanes[member].participants.length; i++) {
      if (this._lanes[member].participants[i].phoneNumber === data.phoneNumber) {
        already = true;
        break;
      }
    }
    if (!already) {
      this._lanes[member].participants.push({
        phoneNumber: data.phoneNumber,
        username: data.username,
        avatarColor: data.avatarColor,
        profilePicture: data.profilePicture
      });
    }

    // Update UI
    this._updateLaneAvatars(member);
    this._updateCompactView();

    if (ROOM.currentUser && data.phoneNumber === ROOM.currentUser.phoneNumber) {
      this._hasJoined = true;
      this._joinedMember = member;
      this._updateJoinStatus(true, member);
      this._startStreamMonitoring();
    }
  },

  handleProgress: function (data) {
    if (!this._activeEventId || !this._lanes) return;

    var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (data.streams && typeof data.streams[m] === 'number') {
        this._lanes[m].streams = data.streams[m];
      }
    }

    this._target = data.target || this._target;
    this._updateAllLanes();
    this._updateCompactView();
  },

  handleFinish: function (data) {
    this._winner = data.winner;
    this._stopJoinCheck();
    this._stopStreamMonitoring();

    // Update final lane state
    if (data.lanes) {
      var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];
      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        if (data.lanes[m]) {
          this._lanes[m].streams = data.lanes[m].streams;
        }
      }
    }

    this._updateAllLanes();
    this._showWinnerCelebration(data.winner);

    var self = this;
    setTimeout(function () {
      self._removeFullView();
      self._activeEventId = null;
      self._lanes = null;
      self._winner = null;
      self._hasJoined = false;
      self._joinedMember = null;
    }, 15000);
  },

  // Late joiner support
  handleActiveEvent: function (event) {
    if (!event || this._activeEventId) return;

    this._activeEventId = event._id;
    this._target = event.target;
    this._lanes = {
      jisoo: event.lanes.jisoo || { streams: 0, participants: [] },
      jennie: event.lanes.jennie || { streams: 0, participants: [] },
      rose: event.lanes.rose || { streams: 0, participants: [] },
      lisa: event.lanes.lisa || { streams: 0, participants: [] }
    };
    this._winner = event.winner || null;
    this._hasJoined = false;
    this._joinedMember = null;

    // Check if current user already joined
    if (ROOM.currentUser) {
      var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];
      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        var participants = this._lanes[m].participants || [];
        for (var j = 0; j < participants.length; j++) {
          if (participants[j].phoneNumber === ROOM.currentUser.phoneNumber) {
            this._hasJoined = true;
            this._joinedMember = m;
            break;
          }
        }
        if (this._hasJoined) break;
      }
    }

    this._showFullView();
    if (!this._hasJoined) {
      this._startJoinCheck();
    } else {
      this._updateJoinStatus(true, this._joinedMember);
      this._startStreamMonitoring();
    }
  },

  // ========== AUTO-JOIN ==========

  _startJoinCheck: function () {
    var self = this;
    if (this._joinCheckInterval) clearInterval(this._joinCheckInterval);

    this._joinCheckInterval = setInterval(function () {
      self._checkAndJoin();
    }, CONFIG.vroomJoinCheckInterval || 5000);
  },

  _stopJoinCheck: function () {
    if (this._joinCheckInterval) {
      clearInterval(this._joinCheckInterval);
      this._joinCheckInterval = null;
    }
  },

  _checkAndJoin: function () {
    if (!this._activeEventId || this._hasJoined || !ROOM.currentUser) return;
    if (!this._biasFetched) return;

    var participants = ROOM.Firebase.getParticipants();
    var me = null;
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === ROOM.currentUser.phoneNumber) {
        me = participants[i];
        break;
      }
    }

    if (!me || !me.data.currentTrack || !me.data.currentTrack.nowPlaying) return;

    var bias = this._userBias;
    if (!bias) return;

    var soloSongs = CONFIG.vroomSoloSongs || {};
    var memberToJoin = null;

    if (bias === 'ot4') {
      // OT4: check all members' solo songs, assign to whichever matches
      var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];
      for (var m = 0; m < members.length; m++) {
        var songs = soloSongs[members[m]] || [];
        for (var s = 0; s < songs.length; s++) {
          if (ROOM.LastFM.isSameSong(
            me.data.currentTrack.name, me.data.currentTrack.artist,
            songs[s].name, songs[s].artist
          )) {
            memberToJoin = members[m];
            break;
          }
        }
        if (memberToJoin) break;
      }
    } else {
      // Specific bias: check only that member's songs
      var biasSongs = soloSongs[bias] || [];
      for (var s = 0; s < biasSongs.length; s++) {
        if (ROOM.LastFM.isSameSong(
          me.data.currentTrack.name, me.data.currentTrack.artist,
          biasSongs[s].name, biasSongs[s].artist
        )) {
          memberToJoin = bias;
          break;
        }
      }
    }

    if (!memberToJoin) return;

    // User qualifies — auto-join!
    this._hasJoined = true;
    this._joinedMember = memberToJoin;
    this._stopJoinCheck();
    this._updateJoinStatus(true, memberToJoin);

    var pic = (ROOM.profilePicMap && ROOM.currentUser.phoneNumber)
      ? ROOM.profilePicMap[ROOM.currentUser.phoneNumber] : undefined;

    ConvexService.mutation('vroom:joinVroom', {
      roomId: ROOM.Firebase.roomId,
      vroomId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      username: ROOM.currentUser.username,
      avatarColor: ROOM.currentUser.avatarColor,
      profilePicture: pic,
      member: memberToJoin
    });
  },

  // ========== STREAM MONITORING ==========

  _startStreamMonitoring: function () {
    var self = this;
    if (this._streamWatchUnsub) return;

    // Poll for stream changes every 5s
    this._streamWatchInterval = setInterval(function () {
      self._checkForNewStreams();
    }, 5000);
  },

  _stopStreamMonitoring: function () {
    if (this._streamWatchInterval) {
      clearInterval(this._streamWatchInterval);
      this._streamWatchInterval = null;
    }
  },

  _checkForNewStreams: function () {
    if (!this._activeEventId || !this._hasJoined || !this._joinedMember) return;
    if (!ROOM.currentUser) return;

    var self = this;
    var member = this._joinedMember;
    var soloSongs = CONFIG.vroomSoloSongs || {};
    var memberSongs = soloSongs[member] || [];

    // Check if user is currently playing one of the member's solo songs
    var participants = ROOM.Firebase.getParticipants();
    var me = null;
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === ROOM.currentUser.phoneNumber) {
        me = participants[i];
        break;
      }
    }

    if (!me || !me.data.currentTrack || !me.data.currentTrack.nowPlaying) return;

    // Check if user is still playing the correct solo song
    var isPlaying = false;
    for (var s = 0; s < memberSongs.length; s++) {
      if (ROOM.LastFM.isSameSong(
        me.data.currentTrack.name, me.data.currentTrack.artist,
        memberSongs[s].name, memberSongs[s].artist
      )) {
        isPlaying = true;
        break;
      }
    }

    if (!isPlaying) return;

    // Query stream counts to detect new validated streams
    // getUserStreamCounts returns { streams: [{trackName, trackArtist, platform, countedAt, ...}] }
    ConvexService.query('streams:getUserStreamCounts', {
      roomId: ROOM.Firebase.roomId,
      phoneNumber: ROOM.currentUser.phoneNumber
    }).then(function (result) {
      if (!result || !result.streams || !self._activeEventId) return;

      // Count solo song streams by matching track names using fuzzy matching
      var totalSoloStreams = 0;
      for (var i = 0; i < result.streams.length; i++) {
        var stream = result.streams[i];
        for (var s = 0; s < memberSongs.length; s++) {
          if (ROOM.LastFM.isSameSong(
            stream.trackName, stream.trackArtist,
            memberSongs[s].name, memberSongs[s].artist
          )) {
            totalSoloStreams++;
            break;
          }
        }
      }

      // Detect new streams since last check
      if (self._lastKnownStreamCounts === null) {
        self._lastKnownStreamCounts = totalSoloStreams;
        return;
      }

      if (totalSoloStreams > self._lastKnownStreamCounts) {
        var newStreams = totalSoloStreams - self._lastKnownStreamCounts;
        self._lastKnownStreamCounts = totalSoloStreams;

        // Report each new stream
        for (var n = 0; n < newStreams; n++) {
          ConvexService.mutation('vroom:addVroomStream', {
            roomId: ROOM.Firebase.roomId,
            vroomId: self._activeEventId,
            member: member,
            phoneNumber: ROOM.currentUser.phoneNumber
          });
        }
      }
    }).catch(function () { /* silent */ });
  },

  // ========== UI: FULL VIEW ==========

  _showFullView: function () {
    var self = this;
    this._removeFullView();

    var overlay = document.getElementById('eventOverlay');
    if (!overlay) return;

    var card = document.createElement('div');
    card.className = 'room-vroom-card';

    var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];
    var labels = CONFIG.vroomMemberLabels || {};
    var colors = CONFIG.vroomMemberColors || {};

    var lanesHtml = '';
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var label = labels[m] || m;
      var color = colors[m] || '#f7a6b9';
      var streams = this._lanes ? this._lanes[m].streams : 0;
      var pct = this._target > 0 ? Math.min(100, (streams / this._target) * 100) : 0;

      lanesHtml +=
        '<div class="room-vroom-lane" data-member="' + m + '">' +
          '<div class="room-vroom-lane-header">' +
            '<span class="room-vroom-lane-label" style="color:' + color + '">' + this._esc(label) + '</span>' +
            '<span class="room-vroom-lane-count" id="vroomCount_' + m + '">' + streams + '/' + this._target + '</span>' +
          '</div>' +
          '<div class="room-vroom-track">' +
            '<div class="room-vroom-track-fill" id="vroomFill_' + m + '" style="width:' + pct + '%;background:' + color + ';"></div>' +
            '<div class="room-vroom-runner" id="vroomRunner_' + m + '" style="left:' + pct + '%;">' +
              '<video autoplay loop muted playsinline class="room-vroom-runner-video" id="vroomVideo_' + m + '">' +
                '<source src="assets/vroom/' + m + '.webm" type="video/webm">' +
              '</video>' +
            '</div>' +
            '<div class="room-vroom-finish-line"></div>' +
          '</div>' +
          '<div class="room-vroom-avatars" id="vroomAvatars_' + m + '"></div>' +
        '</div>';
    }

    card.innerHTML =
      '<div class="room-vroom-glow"></div>' +
      '<div class="room-vroom-content">' +
        '<div class="room-vroom-header">' +
          '<div class="room-vroom-badge">🏎️ MY LAMBORGHINI GO VROOM VROOM</div>' +
          '<div class="room-vroom-header-actions">' +
            '<button class="room-vroom-minimize" id="vroomMinimizeBtn" type="button" aria-label="Minimize">−</button>' +
          '</div>' +
        '</div>' +
        '<div class="room-vroom-lanes">' + lanesHtml + '</div>' +
        '<div class="room-vroom-footer">' +
          '<div class="room-vroom-target">Target: ' + this._target + ' streams</div>' +
          '<div class="room-vroom-status" id="vroomStatus">' +
            '<span class="room-vroom-status-icon">🎧</span>' +
            '<span>Play a solo song to join!</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    overlay.appendChild(card);
    this._cardEl = card;

    // Minimize button
    var minimizeBtn = card.querySelector('#vroomMinimizeBtn');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._minimizeToCompact();
      });
    }

    // Render existing participants for all lanes
    if (this._lanes) {
      for (var i = 0; i < members.length; i++) {
        this._updateLaneAvatars(members[i]);
      }
    }

    // Update join status
    if (this._hasJoined) {
      this._updateJoinStatus(true, this._joinedMember);
    }

    // Schedule auto-compact
    this._scheduleAutoCompact(this._initialAutoCompactMs);

    // Confetti burst
    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(15);
    }
  },

  _updateAllLanes: function () {
    if (!this._lanes) return;
    var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];

    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var lane = this._lanes[m];
      var streams = lane.streams;
      var pct = this._target > 0 ? Math.min(100, (streams / this._target) * 100) : 0;

      // Update fill
      var fill = document.getElementById('vroomFill_' + m);
      if (fill) fill.style.width = pct + '%';

      // Update runner position
      var runner = document.getElementById('vroomRunner_' + m);
      if (runner) runner.style.left = pct + '%';

      // Update count
      var count = document.getElementById('vroomCount_' + m);
      if (count) count.textContent = streams + '/' + this._target;

      // Update video playback rate based on participant count
      var video = document.getElementById('vroomVideo_' + m);
      if (video) {
        var participantCount = lane.participants ? lane.participants.length : 0;
        var rate = Math.min(3.0, 0.5 + (participantCount * 0.3));
        try { video.playbackRate = rate; } catch (e) { /* silent */ }
      }
    }
  },

  _updateLaneAvatars: function (member) {
    var container = document.getElementById('vroomAvatars_' + member);
    if (!container || !this._lanes || !this._lanes[member]) return;

    container.innerHTML = '';
    var participants = this._lanes[member].participants || [];
    var maxShow = 6;

    for (var i = 0; i < participants.length && i < maxShow; i++) {
      var p = participants[i];
      var av = document.createElement('div');
      av.className = 'room-vroom-avatar';

      if (p.profilePicture) {
        av.style.background = 'transparent';
        av.style.overflow = 'hidden';
        av.innerHTML = '<img src="' + this._esc(p.profilePicture) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">';
      } else {
        av.style.background = p.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
        av.textContent = (p.username || '?').charAt(0).toUpperCase();
      }
      av.title = p.username || '';
      container.appendChild(av);
    }

    if (participants.length > maxShow) {
      var extra = document.createElement('div');
      extra.className = 'room-vroom-avatar room-vroom-avatar--extra';
      extra.textContent = '+' + (participants.length - maxShow);
      container.appendChild(extra);
    }
  },

  _updateJoinStatus: function (joined, member) {
    var statusEl = this._cardEl ? this._cardEl.querySelector('#vroomStatus') : null;
    if (!statusEl) return;

    if (joined && member) {
      var label = (CONFIG.vroomMemberLabels || {})[member] || member;
      statusEl.innerHTML =
        '<span class="room-vroom-status-icon">✅</span>' +
        '<span>You\'re fueling <strong>' + this._esc(label) + '</strong>! Keep streaming!</span>';
      statusEl.classList.add('room-vroom-status--joined');
    } else {
      statusEl.innerHTML =
        '<span class="room-vroom-status-icon">🎧</span>' +
        '<span>Play a solo song to join!</span>';
      statusEl.classList.remove('room-vroom-status--joined');
    }
  },

  // ========== UI: WINNER CELEBRATION ==========

  _showWinnerCelebration: function (winner) {
    var self = this;
    if (this._resultEl) {
      this._resultEl.remove();
      this._resultEl = null;
    }

    var labels = CONFIG.vroomMemberLabels || {};
    var colors = CONFIG.vroomMemberColors || {};
    var label = labels[winner] || winner;
    var color = colors[winner] || '#f7a6b9';

    // Highlight winning lane
    if (this._cardEl) {
      var winnerLane = this._cardEl.querySelector('[data-member="' + winner + '"]');
      if (winnerLane) {
        winnerLane.classList.add('room-vroom-lane--winner');
      }
    }

    var overlay = document.createElement('div');
    overlay.className = 'room-vroom-result';

    // Check if current user was on winning team
    var wasWinner = false;
    var wasParticipant = false;
    if (ROOM.currentUser && this._lanes) {
      var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];
      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        var ps = this._lanes[m].participants || [];
        for (var j = 0; j < ps.length; j++) {
          if (ps[j].phoneNumber === ROOM.currentUser.phoneNumber) {
            wasParticipant = true;
            if (m === winner) wasWinner = true;
            break;
          }
        }
        if (wasParticipant) break;
      }
    }

    var pointsMsg = '';
    if (wasWinner) {
      pointsMsg = '<div class="room-vroom-result-points">🏆 +8 points earned! (3 base + 5 winner bonus)</div>';
    } else if (wasParticipant) {
      pointsMsg = '<div class="room-vroom-result-points">+3 points earned!</div>';
    }

    overlay.innerHTML =
      '<div class="room-vroom-result-backdrop"></div>' +
      '<div class="room-vroom-result-modal">' +
        '<div class="room-vroom-result-video">' +
          '<video autoplay loop muted playsinline style="width:120px;height:120px;">' +
            '<source src="assets/vroom/' + winner + '.webm" type="video/webm">' +
          '</video>' +
        '</div>' +
        '<div class="room-vroom-result-title" style="color:' + color + '">🏎️ ' + this._esc(label) + ' WINS!</div>' +
        '<div class="room-vroom-result-subtitle">My Lamborghini Go Vroom Vroom!</div>' +
        pointsMsg +
        '<button class="room-vroom-result-close" id="vroomResultClose">Close</button>' +
      '</div>';

    document.body.appendChild(overlay);
    this._resultEl = overlay;

    var closeBtn = document.getElementById('vroomResultClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        self._dismissResult();
      });
    }

    setTimeout(function () {
      self._dismissResult();
    }, 15000);

    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(50);
    }
  },

  _dismissResult: function () {
    if (!this._resultEl) return;
    var el = this._resultEl;
    this._resultEl = null;

    el.classList.add('room-vroom-result--exit');
    setTimeout(function () {
      if (el.parentNode) el.remove();
    }, 400);
  },

  // ========== UI: COMPACT / CAPSULE VIEW ==========

  _scheduleAutoCompact: function (delayMs) {
    var self = this;
    this._clearAutoCompactTimer();
    this._autoCompactTimer = setTimeout(function () {
      self._minimizeToCompact();
    }, delayMs || this._initialAutoCompactMs);
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
    this._cardEl.classList.add('room-vroom-card--minimized');
    if (this._compactEl) {
      this._compactEl.classList.add('room-vroom-capsule--visible');
      if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.register('vroom', this._compactEl, this._bubbleEl, this);
    }
    if (this._bubbleEl) {
      this._bubbleEl.classList.add('room-vroom-capsule-bubbles--visible');
    }
    requestAnimationFrame(function () {
      self._positionBubblesAboveCapsule();
    });
  },

  _expandFromCompact: function () {
    this._clearAutoCompactTimer();
    if (this._cardEl) {
      this._cardEl.classList.remove('room-vroom-card--minimized');
    }
    if (this._compactEl) {
      this._compactEl.classList.remove('room-vroom-capsule--visible');
      if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('vroom');
    }
    if (this._bubbleEl) {
      this._bubbleEl.classList.remove('room-vroom-capsule-bubbles--visible');
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
    capsule.className = 'room-vroom-capsule';
    capsule.setAttribute('aria-label', 'Open Vroom Race');

    var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];
    var colors = CONFIG.vroomMemberColors || {};

    var barsHtml = '';
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var color = colors[m] || '#f7a6b9';
      barsHtml +=
        '<div class="room-vroom-capsule-bar-row">' +
          '<div class="room-vroom-capsule-bar-track">' +
            '<div class="room-vroom-capsule-bar-fill" id="vroomCapsuleFill_' + m + '" style="background:' + color + ';width:0%;"></div>' +
          '</div>' +
        '</div>';
    }

    capsule.innerHTML =
      '<div class="room-vroom-capsule-glare"></div>' +
      '<div class="room-vroom-capsule-icon">🏎️</div>' +
      '<div class="room-vroom-capsule-label">VROOM</div>' +
      '<div class="room-vroom-capsule-bars">' + barsHtml + '</div>' +
      '<div class="room-vroom-capsule-glow"></div>';

    // Bubble container
    var peopleBubbles = document.createElement('div');
    peopleBubbles.className = 'room-vroom-capsule-bubbles';
    peopleBubbles.id = 'vroomCapsuleParticipants';

    capsule.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (self._cardEl && !self._cardEl.classList.contains('room-vroom-card--minimized')) {
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
      capsule.classList.add('room-vroom-capsule--left');
      peopleBubbles.classList.add('room-vroom-capsule-bubbles--left');
    }
  },

  _removeCompactCard: function () {
    if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('vroom');
    if (this._bubbleEl) {
      this._bubbleEl.remove();
      this._bubbleEl = null;
    }
    if (!this._compactEl) return;
    this._compactEl.remove();
    this._compactEl = null;
  },

  _refreshCompactFromState: function () {
    if (!this._lanes || !this._compactEl) return;

    var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var streams = this._lanes[m].streams;
      var pct = this._target > 0 ? Math.min(100, (streams / this._target) * 100) : 0;
      var fill = document.getElementById('vroomCapsuleFill_' + m);
      if (fill) fill.style.width = pct + '%';
    }

    this._refreshCompactParticipants();
  },

  _updateCompactView: function () {
    if (!this._compactEl) return;
    this._refreshCompactFromState();
  },

  _refreshCompactParticipants: function () {
    var container = this._bubbleEl || document.getElementById('vroomCapsuleParticipants');
    if (!container || !this._lanes) return;
    container.innerHTML = '';

    // Gather all participants
    var all = [];
    var members = CONFIG.vroomMembers || ['jisoo', 'jennie', 'rose', 'lisa'];
    for (var i = 0; i < members.length; i++) {
      var ps = this._lanes[members[i]].participants || [];
      for (var j = 0; j < ps.length; j++) {
        all.push(ps[j]);
      }
    }

    var maxToShow = 4;
    for (var i = 0; i < all.length && i < maxToShow; i++) {
      var p = all[i];
      var bubble = document.createElement('div');
      bubble.className = 'room-vroom-capsule-bubble';
      if (p.profilePicture) {
        bubble.style.background = 'transparent';
        bubble.style.overflow = 'hidden';
        bubble.innerHTML = '<img src="' + p.profilePicture + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">';
      } else {
        bubble.style.background = p.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
        bubble.textContent = (p.username || '?').charAt(0).toUpperCase();
      }
      bubble.style.setProperty('--bubble-delay', (i * 0.12) + 's');
      container.appendChild(bubble);
    }

    if (all.length > maxToShow) {
      var extra = document.createElement('div');
      extra.className = 'room-vroom-capsule-bubble room-vroom-capsule-bubble--extra';
      extra.textContent = '+' + (all.length - maxToShow);
      extra.style.setProperty('--bubble-delay', (maxToShow * 0.12) + 's');
      container.appendChild(extra);
    }

    if (this._bubbleEl && this._compactEl && this._compactEl.classList.contains('room-vroom-capsule--visible')) {
      this._bubbleEl.classList.add('room-vroom-capsule-bubbles--visible');
    }

    this._positionBubblesAboveCapsule();
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
    this._bubbleEl.style.justifyContent = 'center';
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
      this._compactEl.classList[side === 'left' ? 'add' : 'remove']('room-vroom-capsule--left');
    }
    if (this._bubbleEl) {
      this._bubbleEl.classList[side === 'left' ? 'add' : 'remove']('room-vroom-capsule-bubbles--left');
    }

    this._positionBubblesAboveCapsule();

    if (!fromStack && window.ROOM && ROOM.CapsuleStack && ROOM.CapsuleStack.setSide) {
      ROOM.CapsuleStack.setSide(side);
    }
  },

  // ========== CLEANUP ==========

  _removeFullView: function () {
    this._clearAutoCompactTimer();

    if (!this._cardEl) {
      this._removeCompactCard();
      return;
    }

    var card = this._cardEl;
    this._cardEl = null;

    card.classList.add('room-vroom-card--exit');
    setTimeout(function () {
      if (card.parentNode) card.remove();
    }, 500);

    this._removeCompactCard();
  },

  // ========== UTILITIES ==========

  _sendPushNotification: function (title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var n = new Notification(title, {
        body: body,
        icon: 'assets/logo/lightstick.png',
        tag: tag || 'vroom',
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
    if (this._checkInterval) clearInterval(this._checkInterval);
    this._clearAutoCompactTimer();
    this._stopJoinCheck();
    this._stopStreamMonitoring();
    this._removeFullView();
    this._removeCompactCard();
    if (this._resultEl) {
      this._resultEl.remove();
      this._resultEl = null;
    }
  }
};
