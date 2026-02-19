/**
 * Room Fill the Map
 * Mini-event: 3 districts are chosen, first user from each district to listen
 * to the main song fills that district. If all 3 are filled within the time limit,
 * all fillers get 8 points.
 */

window.ROOM = window.ROOM || {};

ROOM.FillMap = {
  _checkInterval: null,
  _countdownInterval: null,
  _joinCheckInterval: null,
  _activeEventId: null,
  _hasFilled: false,
  _eventData: null,
  _overlayEl: null,
  _thankYouEl: null,
  _requiredSong: null,

  init: function () {
    this._startPeriodicCheck();
  },

  // ========== SCHEDULING ==========

  _startPeriodicCheck: function () {
    var self = this;
    var interval = CONFIG.fillMapCheckInterval || 60000;

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

    var chance = CONFIG.fillMapTriggerChance || 0.15;
    if (Math.random() > chance) return;

    // Pick a random song from the catalog
    var songs = CONFIG.listenAlongSongs || [];
    if (songs.length === 0) return;
    var song = songs[Math.floor(Math.random() * songs.length)];

    ConvexService.mutation('fillTheMap:startFillTheMap', {
      roomId: ROOM.Firebase.roomId,
      songName: song.name,
      songArtist: song.artist,
      cooldownMs: CONFIG.fillMapCooldown,
      durationMs: CONFIG.fillMapDuration
    });
  },

  // ========== EVENT HANDLERS (called from room-events.js) ==========

  handleStart: function (data) {
    this._activeEventId = data.fillMapId;
    this._hasFilled = false;
    this._requiredSong = { name: data.songName, artist: data.songArtist };
    this._eventData = {
      fillMapId: data.fillMapId,
      songName: data.songName,
      songArtist: data.songArtist,
      chosenDistricts: data.chosenDistricts,
      filledDistricts: {},
      endsAt: data.endsAt,
      duration: data.duration || CONFIG.fillMapDuration
    };

    this._showOverlay();
    this._startJoinCheck();

    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('energy', '🗺️',
        '<strong>Fill the Map!</strong> Play <strong>' + this._esc(data.songName) +
        '</strong> to claim your district!');
    }

    this._sendPushNotification(
      'Fill the Map!',
      'Play ' + data.songName + ' by ' + data.songArtist + ' to claim your district and earn 8 points!',
      'fill-map-start'
    );
  },

  handleFill: function (data) {
    if (!this._activeEventId || !this._eventData) return;

    this._eventData.filledDistricts[data.district] = {
      phoneNumber: data.phoneNumber,
      username: data.username,
      profilePicture: data.profilePicture
    };

    this._fillDistrictVisual(data.district, data.username, data.profilePicture);

    if (ROOM.currentUser && data.phoneNumber === ROOM.currentUser.phoneNumber) {
      this._hasFilled = true;
      this._stopJoinCheck();
    }

    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('join', '✅',
        '<strong>' + this._esc(data.username) + '</strong> filled <strong>' + this._esc(data.district) + '</strong>!');
    }
  },

  handleComplete: function (data) {
    this._stopJoinCheck();
    this._stopCountdown();

    // Check if current user was a filler
    var wasFiller = false;
    if (ROOM.currentUser && data.fillers) {
      for (var i = 0; i < data.fillers.length; i++) {
        if (data.fillers[i].phoneNumber === ROOM.currentUser.phoneNumber) {
          wasFiller = true;
          break;
        }
      }
    }

    // Show success state on map briefly, then show thank you
    this._showMapSuccess();

    var self = this;
    setTimeout(function () {
      self._removeOverlay();
      if (wasFiller) {
        self._showThankYouDialog(data);
      }
      self._resetState();
    }, 2500);
  },

  handleFailed: function (data) {
    this._stopJoinCheck();
    this._stopCountdown();

    this._showMapFailed();

    var self = this;
    setTimeout(function () {
      self._removeOverlay();
      self._resetState();
    }, 2500);

    if (ROOM.Animations && ROOM.Animations.showToast) {
      ROOM.Animations.showToast('energy', '❌',
        '<strong>Fill the Map failed!</strong> Only ' + (data.filledCount || 0) + '/' + (data.total || 3) + ' districts filled.');
    }
  },

  // Called from Convex subscription for late joiners
  handleActiveEvent: function (event) {
    if (!event || this._activeEventId) return;
    if (Date.now() > event.endsAt) return;

    this._activeEventId = event._id;
    this._hasFilled = false;
    this._requiredSong = { name: event.songName, artist: event.songArtist };
    this._eventData = {
      fillMapId: event._id,
      songName: event.songName,
      songArtist: event.songArtist,
      chosenDistricts: event.chosenDistricts,
      filledDistricts: event.filledDistricts || {},
      endsAt: event.endsAt,
      duration: event.endsAt - event.startedAt
    };

    // Check if current user already filled
    if (ROOM.currentUser && event.filledDistricts) {
      var fd = event.filledDistricts;
      for (var district in fd) {
        if (fd[district] && fd[district].phoneNumber === ROOM.currentUser.phoneNumber) {
          this._hasFilled = true;
          break;
        }
      }
    }

    this._showOverlay();

    // Render already-filled districts
    if (event.filledDistricts) {
      for (var d in event.filledDistricts) {
        var info = event.filledDistricts[d];
        this._fillDistrictVisual(d, info.username, info.profilePicture);
      }
    }

    if (!this._hasFilled) {
      this._startJoinCheck();
    }
  },

  // ========== AUTO-JOIN (detect when user plays the required song) ==========

  _startJoinCheck: function () {
    var self = this;
    if (this._joinCheckInterval) clearInterval(this._joinCheckInterval);

    this._joinCheckInterval = setInterval(function () {
      self._checkAndFill();
    }, CONFIG.fillMapJoinCheckInterval || 5000);
  },

  _stopJoinCheck: function () {
    if (this._joinCheckInterval) {
      clearInterval(this._joinCheckInterval);
      this._joinCheckInterval = null;
    }
  },

  _checkAndFill: function () {
    if (!this._activeEventId || this._hasFilled || !ROOM.currentUser) return;
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

    // Check if user is playing the required song
    var isCorrectSong = ROOM.LastFM.isSameSong(
      me.data.currentTrack.name, me.data.currentTrack.artist,
      this._requiredSong.name, this._requiredSong.artist
    );
    if (!isCorrectSong) return;

    // User is playing the correct song — attempt to fill their district
    this._hasFilled = true;
    this._stopJoinCheck();

    ConvexService.mutation('fillTheMap:fillDistrict', {
      roomId: ROOM.Firebase.roomId,
      fillMapId: this._activeEventId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      username: ROOM.currentUser.username,
      profilePicture: ROOM.currentUser.profilePicture || undefined
    });
  },

  // ========== UI: SVG MAP OVERLAY ==========

  _showOverlay: function () {
    var self = this;
    this._removeOverlay();

    var overlay = document.getElementById('eventOverlay');
    if (!overlay || !this._eventData) return;

    var container = document.createElement('div');
    container.className = 'room-fill-map-overlay';

    var songName = this._eventData.songName ? this._esc(this._eventData.songName) : 'a BLACKPINK song';
    var songArtist = this._eventData.songArtist ? this._esc(this._eventData.songArtist) : '';

    // Clone the SVG from the heat map
    var originalSvg = document.getElementById('heatMapSvg');
    var svgClone = originalSvg ? originalSvg.cloneNode(true) : null;

    container.innerHTML =
      '<div class="room-fill-map-backdrop"></div>' +
      '<div class="room-fill-map-card">' +
        '<div class="room-fill-map-header">' +
          '<div class="room-fill-map-badge">' +
            '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>' +
            ' FILL THE MAP' +
          '</div>' +
          '<div class="room-fill-map-header-actions">' +
            '<span class="room-fill-map-countdown" id="fillMapCountdown">--:--</span>' +
            '<button class="room-fill-map-close-btn" id="fillMapMinimizeBtn" type="button" aria-label="Minimize">-</button>' +
          '</div>' +
        '</div>' +
        '<div class="room-fill-map-svg-container" id="fillMapSvgContainer"></div>' +
        '<div class="room-fill-map-footer">' +
          '<div class="room-fill-map-progress">' +
            '<div class="room-fill-map-progress-bar">' +
              '<div class="room-fill-map-progress-fill" id="fillMapProgressFill"></div>' +
            '</div>' +
          '</div>' +
          '<div class="room-fill-map-status" id="fillMapStatus">' +
            '<span class="room-fill-map-status-icon">🎧</span>' +
            '<span>Play <strong>' + songName + '</strong> to fill your district!</span>' +
            '<span class="room-fill-map-footer-pts">8 pts</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    overlay.appendChild(container);
    this._overlayEl = container;

    // Insert cloned SVG
    var svgContainer = document.getElementById('fillMapSvgContainer');
    if (svgContainer && svgClone) {
      svgClone.id = 'fillMapSvg';
      svgClone.classList.add('room-fill-map-svg');

      // Reset all district fills to dim
      var paths = svgClone.querySelectorAll('.room-heatmap-district');
      for (var i = 0; i < paths.length; i++) {
        paths[i].style.fill = 'rgba(247, 166, 185, 0.06)';
        paths[i].style.stroke = 'rgba(247, 166, 185, 0.15)';
        paths[i].classList.remove('room-fill-map-blink');
        paths[i].classList.remove('room-fill-map-filled');
      }

      // Add blinking effect to chosen districts
      if (this._eventData.chosenDistricts) {
        for (var j = 0; j < this._eventData.chosenDistricts.length; j++) {
          var districtName = this._eventData.chosenDistricts[j];
          var path = svgClone.querySelector('[data-district="' + districtName + '"]');
          if (path) {
            path.classList.add('room-fill-map-blink');
            path.style.fill = 'rgba(247, 166, 185, 0.35)';
            path.style.stroke = 'rgba(247, 166, 185, 0.6)';
          }
        }
      }

      // Add district name labels inside the SVG for chosen districts
      if (this._eventData.chosenDistricts) {
        for (var k = 0; k < this._eventData.chosenDistricts.length; k++) {
          this._addDistrictLabel(svgClone, this._eventData.chosenDistricts[k], null, null);
        }
      }

      svgContainer.appendChild(svgClone);
    }

    // Minimize button
    var minimizeBtn = document.getElementById('fillMapMinimizeBtn');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._minimizeOverlay();
      });
    }

    // Start countdown
    this._startCountdown(this._eventData.endsAt, this._eventData.duration);

    // Confetti burst
    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(15);
    }
  },

  _fillDistrictVisual: function (district, username, profilePicture) {
    var svg = document.getElementById('fillMapSvg');
    if (svg) {
      var path = svg.querySelector('[data-district="' + district + '"]');
      if (path) {
        path.classList.remove('room-fill-map-blink');
        path.classList.add('room-fill-map-filled');
        path.style.fill = 'rgba(37, 211, 102, 0.45)';
        path.style.stroke = 'rgba(37, 211, 102, 0.7)';

        // Remove old waiting label, add filled avatar + username label
        var oldLabel = svg.querySelector('[data-label-district="' + district + '"]');
        if (oldLabel) oldLabel.remove();
        this._addDistrictLabel(svg, district, username, profilePicture);
      }
    }

    if (this._eventData) {
      this._eventData.filledDistricts[district] = {
        phoneNumber: '',
        username: username,
        profilePicture: profilePicture
      };
    }
  },

  /**
   * Adds a label (district name + avatar or "waiting" dot) inside the SVG
   * at the centroid of the given district path.
   * If username is null → waiting state. If username is set → filled state.
   */
  _addDistrictLabel: function (svg, district, username, profilePicture) {
    var path = svg.querySelector('[data-district="' + district + '"]');
    if (!path) return;

    try {
      var bbox = path.getBBox();
      var cx = bbox.x + bbox.width / 2;
      var cy = bbox.y + bbox.height / 2;

      // Size the label container based on district size
      var foWidth = Math.max(bbox.width * 0.9, 100);
      var foHeight = username ? 90 : 55;

      var fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      fo.setAttribute('x', cx - foWidth / 2);
      fo.setAttribute('y', cy - foHeight / 2);
      fo.setAttribute('width', foWidth);
      fo.setAttribute('height', foHeight);
      fo.setAttribute('data-label-district', district);
      fo.style.pointerEvents = 'none';
      fo.style.overflow = 'visible';

      var wrapper = document.createElement('div');
      wrapper.className = 'room-fill-map-label';

      if (username) {
        // Filled state: avatar + district + username
        var avatarHtml;
        if (profilePicture) {
          avatarHtml = '<div class="room-fill-map-label-avatar room-fill-map-label-avatar--filled">' +
            '<img src="' + this._esc(profilePicture) + '" alt="">' +
          '</div>';
        } else {
          avatarHtml = '<div class="room-fill-map-label-avatar room-fill-map-label-avatar--filled room-fill-map-label-avatar--initial">' +
            (username || '?').charAt(0).toUpperCase() +
          '</div>';
        }
        wrapper.innerHTML =
          avatarHtml +
          '<div class="room-fill-map-label-name room-fill-map-label-name--filled">' + this._esc(district) + '</div>' +
          '<div class="room-fill-map-label-user">' + this._esc(username) + '</div>';
        wrapper.classList.add('room-fill-map-label--filled');
      } else {
        // Waiting state: pulsing dot + district name
        wrapper.innerHTML =
          '<div class="room-fill-map-label-dot"></div>' +
          '<div class="room-fill-map-label-name">' + this._esc(district) + '</div>';
        wrapper.classList.add('room-fill-map-label--waiting');
      }

      fo.appendChild(wrapper);
      svg.appendChild(fo);
    } catch (e) {
      // getBBox may fail if SVG not in DOM yet
    }
  },

  _showMapSuccess: function () {
    var overlay = this._overlayEl;
    if (!overlay) return;
    overlay.classList.add('room-fill-map-overlay--success');

    var statusEl = document.getElementById('fillMapStatus');
    if (statusEl) {
      statusEl.innerHTML =
        '<div class="room-fill-map-status-icon">🎉</div>' +
        '<span><strong>All districts filled!</strong> +8 points earned!</span>';
      statusEl.classList.add('room-fill-map-status--success');
    }

    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(40);
    }
  },

  _showMapFailed: function () {
    var overlay = this._overlayEl;
    if (!overlay) return;
    overlay.classList.add('room-fill-map-overlay--failed');

    var statusEl = document.getElementById('fillMapStatus');
    if (statusEl) {
      statusEl.innerHTML =
        '<div class="room-fill-map-status-icon">⏰</div>' +
        '<span><strong>Time\'s up!</strong> Not all districts were filled.</span>';
      statusEl.classList.add('room-fill-map-status--failed');
    }
  },

  _minimizeOverlay: function () {
    if (this._overlayEl) {
      this._overlayEl.classList.add('room-fill-map-overlay--minimized');
    }
  },

  _removeOverlay: function () {
    if (!this._overlayEl) return;
    var el = this._overlayEl;
    this._overlayEl = null;

    el.classList.add('room-fill-map-overlay--exit');
    setTimeout(function () {
      if (el.parentNode) el.remove();
    }, 500);
  },

  _resetState: function () {
    this._activeEventId = null;
    this._hasFilled = false;
    this._eventData = null;
    this._requiredSong = null;
  },

  // ========== COUNTDOWN ==========

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
      var countdownEl = document.getElementById('fillMapCountdown');
      if (countdownEl) {
        countdownEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
      }

      var fillEl = document.getElementById('fillMapProgressFill');
      if (fillEl) {
        var percentage = (remaining / duration) * 100;
        fillEl.style.width = percentage + '%';
      }
    }

    update();
    this._countdownInterval = setInterval(update, 1000);
  },

  _stopCountdown: function () {
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
  },

  _triggerEnd: function () {
    if (!this._activeEventId) return;

    ConvexService.mutation('fillTheMap:endFillTheMap', {
      roomId: ROOM.Firebase.roomId,
      fillMapId: this._activeEventId
    });
  },

  // ========== THANK YOU DIALOG ==========

  _showThankYouDialog: function (data) {
    var self = this;

    if (this._thankYouEl) {
      this._thankYouEl.remove();
      this._thankYouEl = null;
    }

    var fillersHtml = '';
    if (data.fillers) {
      for (var i = 0; i < data.fillers.length; i++) {
        var f = data.fillers[i];
        var pic = f.profilePicture;
        var avatarHtml = pic
          ? '<img src="' + this._esc(pic) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
          : '<span>' + (f.username || '?').charAt(0).toUpperCase() + '</span>';

        fillersHtml +=
          '<div class="room-fill-map-ty-participant">' +
            '<div class="room-fill-map-ty-avatar">' + avatarHtml + '</div>' +
            '<div class="room-fill-map-ty-name">' + this._esc(f.username) + '</div>' +
            '<div class="room-fill-map-ty-points">+' + (data.pointsEach || 8) + ' pts</div>' +
          '</div>';
      }
    }

    var overlay = document.createElement('div');
    overlay.className = 'room-fill-map-thankyou';
    overlay.innerHTML =
      '<div class="room-fill-map-ty-backdrop"></div>' +
      '<div class="room-fill-map-ty-modal">' +
        '<div class="room-fill-map-ty-icon">🗺️</div>' +
        '<div class="room-fill-map-ty-title">Map Complete!</div>' +
        '<div class="room-fill-map-ty-points-big">+' + (data.pointsEach || 8) + ' points earned!</div>' +
        '<div class="room-fill-map-ty-desc">All districts were filled! Amazing teamwork!</div>' +
        '<div class="room-fill-map-ty-list">' + fillersHtml + '</div>' +
        '<button class="room-fill-map-ty-close" id="fillMapCloseBtn">Close</button>' +
      '</div>';

    document.body.appendChild(overlay);
    this._thankYouEl = overlay;

    var closeBtn = document.getElementById('fillMapCloseBtn');
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

    el.classList.add('room-fill-map-thankyou--exit');
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
        tag: tag || 'fill-map',
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
    this._stopCountdown();
    this._stopJoinCheck();
    this._removeOverlay();
    if (this._thankYouEl) {
      this._thankYouEl.remove();
      this._thankYouEl = null;
    }
  }
};
