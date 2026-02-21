/**
 * Room Listen Along
 * Hourly mini-event: a BLACKPINK member's Spotify Listen Along.
 * Auto-triggers when 2+ users online; users join by playing music.
 */

window.ROOM = window.ROOM || {};

ROOM.ListenAlong = {
  _checkInterval: null,
  _countdownInterval: null,
  _joinCheckInterval: null,
  _activeEventId: null,
  _hasJoined: false,
  _cardEl: null,
  _compactEl: null,
  _bubbleEl: null,
  _autoCompactTimer: null,
  _initialAutoCompactMs: 10000,
  _expandedAutoCompactMs: 20000,
  _eventMeta: null,
  _participantsByPhone: {},
  _thankYouEl: null,
  _gifCache: {},
  _albumArtCache: {},
  _requiredSong: null,
  _capsuleSide: 'right',
  _swipeStartX: null,
  _swipeStartY: null,

  init: function () {
    this._startPeriodicCheck();
  },

  // ========== SCHEDULING ==========

  _startPeriodicCheck: function () {
    var self = this;
    var interval = CONFIG.listenAlongCheckInterval || 60000;

    // Try immediately so users don't wait a full interval after joining.
    self._tryTrigger();

    this._checkInterval = setInterval(function () {
      self._tryTrigger();
    }, interval);
  },

  _tryTrigger: function () {
    if (this._activeEventId) return; // Event already active

    var participants = ROOM.Firebase.getParticipants();
    var onlineUsers = participants.filter(function (p) { return p.data.isOnline; });

    if (onlineUsers.length < 2) return;
    if (!ROOM.currentUser) return;

    // Random chance gate
    var chance = CONFIG.listenAlongTriggerChance || 0.15;
    if (Math.random() > chance) return;

    // Pick a random BLACKPINK song from the catalog
    var songs = CONFIG.listenAlongSongs || [];
    if (songs.length === 0) return;
    var song = songs[Math.floor(Math.random() * songs.length)];

    // Server-side dedup handles the 1-hour cooldown
    ConvexService.mutation('listenAlong:startListenAlong', {
      roomId: ROOM.Firebase.roomId,
      songName: song.name,
      songArtist: song.artist,
      cooldownMs: CONFIG.listenAlongCooldown,
      durationMs: CONFIG.listenAlongDuration
    });
  },

  // ========== EVENT HANDLERS (called from room-events.js) ==========

  handleStart: function (data) {
    this._activeEventId = data.listenAlongId;
    this._hasJoined = false;
    this._requiredSong = { name: data.songName, artist: data.songArtist };
    this._showEventCard(data.member, data.endsAt, data.duration || CONFIG.listenAlongDuration, [], data.songName, data.songArtist);
    this._startJoinCheck();

    // Toast notification
    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('energy', '🎵',
        '<strong>' + this._esc(data.member) + '\'s Listen Along</strong> just started! Play <strong>' + this._esc(data.songName) + '</strong> to join!');
    }

    // Browser push notification (works when tab is in background)
    this._sendPushNotification(
      data.member + '\'s Listen Along!',
      'Play ' + data.songName + ' by ' + data.songArtist + ' to join and earn points!',
      'listen-along-start'
    );
  },

  handleJoin: function (data) {
    if (!this._activeEventId) return;
    this._addParticipantToCard(data);

    // Check if this is the current user joining
    if (ROOM.currentUser && data.phoneNumber === ROOM.currentUser.phoneNumber) {
      this._hasJoined = true;
      this._updateJoinStatus(true);
    }
  },

  handleEnd: function (data) {
    this._stopJoinCheck();

    // Check if current user was a participant
    var wasParticipant = false;
    if (ROOM.currentUser && data.participants) {
      for (var i = 0; i < data.participants.length; i++) {
        if (data.participants[i].phoneNumber === ROOM.currentUser.phoneNumber) {
          wasParticipant = true;
          break;
        }
      }
    }

    this._removeEventCard();

    if (wasParticipant) {
      this._showThankYouDialog(data);
    }

    this._activeEventId = null;
    this._hasJoined = false;
    this._requiredSong = null;
  },

  // Called from Convex subscription for late joiners
  handleActiveEvent: function (event) {
    if (!event || this._activeEventId) return; // Already showing
    if (Date.now() > event.endsAt) return; // Expired

    this._activeEventId = event._id;
    this._hasJoined = false;
    this._requiredSong = { name: event.songName, artist: event.songArtist };

    // Check if current user already joined
    if (ROOM.currentUser && event.participants) {
      for (var i = 0; i < event.participants.length; i++) {
        if (event.participants[i].phoneNumber === ROOM.currentUser.phoneNumber) {
          this._hasJoined = true;
          break;
        }
      }
    }

    var duration = event.endsAt - event.startedAt;
    this._showEventCard(event.member, event.endsAt, duration, event.participants || [], event.songName, event.songArtist);
    if (!this._hasJoined) {
      this._startJoinCheck();
    }
    this._updateJoinStatus(this._hasJoined);
  },

  // ========== AUTO-JOIN ==========

  _startJoinCheck: function () {
    var self = this;
    if (this._joinCheckInterval) clearInterval(this._joinCheckInterval);

    this._joinCheckInterval = setInterval(function () {
      self._checkAndJoin();
    }, CONFIG.listenAlongJoinCheckInterval || 5000);
  },

  _stopJoinCheck: function () {
    if (this._joinCheckInterval) {
      clearInterval(this._joinCheckInterval);
      this._joinCheckInterval = null;
    }
  },

  _checkAndJoin: function () {
    if (!this._activeEventId || this._hasJoined || !ROOM.currentUser) return;
    if (!this._requiredSong) return;

    var participants = ROOM.Firebase.getParticipants();
    var me = null;
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === ROOM.currentUser.phoneNumber) {
        me = participants[i];
        break;
      }
    }

    if (!me || !me.data.currentTrack || !me.data.currentTrack.nowPlaying) return;

    // Check if user is playing the REQUIRED song (fuzzy match)
    var isCorrectSong = ROOM.LastFM.isSameSong(
      me.data.currentTrack.name, me.data.currentTrack.artist,
      this._requiredSong.name, this._requiredSong.artist
    );
    if (!isCorrectSong) return; // Wrong song — don't join

    // User is playing the correct song — auto-join!
    this._hasJoined = true;
    this._stopJoinCheck();
    this._updateJoinStatus(true);

    ConvexService.mutation('listenAlong:joinListenAlong', {
      roomId: ROOM.Firebase.roomId,
      listenAlongId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      username: ROOM.currentUser.username,
      avatarColor: ROOM.currentUser.avatarColor,
      trackName: me.data.currentTrack.name || undefined,
      trackArtist: me.data.currentTrack.artist || undefined,
      albumArt: me.data.currentTrack.albumArt || undefined
    });
  },

  // ========== UI: EVENT CARD ==========

  _showEventCard: function (member, endsAt, duration, existingParticipants, songName, songArtist) {
    var self = this;
    this._removeEventCard();
    this._participantsByPhone = {};
    this._eventMeta = {
      member: member,
      endsAt: endsAt,
      duration: duration,
      songName: songName,
      songArtist: songArtist
    };

    var overlay = document.getElementById('eventOverlay');
    if (!overlay) return;

    var card = document.createElement('div');
    card.className = 'room-listen-along-card';

    var songDisplayName = songName ? this._esc(songName) : 'a BLACKPINK song';
    var songDisplayArtist = songArtist ? this._esc(songArtist) : '';

    card.innerHTML =
      '<div class="room-listen-along-glow"></div>' +
      '<div class="room-listen-along-content">' +
      '<div class="room-listen-along-header">' +
      '<div class="room-listen-along-badge">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.7 1.32.42.18.48.66.24 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.99-.12-1.11-.6-.12-.48.12-.99.6-1.11 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.21 1.17zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-.96.6-1.5.3z"/></svg>' +
      ' LISTEN ALONG' +
      '</div>' +
      '<div class="room-listen-along-header-actions">' +
      '<span class="room-listen-along-countdown" id="listenAlongCountdown">--:--</span>' +
      '<button class="room-listen-along-minimize" id="listenAlongMinimizeBtn" type="button" aria-label="Minimize Listen Along">-</button>' +
      '</div>' +
      '</div>' +
      '<div class="room-listen-along-title">' + this._esc(member) + '\'s Spotify Listen Along</div>' +
      '<div class="room-listen-along-gif" id="listenAlongGif"></div>' +
      '<div class="room-listen-along-song" id="listenAlongSong">' +
      '<div class="room-listen-along-song-art" id="listenAlongSongArt">' +
      '<div class="room-listen-along-song-art-placeholder">♪</div>' +
      '</div>' +
      '<div class="room-listen-along-song-info">' +
      '<div class="room-listen-along-song-name">' + songDisplayName + '</div>' +
      '<div class="room-listen-along-song-artist">' + songDisplayArtist + '</div>' +
      '</div>' +
      '<div class="room-listen-along-song-badge">' +
      '<svg viewBox="0 0 24 24" fill="#1DB954" width="18" height="18"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.7 1.32.42.18.48.66.24 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.99-.12-1.11-.6-.12-.48.12-.99.6-1.11 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.21 1.17zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-.96.6-1.5.3z"/></svg>' +
      '</div>' +
      '</div>' +
      '<div class="room-listen-along-progress">' +
      '<div class="room-listen-along-progress-bar">' +
      '<div class="room-listen-along-progress-fill" id="listenAlongProgressFill"></div>' +
      '</div>' +
      '</div>' +
      '<div class="room-listen-along-participants" id="listenAlongParticipants"></div>' +
      '<div class="room-listen-along-points" id="listenAlongPoints">' +
      '' +
      '<span class="room-listen-along-points-label">Worth <strong>0 points</strong> per person — more joiners = more points!</span>' +
      '</div>' +
      '<div class="room-listen-along-status" id="listenAlongStatus">' +
      '<div class="room-listen-along-status-icon">🎧</div>' +
      '<span>Play <strong>' + songDisplayName + '</strong> to join!</span>' +
      '</div>' +
      '</div>';

    overlay.appendChild(card);
    this._cardEl = card;

    var minimizeBtn = card.querySelector('#listenAlongMinimizeBtn');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._minimizeToCompact();
      });
    }

    // Fetch and display member GIF
    this._loadMemberGif(member, card);

    // Fetch album art from Last.fm
    if (songName && songArtist) {
      this._fetchAlbumArt(songName, songArtist, card);
    }

    // Render existing participants (for late joiners)
    if (existingParticipants && existingParticipants.length > 0) {
      for (var i = 0; i < existingParticipants.length; i++) {
        this._addParticipantToCard(existingParticipants[i], card);
      }
    }

    // Update points display with initial participant count
    this._updatePointsDisplay(card);

    // Start countdown
    this._startCountdown(endsAt, duration);

    this._scheduleAutoCompact(this._initialAutoCompactMs);

    // Confetti burst on start
    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(20);
    }
  },

  _loadMemberGif: function (member, card) {
    var self = this;
    var gifContainer = card ? card.querySelector('#listenAlongGif') : (this._cardEl ? this._cardEl.querySelector('#listenAlongGif') : null);
    if (!gifContainer) return;

    // Check cache first
    if (this._gifCache[member]) {
      this._renderGif(gifContainer, this._gifCache[member]);
      return;
    }

    // Show loading placeholder
    gifContainer.innerHTML = '<div class="room-listen-along-gif-loading">Loading...</div>';

    // Fetch from Klipy API
    var apiKey = CONFIG.klipyApiKey;
    if (!apiKey) {
      this._renderFallbackGif(gifContainer);
      return;
    }

    var query = encodeURIComponent(member + ' blackpink');
    var url = 'https://api.klipy.com/api/v1/' + apiKey + '/gifs/search?q=' + query + '&customer_id=bpsl&per_page=8';

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.result && json.data && json.data.data && json.data.data.length > 0) {
          var gifs = json.data.data;
          var pick = gifs[Math.floor(Math.random() * gifs.length)];

          // Prefer md mp4 for performance, fallback to gif
          var gifUrl = null;
          var isVideo = false;
          if (pick.file && pick.file.md) {
            if (pick.file.md.mp4 && pick.file.md.mp4.url) {
              gifUrl = pick.file.md.mp4.url;
              isVideo = true;
            } else if (pick.file.md.gif && pick.file.md.gif.url) {
              gifUrl = pick.file.md.gif.url;
            } else if (pick.file.md.webp && pick.file.md.webp.url) {
              gifUrl = pick.file.md.webp.url;
            }
          }

          if (gifUrl) {
            self._gifCache[member] = { url: gifUrl, isVideo: isVideo };
            self._renderGif(gifContainer, { url: gifUrl, isVideo: isVideo });
          } else {
            self._renderFallbackGif(gifContainer);
          }
        } else {
          self._renderFallbackGif(gifContainer);
        }
      })
      .catch(function () {
        self._renderFallbackGif(gifContainer);
      });
  },

  _renderGif: function (container, gifData) {
    if (!container) return;
    if (gifData.isVideo) {
      container.innerHTML =
        '<video autoplay loop muted playsinline class="room-listen-along-gif-media">' +
        '<source src="' + this._esc(gifData.url) + '" type="video/mp4">' +
        '</video>';
    } else {
      container.innerHTML =
        '<img src="' + this._esc(gifData.url) + '" alt="BLACKPINK member" class="room-listen-along-gif-media" loading="lazy">';
    }
  },

  _renderFallbackGif: function (container) {
    if (!container) return;
    container.innerHTML =
      '<iframe src="https://klipy.com/gifs/jisoo-blackpink-Ufe/player" ' +
      'width="100%" height="200" title="Jisoo Blackpink" frameborder="0" ' +
      'allowfullscreen loading="lazy" class="room-listen-along-gif-media"></iframe>';
  },

  _fetchAlbumArt: function (songName, songArtist, card) {
    var self = this;
    var cacheKey = songArtist + '::' + songName;

    // Check cache first
    if (this._albumArtCache[cacheKey]) {
      this._renderAlbumArt(this._albumArtCache[cacheKey], card);
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
          // Try extralarge first, then large, then medium
          for (var i = images.length - 1; i >= 0; i--) {
            if (images[i]['#text'] && images[i]['#text'].length > 0) {
              artUrl = images[i]['#text'];
              break;
            }
          }
        }
        if (artUrl) {
          self._albumArtCache[cacheKey] = artUrl;
          self._renderAlbumArt(artUrl, card);
        }
      })
      .catch(function () {
        // Silently fail — placeholder stays visible
      });
  },

  _renderAlbumArt: function (artUrl, card) {
    var artContainer = card ? card.querySelector('#listenAlongSongArt') : (this._cardEl ? this._cardEl.querySelector('#listenAlongSongArt') : null);
    if (!artContainer) return;
    artContainer.innerHTML = '<img src="' + this._esc(artUrl) + '" alt="Album art" class="room-listen-along-song-art-img" loading="lazy">';

    var compactArt = this._compactEl ? this._compactEl.querySelector('#listenAlongCapsuleArt') : document.getElementById('listenAlongCapsuleArt');
    if (compactArt) {
      compactArt.innerHTML = '<img src="' + this._esc(artUrl) + '" alt="Album art" class="room-listen-along-capsule-art-img" loading="lazy">';
    }
  },

  _addParticipantToCard: function (data, card) {
    var container = card ? card.querySelector('#listenAlongParticipants') : (this._cardEl ? this._cardEl.querySelector('#listenAlongParticipants') : null);
    if (!container) return;

    // Check if already rendered
    if (container.querySelector('[data-phone="' + data.phoneNumber + '"]')) return;

    var color = data.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
    // Look up profile picture from participants cache
    var pic = (ROOM.profilePicMap && data.phoneNumber) ? ROOM.profilePicMap[data.phoneNumber] : null;
    var av = ROOM.avatarInner({ profilePicture: pic, username: data.username });

    var entry = document.createElement('div');
    entry.className = 'room-listen-along-participant';
    entry.setAttribute('data-phone', data.phoneNumber);

    var albumArtHtml = '';
    if (data.albumArt) {
      albumArtHtml =
        '<div class="room-listen-along-participant-art">' +
        '<img src="' + this._esc(data.albumArt) + '" alt="" loading="lazy">' +
        '</div>';
    }

    var trackHtml = '';
    if (data.trackName) {
      trackHtml =
        '<div class="room-listen-along-participant-track">' +
        this._esc(data.trackName) +
        (data.trackArtist ? ' <span class="room-listen-along-participant-artist">- ' + this._esc(data.trackArtist) + '</span>' : '') +
        '</div>';
    }

    entry.innerHTML =
      '<div class="room-listen-along-participant-avatar" style="' + (av.hasImage ? 'background:transparent;overflow:hidden;' : 'background:' + color + ';') + '">' +
      av.html +
      '</div>' +
      '<div class="room-listen-along-participant-info">' +
      '<div class="room-listen-along-participant-name">' + this._esc(data.username) + '</div>' +
      trackHtml +
      '</div>' +
      albumArtHtml;

    container.appendChild(entry);
    this._participantsByPhone[data.phoneNumber] = {
      phoneNumber: data.phoneNumber,
      username: data.username,
      avatarColor: color,
      profilePicture: pic
    };
    this._refreshCompactParticipants();
    this._updatePointsDisplay();

    // Animate entry
    entry.style.opacity = '0';
    entry.style.transform = 'translateX(-10px)';
    requestAnimationFrame(function () {
      entry.style.transition = 'all 0.3s ease';
      entry.style.opacity = '1';
      entry.style.transform = 'translateX(0)';
    });
  },

  _updateJoinStatus: function (joined) {
    var statusEl = this._cardEl ? this._cardEl.querySelector('#listenAlongStatus') : document.getElementById('listenAlongStatus');
    if (!statusEl) return;

    if (joined) {
      statusEl.innerHTML =
        '<div class="room-listen-along-status-icon">✅</div>' +
        '<span>You\'re in! Keep listening...</span>';
      statusEl.classList.add('room-listen-along-status--joined');
    } else {
      var songLabel = this._requiredSong ? '<strong>' + this._esc(this._requiredSong.name) + '</strong>' : 'the song';
      statusEl.innerHTML =
        '<div class="room-listen-along-status-icon">🎧</div>' +
        '<span>Play ' + songLabel + ' to join!</span>';
      statusEl.classList.remove('room-listen-along-status--joined');
    }
  },

  _startCountdown: function (endsAt, duration) {
    var self = this;
    if (this._countdownInterval) clearInterval(this._countdownInterval);

    function update() {
      var remaining = endsAt - Date.now();
      if (remaining <= 0) {
        clearInterval(self._countdownInterval);
        self._countdownInterval = null;
        self._triggerEnd();
        return;
      }

      var mins = Math.floor(remaining / 60000);
      var secs = Math.floor((remaining % 60000) / 1000);
      var countdownEl = self._cardEl ? self._cardEl.querySelector('#listenAlongCountdown') : null;
      if (countdownEl) {
        countdownEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
      }

      var compactCountdownEl = self._compactEl ? self._compactEl.querySelector('#listenAlongCapsuleCountdown') : null;
      if (compactCountdownEl) {
        compactCountdownEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
      }

      var fillEl = self._cardEl ? self._cardEl.querySelector('#listenAlongProgressFill') : null;
      if (fillEl) {
        var percentage = (remaining / duration) * 100;
        fillEl.style.width = percentage + '%';
      }
    }

    update();
    this._countdownInterval = setInterval(update, 1000);
  },

  _triggerEnd: function () {
    if (!this._activeEventId) return;

    // Any client can trigger end — server dedup prevents double awards
    ConvexService.mutation('listenAlong:endListenAlong', {
      roomId: ROOM.Firebase.roomId,
      listenAlongId: this._activeEventId
    });
  },

  _removeEventCard: function () {
    this._clearAutoCompactTimer();

    if (!this._cardEl) {
      this._removeCompactCard();
      this._eventMeta = null;
      this._participantsByPhone = {};
      if (this._countdownInterval) {
        clearInterval(this._countdownInterval);
        this._countdownInterval = null;
      }
      return;
    }
    var card = this._cardEl;
    this._cardEl = null;

    card.classList.add('room-listen-along-card--exit');
    setTimeout(function () {
      if (card.parentNode) card.remove();
    }, 500);

    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }

    this._removeCompactCard();
    this._eventMeta = null;
    this._participantsByPhone = {};
  },

  _isCompactModeEnabled: function () {
    return window.innerWidth <= 768;
  },

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
    this._cardEl.classList.add('room-listen-along-card--minimized');
    if (this._compactEl) {
      this._compactEl.classList.add('room-listen-along-capsule--visible');
      if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.register('listen-along', this._compactEl, this._bubbleEl, this);
    }
    if (this._bubbleEl) {
      this._bubbleEl.classList.add('room-listen-along-capsule-bubbles--visible');
    }
    // Position bubbles after layout settles
    requestAnimationFrame(function () {
      self._positionBubblesAboveCapsule();
    });
  },

  _expandFromCompact: function () {
    this._clearAutoCompactTimer();
    if (this._cardEl) {
      this._cardEl.classList.remove('room-listen-along-card--minimized');
    }
    if (this._compactEl) {
      this._compactEl.classList.remove('room-listen-along-capsule--visible');
      if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('listen-along');
    }
    if (this._bubbleEl) {
      this._bubbleEl.classList.remove('room-listen-along-capsule-bubbles--visible');
    }
    // Re-schedule auto-compact after expanding
    this._scheduleAutoCompact(this._expandedAutoCompactMs);
  },

  _ensureCompactCard: function () {
    var self = this;
    if (this._compactEl) return;

    var overlay = document.getElementById('eventOverlay');
    if (!overlay) return;

    var capsule = document.createElement('button');
    capsule.type = 'button';
    capsule.className = 'room-listen-along-capsule';
    capsule.setAttribute('aria-label', 'Open Listen Along');
    capsule.innerHTML =
      '<div class="room-listen-along-capsule-glare"></div>' +
      '<div class="room-listen-along-capsule-art" id="listenAlongCapsuleArt">' +
      '<div class="room-listen-along-capsule-art-placeholder">♪</div>' +
      '</div>' +
      '<div class="room-listen-along-capsule-label">LISTEN ALONG</div>' +
      '<div class="room-listen-along-capsule-title" id="listenAlongCapsuleTitle">BLACKPINK</div>' +
      '<div class="room-listen-along-capsule-countdown" id="listenAlongCapsuleCountdown">--:--</div>' +
      '<div class="room-listen-along-capsule-glow"></div>';

    // Participants container floats outside the capsule
    var peopleBubbles = document.createElement('div');
    peopleBubbles.className = 'room-listen-along-capsule-bubbles';
    peopleBubbles.id = 'listenAlongCapsuleParticipants';
    capsule._bubbleContainer = peopleBubbles;

    capsule.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      // Toggle: if full card is visible, minimize; otherwise expand
      if (self._cardEl && !self._cardEl.classList.contains('room-listen-along-card--minimized')) {
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

    // Apply saved side preference
    if (this._capsuleSide === 'left') {
      capsule.classList.add('room-listen-along-capsule--left');
      peopleBubbles.classList.add('room-listen-along-capsule-bubbles--left');
    }
  },

  _removeCompactCard: function () {
    if (window.ROOM && ROOM.CapsuleStack) ROOM.CapsuleStack.unregister('listen-along');
    if (this._bubbleEl) {
      this._bubbleEl.remove();
      this._bubbleEl = null;
    }
    if (!this._compactEl) return;
    this._compactEl.remove();
    this._compactEl = null;
  },

  _refreshCompactFromState: function () {
    var titleEl = this._compactEl ? this._compactEl.querySelector('#listenAlongCapsuleTitle') : null;
    if (titleEl) {
      var songTitle = this._requiredSong && this._requiredSong.name
        ? this._requiredSong.name
        : (this._eventMeta && this._eventMeta.songName ? this._eventMeta.songName : 'BLACKPINK');
      titleEl.textContent = songTitle;
    }

    var fullCountdown = this._cardEl ? this._cardEl.querySelector('#listenAlongCountdown') : null;
    var compactCountdown = this._compactEl ? this._compactEl.querySelector('#listenAlongCapsuleCountdown') : null;
    if (compactCountdown && fullCountdown) {
      compactCountdown.textContent = fullCountdown.textContent || '--:--';
    }

    // Populate capsule album art from cache
    var songName = this._eventMeta && this._eventMeta.songName;
    var songArtist = this._eventMeta && this._eventMeta.songArtist;
    if (songName && songArtist) {
      var cacheKey = songArtist + '::' + songName;
      if (this._albumArtCache[cacheKey]) {
        var capsuleArt = this._compactEl ? this._compactEl.querySelector('#listenAlongCapsuleArt') : null;
        if (capsuleArt) {
          capsuleArt.innerHTML = '<img src="' + this._esc(this._albumArtCache[cacheKey]) + '" alt="Album art" class="room-listen-along-capsule-art-img" loading="lazy">';
        }
      }
    }

    this._refreshCompactParticipants();
  },

  _refreshCompactParticipants: function () {
    var container = this._bubbleEl ? this._bubbleEl : document.getElementById('listenAlongCapsuleParticipants');
    if (!container) return;
    container.innerHTML = '';

    var keys = Object.keys(this._participantsByPhone || {});
    var maxToShow = 4;
    for (var i = 0; i < keys.length && i < maxToShow; i++) {
      var p = this._participantsByPhone[keys[i]];
      var bubble = document.createElement('div');
      bubble.className = 'room-listen-along-capsule-bubble';
      bubble.setAttribute('data-phone', p.phoneNumber);
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
    if (keys.length > maxToShow) {
      var extra = document.createElement('div');
      extra.className = 'room-listen-along-capsule-bubble room-listen-along-capsule-bubble--extra';
      extra.textContent = '+' + (keys.length - maxToShow);
      extra.style.setProperty('--bubble-delay', (maxToShow * 0.12) + 's');
      container.appendChild(extra);
    }

    // Show/hide bubbles container alongside capsule visibility
    if (this._bubbleEl) {
      if (this._compactEl && this._compactEl.classList.contains('room-listen-along-capsule--visible')) {
        this._bubbleEl.classList.add('room-listen-along-capsule-bubbles--visible');
      }
    }

    // Position bubbles above the capsule
    this._positionBubblesAboveCapsule();
  },

  _updatePointsDisplay: function (card) {
    var pointsEl = card ? card.querySelector('#listenAlongPoints') : (this._cardEl ? this._cardEl.querySelector('#listenAlongPoints') : null);
    if (!pointsEl) return;
    var count = Object.keys(this._participantsByPhone).length;
    var label = pointsEl.querySelector('.room-listen-along-points-label');
    if (label) {
      label.innerHTML = 'Worth <strong>' + count + ' point' + (count !== 1 ? 's' : '') + '</strong> per person — more joiners = more points!';
    }
  },

  _positionBubblesAboveCapsule: function () {
    if (!this._compactEl || !this._bubbleEl) return;
    var rect = this._compactEl.getBoundingClientRect();
    this._bubbleEl.style.top = (rect.top - 10) + 'px';

    if (this._capsuleSide === 'left') {
      this._bubbleEl.style.left = '12px';
      this._bubbleEl.style.right = 'auto';
      this._bubbleEl.style.justifyContent = 'center';
    } else {
      this._bubbleEl.style.right = '12px';
      this._bubbleEl.style.left = 'auto';
      this._bubbleEl.style.justifyContent = 'center';
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

      // Only count horizontal swipes (ignore vertical scrolling)
      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;

      e.preventDefault();
      e.stopPropagation();

      if (dx < 0 && self._capsuleSide === 'right') {
        // Swiped left while on right side — move to left
        self._setCapsuleSide('left');
      } else if (dx > 0 && self._capsuleSide === 'left') {
        // Swiped right while on left side — move to right
        self._setCapsuleSide('right');
      }
    });

    // Mouse drag support for desktop
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
        this._compactEl.classList.add('room-listen-along-capsule--left');
      } else {
        this._compactEl.classList.remove('room-listen-along-capsule--left');
      }
    }

    if (this._bubbleEl) {
      if (side === 'left') {
        this._bubbleEl.classList.add('room-listen-along-capsule-bubbles--left');
      } else {
        this._bubbleEl.classList.remove('room-listen-along-capsule-bubbles--left');
      }
    }

    this._positionBubblesAboveCapsule();

    // Sync with other stacked capsules
    if (!fromStack && window.ROOM && ROOM.CapsuleStack && ROOM.CapsuleStack.setSide) {
      ROOM.CapsuleStack.setSide(side);
    }
  },

  // ========== UI: THANK YOU DIALOG ==========

  _showThankYouDialog: function (data) {
    var self = this;

    if (this._thankYouEl) {
      this._thankYouEl.remove();
      this._thankYouEl = null;
    }

    var overlay = document.createElement('div');
    overlay.className = 'room-listen-along-thankyou';

    var participantsHtml = '';
    if (data.participants) {
      for (var i = 0; i < data.participants.length; i++) {
        var p = data.participants[i];
        var color = p.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
        // Look up profile picture
        var tyPic = (ROOM.profilePicMap && p.phoneNumber) ? ROOM.profilePicMap[p.phoneNumber] : null;
        var tyAv = ROOM.avatarInner({ profilePicture: tyPic, username: p.username });
        var albumHtml = '';
        if (p.albumArt) {
          albumHtml = '<img class="room-listen-along-ty-art" src="' + this._esc(p.albumArt) + '" alt="" loading="lazy">';
        }

        participantsHtml +=
          '<div class="room-listen-along-ty-participant">' +
          '<div class="room-listen-along-ty-avatar" style="' + (tyAv.hasImage ? 'background:transparent;overflow:hidden;' : 'background:' + color + ';') + '">' +
          tyAv.html +
          '</div>' +
          '<div class="room-listen-along-ty-name">' + this._esc(p.username) + '</div>' +
          albumHtml +
          '<div class="room-listen-along-ty-points">+' + (data.pointsEach || 0) + ' pts</div>' +
          '</div>';
      }
    }

    overlay.innerHTML =
      '<div class="room-listen-along-ty-backdrop"></div>' +
      '<div class="room-listen-along-ty-modal">' +
      '<div class="room-listen-along-ty-icon"><img src="assets/logo/Music result.png" alt="Listen Along" width="56" height="56" style="object-fit:contain;"></div>' +
      '<div class="room-listen-along-ty-title">Listen Along Complete!</div>' +
      '<div class="room-listen-along-ty-points-big">+' + (data.pointsEach || 0) + ' points earned!</div>' +
      '<div class="room-listen-along-ty-desc">Thanks for vibing together!</div>' +
      '<div class="room-listen-along-ty-list">' + participantsHtml + '</div>' +
      '<button class="room-listen-along-ty-close" id="listenAlongCloseBtn">Close</button>' +
      '</div>';

    document.body.appendChild(overlay);
    this._thankYouEl = overlay;

    // Close button
    var closeBtn = document.getElementById('listenAlongCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        self._dismissThankYou();
      });
    }

    // Auto-dismiss after 20 seconds
    setTimeout(function () {
      self._dismissThankYou();
    }, 20000);

    // Confetti celebration
    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(40);
    }
  },

  _dismissThankYou: function () {
    if (!this._thankYouEl) return;
    var el = this._thankYouEl;
    this._thankYouEl = null;

    el.classList.add('room-listen-along-thankyou--exit');
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
        tag: tag || 'listen-along',
        renotify: true
      });
      n.onclick = function () {
        window.focus();
        n.close();
      };
    } catch (e) { /* silent fail on unsupported env */ }
  },

  _esc: function (text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  },

  destroy: function () {
    if (this._checkInterval) clearInterval(this._checkInterval);
    if (this._countdownInterval) clearInterval(this._countdownInterval);
    this._clearAutoCompactTimer();
    this._stopJoinCheck();
    this._removeEventCard();
    this._removeCompactCard();
    if (this._thankYouEl) {
      this._thankYouEl.remove();
      this._thankYouEl = null;
    }
  }
};
