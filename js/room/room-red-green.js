/**
 * Room Red Green
 * Personal event: user must stream the main song alternating
 * YouTube (Red) → Spotify (Green) → YouTube → Spotify.
 * YouTube: 60s per step. Spotify: 30s per step.
 * 4 points awarded on completion of all 4 steps. No partial points.
 * No time limit — user can end anytime.
 */

window.ROOM = window.ROOM || {};

ROOM.RedGreen = {
  _checkInterval: null,
  _songCheckInterval: null,
  _timerInterval: null,
  _progressSaveInterval: null,
  _activeEventId: null,
  _eventData: null,
  _currentStepSeconds: 0,
  _isListeningCorrectly: false,
  _albumArtCache: {},
  _capsuleArtLoaded: false,

  // Platform order for the 4 steps
  _stepPlatforms: ['youtube', 'spotify', 'youtube', 'spotify'],
  _stepLabels: ['YouTube', 'Spotify', 'YouTube', 'Spotify'],
  _stepColors: ['#FF0000', '#1DB954', '#FF0000', '#1DB954'],

  _cardEl: null,
  _compactEl: null,
  _bubbleEl: null,
  _thankYouEl: null,
  _autoCompactTimer: null,
  _initialAutoCompactMs: 8000,
  _expandedAutoCompactMs: 20000,
  _capsuleSide: 'right',
  _swipeStartX: null,
  _swipeStartY: null,

  init: function () {
    this._startPeriodicCheck();
  },

  // ========== SCHEDULING ==========

  _startPeriodicCheck: function () {
    var self = this;
    var interval = CONFIG.redGreenCheckInterval || 60000;

    self._tryTrigger();

    this._checkInterval = setInterval(function () {
      self._tryTrigger();
    }, interval);
  },

  _tryTrigger: function () {
    if (this._activeEventId) return;
    if (!ROOM.Events.canFireEvent()) return; // 10s grace period after joining
    if (!ROOM.currentUser) return;

    var chance = CONFIG.redGreenTriggerChance || 0.15;
    if (Math.random() > chance) return;

    // Pick 1 random song from the catalog
    var allSongs = CONFIG.listenAlongSongs || [];
    if (allSongs.length < 1) return;

    var picked = allSongs[Math.floor(Math.random() * allSongs.length)];

    var self = this;
    ConvexService.mutation('redGreen:startRedGreen', {
      roomId: ROOM.Firebase.roomId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      username: ROOM.currentUser.username,
      songName: picked.name,
      songArtist: picked.artist,
      cooldownMs: CONFIG.redGreenCooldown
    }).then(function (eventId) {
      if (!eventId) return;
      // Fetch the created event
      ConvexService.query('redGreen:getActiveRedGreen', {
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
    if (!ROOM.currentUser || event.phoneNumber !== ROOM.currentUser.phoneNumber) return;

    this._activeEventId = event._id;
    this._eventData = {
      songName: event.songName,
      songArtist: event.songArtist,
      steps: event.steps.map(function (s) { return Object.assign({}, s); }),
      currentStepIndex: event.currentStepIndex,
      startedAt: event.startedAt
    };

    // Restore listen progress from server if available
    var currentStep = this._eventData.steps[this._eventData.currentStepIndex];
    if (currentStep && currentStep.listenedSeconds) {
      this._currentStepSeconds = currentStep.listenedSeconds;
    } else {
      this._currentStepSeconds = 0;
    }
    this._isListeningCorrectly = false;

    this._showEventCard();
    this._startSongCheck();
    this._startProgressSave();

    var stepLabel = this._stepLabels[0] || 'YouTube';
    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('energy', '🔴🟢',
        '<strong>Red Green!</strong> Stream on ' + stepLabel + ' → Spotify → YouTube → Spotify for 4 points!');
    }

    this._sendPushNotification(
      'Red Green!',
      'Stream ' + event.songName + ' on alternating platforms for 4 points!',
      'red-green-start'
    );
  },

  // ========== SONG DETECTION ==========

  _startSongCheck: function () {
    var self = this;
    if (this._songCheckInterval) clearInterval(this._songCheckInterval);

    this._songCheckInterval = setInterval(function () {
      self._checkCurrentSong();
    }, CONFIG.redGreenSongCheckInterval || 3000);
  },

  _stopSongCheck: function () {
    if (this._songCheckInterval) {
      clearInterval(this._songCheckInterval);
      this._songCheckInterval = null;
    }
  },

  _checkCurrentSong: function () {
    if (!this._activeEventId || !this._eventData || !ROOM.currentUser) return;

    var idx = this._eventData.currentStepIndex;
    if (idx >= this._eventData.steps.length) return;

    var requiredStep = this._eventData.steps[idx];
    if (!requiredStep || requiredStep.status !== 'active') return;

    var participants = ROOM.Firebase.getParticipants();
    var me = null;
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === ROOM.currentUser.phoneNumber) {
        me = participants[i];
        break;
      }
    }

    if (!me || !me.data.currentTrack || !me.data.currentTrack.nowPlaying) {
      if (this._isListeningCorrectly) {
        this._isListeningCorrectly = false;
        this._pauseListenTimer();
      }
      return;
    }

    // Check if playing the correct song
    var isCorrectSong = ROOM.LastFM.isSameSong(
      me.data.currentTrack.name, me.data.currentTrack.artist,
      this._eventData.songName, this._eventData.songArtist
    );

    if (!isCorrectSong) {
      if (this._isListeningCorrectly) {
        this._isListeningCorrectly = false;
        this._pauseListenTimer();
        this._updateStatusBar();
      }
      return;
    }

    // Check if on the correct platform
    var detectedPlatform = ROOM.LastFM.detectPlatform(
      me.data.currentTrack.name,
      me.data.currentTrack.albumArt
    );

    var isCorrectPlatform = detectedPlatform === requiredStep.platform;

    if (isCorrectSong && isCorrectPlatform) {
      if (!this._isListeningCorrectly) {
        this._isListeningCorrectly = true;
        this._startListenTimer();
        this._updateStatusBar();
      }
    } else {
      if (this._isListeningCorrectly) {
        this._isListeningCorrectly = false;
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
    this._currentStepSeconds++;
    var idx = this._eventData.currentStepIndex;
    var step = this._eventData.steps[idx];
    var required = step.platform === 'youtube' ? 60 : 30;
    this._updateStepProgress(idx, this._currentStepSeconds, required);

    if (this._currentStepSeconds >= required) {
      this._completeStep();
    }
  },

  _completeStep: function () {
    this._pauseListenTimer();
    this._isListeningCorrectly = false;

    var idx = this._eventData.currentStepIndex;
    var self = this;

    ConvexService.mutation('redGreen:advanceStep', {
      redGreenId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      stepIndex: idx,
      listenedSeconds: this._currentStepSeconds
    }).then(function (result) {
      if (!result) return;

      self._currentStepSeconds = 0;

      if (result.pointsAwarded) {
        // All 4 steps done!
        self._eventData.steps[idx].status = 'completed';
        self._eventData.currentStepIndex = self._eventData.steps.length;
        self._playCapsuleSuccessAnimation();
        self._handleCompletion(result.pointsAwarded);
      } else {
        // Advance to next
        self._eventData.steps[idx].status = 'completed';
        self._eventData.currentStepIndex = result.nextIndex;
        if (result.nextIndex < self._eventData.steps.length) {
          self._eventData.steps[result.nextIndex].status = 'active';
        }
        self._refreshStepList();

        self._playCapsuleSuccessAnimation();

        if (ROOM.Animations && ROOM.Animations.showToast) {
          var nextPlatform = self._stepLabels[result.nextIndex];
          var color = result.nextIndex % 2 === 0 ? '🔴' : '🟢';
          ROOM.Animations.showToast('join', '✅',
            '<strong>Step completed!</strong> Now play on <strong>' + color + ' ' + nextPlatform + '</strong>');
        }
      }
    });
  },

  // ========== PROGRESS SAVE HEARTBEAT ==========

  _startProgressSave: function () {
    var self = this;
    if (this._progressSaveInterval) return;

    this._progressSaveInterval = setInterval(function () {
      if (!self._activeEventId || !self._isListeningCorrectly) return;
      if (!self._eventData || self._eventData.currentStepIndex >= self._eventData.steps.length) return;

      ConvexService.mutation('redGreen:updateListenProgress', {
        redGreenId: self._activeEventId,
        phoneNumber: ROOM.currentUser.phoneNumber,
        stepIndex: self._eventData.currentStepIndex,
        listenedSeconds: self._currentStepSeconds
      });
    }, CONFIG.redGreenProgressSaveInterval || 5000);
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
    card.className = 'room-red-green-card';

    card.innerHTML =
      '<div class="room-red-green-glow"></div>' +
      '<div class="room-red-green-content">' +
        '<div class="room-red-green-header">' +
          '<div class="room-red-green-badge">' +
            '<span class="room-red-green-badge-dot room-red-green-badge-dot--red"></span>' +
            '<span class="room-red-green-badge-dot room-red-green-badge-dot--green"></span>' +
            ' RED GREEN' +
          '</div>' +
          '<div class="room-red-green-header-actions">' +
            '<button class="room-red-green-quit" id="redGreenQuitBtn" type="button">Quit</button>' +
            '<button class="room-red-green-minimize" id="redGreenMinimizeBtn" type="button" aria-label="Minimize">-</button>' +
          '</div>' +
        '</div>' +
        '<div class="room-red-green-song-display" id="redGreenSongDisplay"></div>' +
        '<div class="room-red-green-steps" id="redGreenSteps"></div>' +
        '<div class="room-red-green-status" id="redGreenStatus"></div>' +
        '<div class="room-red-green-points">' +
          '<span class="room-red-green-points-label">Complete all 4 steps for <strong>4 points</strong>!</span>' +
        '</div>' +
      '</div>';

    overlay.appendChild(card);
    this._cardEl = card;

    // Wire up buttons
    var quitBtn = card.querySelector('#redGreenQuitBtn');
    if (quitBtn) {
      quitBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._quitEvent();
      });
    }

    var minimizeBtn = card.querySelector('#redGreenMinimizeBtn');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._minimizeToCompact();
      });
    }

    this._renderSongDisplay();
    this._refreshStepList();
    this._scheduleAutoCompact(this._initialAutoCompactMs);

    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(15);
    }
  },

  _renderSongDisplay: function () {
    var container = this._cardEl ? this._cardEl.querySelector('#redGreenSongDisplay') : null;
    if (!container || !this._eventData) return;
    var self = this;

    container.innerHTML =
      '<div class="room-red-green-song-art" id="redGreenSongArt">' +
        '<div class="room-red-green-song-art-placeholder">♪</div>' +
      '</div>' +
      '<div class="room-red-green-song-info">' +
        '<div class="room-red-green-song-name">' + this._esc(this._eventData.songName) + '</div>' +
        '<div class="room-red-green-song-artist">' + this._esc(this._eventData.songArtist) + '</div>' +
      '</div>';

    this._fetchAlbumArt(this._eventData.songName, this._eventData.songArtist, function (artUrl) {
      var artEl = container.querySelector('#redGreenSongArt');
      if (artEl && artUrl) {
        artEl.innerHTML = '<img src="' + self._esc(artUrl) + '" alt="Album art" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">';
      }
    });
  },

  _refreshStepList: function () {
    var container = this._cardEl ? this._cardEl.querySelector('#redGreenSteps') : null;
    if (!container || !this._eventData) return;
    container.innerHTML = '';

    for (var i = 0; i < this._eventData.steps.length; i++) {
      var step = this._eventData.steps[i];
      var isActive = step.status === 'active';
      var isCompleted = step.status === 'completed';
      var platformLabel = this._stepLabels[i];
      var platformColor = this._stepColors[i];

      var statusIcon = isCompleted ? '✅' : isActive ?
        ('<div class="room-voice-bubble-wave">' +
          '<div class="room-voice-wave-bar"></div>' +
          '<div class="room-voice-wave-bar"></div>' +
          '<div class="room-voice-wave-bar"></div>' +
          '<div class="room-voice-wave-bar"></div>' +
          '<div class="room-voice-wave-bar"></div>' +
        '</div>') :
        '🔒';

      var stepClass = 'room-red-green-step';
      if (isActive) stepClass += ' room-red-green-step--active';
      if (isCompleted) stepClass += ' room-red-green-step--completed';
      if (step.status === 'pending') stepClass += ' room-red-green-step--pending';
      if (isActive && this._isListeningCorrectly) stepClass += ' room-red-green-step--playing';

      var required = step.platform === 'youtube' ? 60 : 30;
      var progressHtml = '';
      if (isActive) {
        var pct = Math.min(100, (this._currentStepSeconds / required) * 100);
        progressHtml =
          '<div class="room-red-green-step-progress">' +
            '<div class="room-red-green-step-progress-bar">' +
              '<div class="room-red-green-step-progress-fill" data-step-index="' + i + '" style="width:' + pct + '%;background:' + platformColor + '"></div>' +
            '</div>' +
            '<span class="room-red-green-step-timer" data-step-timer="' + i + '">' +
              this._currentStepSeconds + 's / ' + required + 's' +
            '</span>' +
          '</div>';
      }

      var entry = document.createElement('div');
      entry.className = stepClass;
      entry.innerHTML =
        '<div class="room-red-green-step-number" style="color:' + platformColor + '">' + (i + 1) + '</div>' +
        '<div class="room-red-green-step-status">' + statusIcon + '</div>' +
        '<div class="room-red-green-step-info">' +
          '<div class="room-red-green-step-platform" style="color:' + platformColor + '">' +
            (step.platform === 'youtube' ? '🔴' : '🟢') + ' ' + platformLabel +
          '</div>' +
          '<div class="room-red-green-step-time">' + required + 's required</div>' +
        '</div>' +
        progressHtml;

      container.appendChild(entry);
    }

    this._updateStatusBar();
  },

  _updateStepProgress: function (stepIndex, seconds, required) {
    var fill = this._cardEl ? this._cardEl.querySelector('[data-step-index="' + stepIndex + '"]') : null;
    if (fill) {
      fill.style.width = Math.min(100, (seconds / required) * 100) + '%';
    }
    var timer = this._cardEl ? this._cardEl.querySelector('[data-step-timer="' + stepIndex + '"]') : null;
    if (timer) {
      timer.textContent = seconds + 's / ' + required + 's';
    }

    this._updateCapsuleProgress();
    this._updateCapsuleRing();
  },

  _updateStatusBar: function () {
    var statusEl = this._cardEl ? this._cardEl.querySelector('#redGreenStatus') : null;
    if (!statusEl || !this._eventData) return;

    var idx = this._eventData.currentStepIndex;
    var stepEls = this._cardEl.querySelectorAll('.room-red-green-step');

    for (var j = 0; j < stepEls.length; j++) {
      if (j === idx && this._isListeningCorrectly) {
        stepEls[j].classList.add('room-red-green-step--playing');
      } else {
        stepEls[j].classList.remove('room-red-green-step--playing');
      }
    }

    if (idx >= this._eventData.steps.length) {
      statusEl.innerHTML =
        '<div class="room-red-green-status-icon">🎉</div>' +
        '<span><strong>All steps completed!</strong></span>';
      statusEl.classList.add('room-red-green-status--completed');
      return;
    }

    var currentStep = this._eventData.steps[idx];
    var platformLabel = this._stepLabels[idx];

    if (this._isListeningCorrectly) {
      var emoji = currentStep.platform === 'youtube' ? '🔴' : '🟢';
      statusEl.innerHTML =
        '<div class="room-red-green-status-icon">' + emoji + '</div>' +
        '<span>Listening on <strong>' + platformLabel + '</strong>... keep playing!</span>';
      statusEl.classList.add('room-red-green-status--listening');
      statusEl.classList.remove('room-red-green-status--waiting');
    } else {
      var playEmoji = currentStep.platform === 'youtube' ? '🔴' : '🟢';
      statusEl.innerHTML =
        '<div class="room-red-green-status-icon">' + playEmoji + '</div>' +
        '<span>Play <strong>' + this._esc(this._eventData.songName) + '</strong> on <strong>' + platformLabel + '</strong>!</span>';
      statusEl.classList.remove('room-red-green-status--listening');
      statusEl.classList.add('room-red-green-status--waiting');
    }
  },

  // ========== ALBUM ART ==========

  _fetchAlbumArt: function (songName, songArtist, callback) {
    var self = this;
    var cacheKey = songArtist + '::' + songName;

    if (this._albumArtCache[cacheKey]) {
      if (callback) callback(this._albumArtCache[cacheKey]);
      return;
    }

    var apiKey = CONFIG.lastfmApiKey;
    if (!apiKey) return;

    var url = 'https://ws.audioscrobbler.com/2.0/?method=track.getInfo' +
      '&api_key=' + encodeURIComponent(apiKey) +
      '&artist=' + encodeURIComponent(songArtist) +
      '&track=' + encodeURIComponent(songName) +
      '&format=json';

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (json) {
        var artUrl = null;
        if (json.track && json.track.album && json.track.album.image) {
          var images = json.track.album.image;
          for (var i = images.length - 1; i >= 0; i--) {
            if (images[i]['#text'] && images[i]['#text'].length > 0) {
              artUrl = images[i]['#text'];
              break;
            }
          }
        }
        if (artUrl) {
          self._albumArtCache[cacheKey] = artUrl;
          if (callback) callback(artUrl);
        }
      })
      .catch(function () { /* silent fail */ });
  },

  _updateCapsuleAlbumArt: function () {
    if (!this._compactEl || !this._eventData) return;
    var self = this;

    this._fetchAlbumArt(this._eventData.songName, this._eventData.songArtist, function (artUrl) {
      var artEl = self._compactEl ? self._compactEl.querySelector('#redGreenCapsuleArt') : null;
      if (!artEl) return;
      artEl.innerHTML = '<img src="' + self._esc(artUrl) + '" alt="Album art" class="room-red-green-capsule-art-img" loading="lazy">';
      self._capsuleArtLoaded = true;
    });
  },

  _updateCapsuleRing: function () {
    var ringFill = this._compactEl ? this._compactEl.querySelector('#redGreenCapsuleRingFill') : null;
    if (!ringFill || !this._eventData) return;

    var idx = this._eventData.currentStepIndex;
    if (idx >= this._eventData.steps.length) return;
    var step = this._eventData.steps[idx];
    var required = step.platform === 'youtube' ? 60 : 30;
    var pct = Math.min(1, this._currentStepSeconds / required);
    var circumference = 2 * Math.PI * 32;
    var offset = circumference * (1 - pct);
    ringFill.style.strokeDasharray = circumference;
    ringFill.style.strokeDashoffset = offset;

    // Color the ring based on current platform
    ringFill.style.stroke = step.platform === 'youtube' ? '#FF0000' : '#1DB954';
  },

  _playCapsuleSuccessAnimation: function () {
    var self = this;
    var wrap = this._compactEl ? this._compactEl.querySelector('#redGreenCapsuleRingWrap') : null;
    if (!wrap) return;

    var ringFill = wrap.querySelector('#redGreenCapsuleRingFill');

    // Flash the ring
    if (ringFill) {
      ringFill.style.stroke = '#25D366';
    }

    setTimeout(function () {
      if (ringFill) {
        ringFill.style.stroke = '';
        var circumference = 2 * Math.PI * 32;
        ringFill.style.strokeDasharray = circumference;
        ringFill.style.strokeDashoffset = circumference;
      }

      // Update capsule dots
      self._updateCapsuleDots();
    }, 1200);
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
    this._cardEl.classList.add('room-red-green-card--minimized');
    if (this._compactEl) {
      this._compactEl.classList.add('room-red-green-capsule--visible');
      if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.register('red-green', this._compactEl, this._bubbleEl, this);
    }
    if (this._bubbleEl) {
      this._bubbleEl.classList.add('room-red-green-capsule-bubbles--visible');
    }
    requestAnimationFrame(function () {
      self._positionBubblesAboveCapsule();
    });
  },

  _expandFromCompact: function () {
    this._clearAutoCompactTimer();
    if (this._cardEl) {
      this._cardEl.classList.remove('room-red-green-card--minimized');
    }
    if (this._compactEl) {
      this._compactEl.classList.remove('room-red-green-capsule--visible');
      if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('red-green');
    }
    if (this._bubbleEl) {
      this._bubbleEl.classList.remove('room-red-green-capsule-bubbles--visible');
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
    capsule.className = 'room-red-green-capsule';
    capsule.setAttribute('aria-label', 'Open Red Green');
    capsule.innerHTML =
      '<div class="room-red-green-capsule-glare"></div>' +
      '<div class="room-red-green-capsule-icon">' +
        '<span class="room-red-green-capsule-dot room-red-green-capsule-dot--red"></span>' +
        '<span class="room-red-green-capsule-dot room-red-green-capsule-dot--green"></span>' +
      '</div>' +
      '<div class="room-red-green-capsule-label">RED GREEN</div>' +
      '<div class="room-red-green-capsule-progress" id="redGreenCapsuleProgress">0/4</div>' +
      '<div class="room-red-green-capsule-dots" id="redGreenCapsuleDots"></div>' +
      '<div class="room-red-green-capsule-ring-wrap" id="redGreenCapsuleRingWrap">' +
        '<svg class="room-red-green-capsule-ring-svg" viewBox="0 0 72 72" width="72" height="72">' +
          '<circle class="room-red-green-capsule-ring-bg" cx="36" cy="36" r="32" />' +
          '<circle class="room-red-green-capsule-ring-fill" id="redGreenCapsuleRingFill" cx="36" cy="36" r="32" />' +
        '</svg>' +
        '<div class="room-red-green-capsule-art-circle" id="redGreenCapsuleArt">' +
          '<div class="room-red-green-capsule-art-placeholder">♪</div>' +
        '</div>' +
      '</div>' +
      '<div class="room-red-green-capsule-glow"></div>';

    var peopleBubbles = document.createElement('div');
    peopleBubbles.className = 'room-red-green-capsule-bubbles';
    peopleBubbles.id = 'redGreenCapsuleBubbles';
    capsule._bubbleContainer = peopleBubbles;

    capsule.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (self._cardEl && !self._cardEl.classList.contains('room-red-green-card--minimized')) {
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
      capsule.classList.add('room-red-green-capsule--left');
      peopleBubbles.classList.add('room-red-green-capsule-bubbles--left');
    }
  },

  _removeCompactCard: function () {
    if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('red-green');
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
    for (var i = 0; i < this._eventData.steps.length; i++) {
      if (this._eventData.steps[i].status === 'completed') completed++;
    }

    var progressEl = this._compactEl.querySelector('#redGreenCapsuleProgress');
    if (progressEl) {
      progressEl.textContent = completed + '/4';
    }

    this._updateCapsuleDots();
    this._updateCapsuleAlbumArt();
    this._updateCapsuleRing();
  },

  _updateCapsuleDots: function () {
    var dotsEl = this._compactEl ? this._compactEl.querySelector('#redGreenCapsuleDots') : null;
    if (!dotsEl || !this._eventData) return;
    dotsEl.innerHTML = '';

    for (var i = 0; i < this._eventData.steps.length; i++) {
      var dot = document.createElement('div');
      dot.className = 'room-red-green-capsule-dot-indicator';
      var color = this._stepColors[i];
      if (this._eventData.steps[i].status === 'completed') {
        dot.classList.add('room-red-green-capsule-dot-indicator--completed');
        dot.style.background = color;
      } else if (this._eventData.steps[i].status === 'active') {
        dot.classList.add('room-red-green-capsule-dot-indicator--active');
        dot.style.background = color;
      } else {
        dot.style.background = 'rgba(255,255,255,0.2)';
      }
      dotsEl.appendChild(dot);
    }
  },

  _updateCapsuleProgress: function () {
    if (!this._compactEl || !this._eventData) return;

    var completed = 0;
    for (var i = 0; i < this._eventData.steps.length; i++) {
      if (this._eventData.steps[i].status === 'completed') completed++;
    }

    var progressEl = this._compactEl.querySelector('#redGreenCapsuleProgress');
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
        this._compactEl.classList.add('room-red-green-capsule--left');
      } else {
        this._compactEl.classList.remove('room-red-green-capsule--left');
      }
    }

    if (this._bubbleEl) {
      if (side === 'left') {
        this._bubbleEl.classList.add('room-red-green-capsule-bubbles--left');
      } else {
        this._bubbleEl.classList.remove('room-red-green-capsule-bubbles--left');
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

    card.classList.add('room-red-green-card--exit');
    setTimeout(function () {
      if (card.parentNode) card.remove();
    }, 500);

    this._removeCompactCard();
  },

  _resetState: function () {
    this._activeEventId = null;
    this._eventData = null;
    this._currentStepSeconds = 0;
    this._isListeningCorrectly = false;
    this._albumArtCache = {};
    this._capsuleArtLoaded = false;
    this._stopSongCheck();
    this._pauseListenTimer();
    this._stopProgressSave();
  },

  // ========== QUIT ==========

  _quitEvent: function () {
    if (!this._activeEventId) return;

    var self = this;
    ConvexService.mutation('redGreen:endRedGreen', {
      redGreenId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber
    }).then(function () {
      self._removeEventCard();
      self._resetState();

      if (ROOM.Animations && ROOM.Animations.showToast) {
        ROOM.Animations.showToast('energy', '❌',
          '<strong>Red Green ended.</strong> No points awarded.');
      }
    });
  },

  // ========== COMPLETION ==========

  _handleCompletion: function (pointsAwarded) {
    this._stopSongCheck();
    this._pauseListenTimer();
    this._stopProgressSave();

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

    var stepsHtml = '';
    for (var i = 0; i < 4; i++) {
      var label = this._stepLabels[i];
      var emoji = i % 2 === 0 ? '🔴' : '🟢';
      stepsHtml +=
        '<div class="room-red-green-ty-step">' +
          '<span class="room-red-green-ty-step-check">✅</span>' +
          '<span class="room-red-green-ty-step-label">' + emoji + ' ' + label + '</span>' +
        '</div>';
    }

    var overlay = document.createElement('div');
    overlay.className = 'room-red-green-thankyou';
    overlay.innerHTML =
      '<div class="room-red-green-ty-backdrop"></div>' +
      '<div class="room-red-green-ty-modal">' +
        '<div class="room-red-green-ty-icon">' +
          '<span style="font-size:56px;">🔴🟢</span>' +
        '</div>' +
        '<div class="room-red-green-ty-title">Red Green Complete!</div>' +
        '<div class="room-red-green-ty-points-big">+' + (pointsAwarded || 4) + ' points earned!</div>' +
        '<div class="room-red-green-ty-desc">You streamed on all 4 platforms! Amazing!</div>' +
        '<div class="room-red-green-ty-song">' +
          this._esc(this._eventData ? this._eventData.songName : '') + ' — ' +
          this._esc(this._eventData ? this._eventData.songArtist : '') +
        '</div>' +
        '<div class="room-red-green-ty-list">' + stepsHtml + '</div>' +
        '<button class="room-red-green-ty-close" id="redGreenCloseBtn">Close</button>' +
      '</div>';

    document.body.appendChild(overlay);
    this._thankYouEl = overlay;

    var closeBtn = document.getElementById('redGreenCloseBtn');
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

    el.classList.add('room-red-green-thankyou--exit');
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
        tag: tag || 'red-green',
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
