/**
 * Room GIF Sender
 * Multi-step picker: Member → Action → GIF Grid → Message → Send
 * Persistent inbox: shows unread GIFs to recipients (even if they were offline)
 */

window.ROOM = window.ROOM || {};

ROOM.Gif = {
  _modalEl: null,
  _targetPhone: null,
  _targetUsername: null,
  _targetColor: null,
  _selectedMember: null,
  _selectedAction: null,
  _selectedGifUrl: null,
  _selectedGifIsVideo: false,
  _gifResults: [],
  _gifCooldowns: {},

  // Inbox queue for unread GIFs (shown on room join)
  _inboxQueue: [],
  _inboxProcessedIds: {},
  _isShowingInbox: false,

  MEMBERS: [
    { key: 'ot4', label: 'OT4', emoji: '🖤💗' },
    { key: 'jisoo', label: 'Jisoo', emoji: '🐰' },
    { key: 'jennie', label: 'Jennie', emoji: '🐻' },
    { key: 'rose', label: 'Rosé', emoji: '🐿' },
    { key: 'lisa', label: 'Lisa', emoji: '🐱' },
    { key: 'custom', label: 'Custom Search', emoji: '🔍' },
  ],

  ACTIONS: [
    { key: 'smile', label: 'Smile', emoji: '😊' },
    { key: 'threaten', label: 'Threaten', emoji: '😠' },
    { key: 'amazed', label: 'Amazed', emoji: '😲' },
    { key: 'silence', label: 'Silence', emoji: '🤫' },
    { key: 'angry', label: 'Angry', emoji: '😤' },
  ],

  init: function () {
    // Module is ready — picker + inbox created on demand
  },

  destroy: function () {
    this._removeModal();
    this._inboxQueue = [];
    this._inboxProcessedIds = {};
    this._isShowingInbox = false;
  },

  // ============================
  //  PICKER FLOW
  // ============================

  openPicker: function (targetPhone, targetUsername, targetColor) {
    // Quick client-side check: do they have any GIFs available?
    var available = this._getAvailableGifs();
    if (available <= 0) {
      var nextUnlock = (this._getGifsSent() + 1) * 10;
      ROOM.Animations && ROOM.Animations.showToast('gif', '🎞', 'No GIFs available! Next unlock at <strong>' + nextUnlock + ' pts</strong>.');
      return;
    }

    this._targetPhone = targetPhone;
    this._targetUsername = targetUsername;
    this._targetColor = targetColor;
    this._selectedMember = null;
    this._selectedAction = null;
    this._selectedGifUrl = null;
    this._selectedGifIsVideo = false;
    this._gifResults = [];

    this._showStep('member');
  },

  _showStep: function (step) {
    this._removeModal();
    var self = this;

    var modal = document.createElement('div');
    modal.className = 'room-gif-modal';

    var titleText = '';
    var bodyHtml = '';

    // ---- MEMBER STEP ----
    if (step === 'member') {
      titleText = 'Send GIF to ' + this._esc(this._targetUsername);
      bodyHtml = '<div class="room-gif-grid room-gif-grid--options">';
      for (var i = 0; i < this.MEMBERS.length; i++) {
        var m = this.MEMBERS[i];
        bodyHtml +=
          '<button class="room-gif-option room-gif-member-btn" data-member="' + m.key + '">' +
          '<span class="room-gif-option-emoji">' + m.emoji + '</span>' +
          '<span>' + m.label + '</span>' +
          '</button>';
      }
      bodyHtml += '</div>';

      // ---- ACTION STEP ----
    } else if (step === 'action') {
      titleText = this._getMemberLabel(this._selectedMember);
      bodyHtml = '<div class="room-gif-grid room-gif-grid--options">';
      for (var j = 0; j < this.ACTIONS.length; j++) {
        var a = this.ACTIONS[j];
        bodyHtml +=
          '<button class="room-gif-option room-gif-action-btn" data-action="' + a.key + '">' +
          '<span class="room-gif-option-emoji">' + a.emoji + '</span>' +
          '<span>' + a.label + '</span>' +
          '</button>';
      }
      bodyHtml += '</div>';

      // ---- CUSTOM SEARCH STEP ----
    } else if (step === 'custom') {
      titleText = 'Custom Search';
      bodyHtml =
        '<div class="room-gif-custom-search">' +
        '<div class="room-gif-search-row">' +
        '<input type="text" class="room-gif-search-input" id="gifCustomInput" placeholder="Type your search..." maxlength="60" autocomplete="off">' +
        '<button class="room-gif-search-btn" id="gifCustomSearchBtn">Search</button>' +
        '</div>' +
        '<div class="room-gif-search-hint">Will search: blackpink + your text</div>' +
        '<div class="room-gif-grid room-gif-grid--results" id="gifResultsGrid"></div>' +
        '</div>';

      // ---- RESULTS STEP ----
    } else if (step === 'results') {
      titleText = this._getMemberLabel(this._selectedMember) + ' · ' + this._getActionLabel(this._selectedAction);
      bodyHtml =
        '<div class="room-gif-grid room-gif-grid--results" id="gifResultsGrid">' +
        '<div class="room-gif-loading"><div class="room-gif-spinner"></div>Searching GIFs...</div>' +
        '</div>';

      // ---- CONFIRM STEP (GIF selected, add message) ----
    } else if (step === 'confirm') {
      titleText = 'Send to ' + this._esc(this._targetUsername);
      var previewHtml = this._selectedGifIsVideo
        ? '<video autoplay loop muted playsinline class="room-gif-confirm-media"><source src="' + this._esc(this._selectedGifUrl) + '" type="video/mp4"></video>'
        : '<img src="' + this._esc(this._selectedGifUrl) + '" alt="GIF" class="room-gif-confirm-media">';

      bodyHtml =
        '<div class="room-gif-confirm">' +
        '<div class="room-gif-confirm-preview">' + previewHtml + '</div>' +
        '<input type="text" class="room-gif-message-input" id="gifMessageInput" placeholder="Add a message (optional)" maxlength="100" autocomplete="off">' +
        '<button class="room-gif-send-btn" id="gifSendBtn">' +
        '<span>Send GIF</span>' +
        '<span class="room-gif-send-cost">Token x' + this._getAvailableGifs() + '</span>' +
        '</button>' +
        '</div>';
    }

    modal.innerHTML =
      '<div class="room-gif-modal-backdrop"></div>' +
      '<div class="room-gif-modal-content">' +
      '<div class="room-gif-modal-header">' +
      (step !== 'member' ? '<button class="room-gif-modal-back">&#8249;</button>' : '') +
      '<span class="room-gif-modal-title">' + titleText + '</span>' +
      '<button class="room-gif-modal-close">&times;</button>' +
      '</div>' +
      '<div class="room-gif-modal-body">' +
      bodyHtml +
      '</div>' +
      '</div>';

    document.body.appendChild(modal);
    this._modalEl = modal;

    // ---- Trigger search on results step ----
    if (step === 'results') {
      this._searchGifs();
    }

    // ---- Focus custom input ----
    if (step === 'custom') {
      var customInput = document.getElementById('gifCustomInput');
      if (customInput) setTimeout(function () { customInput.focus(); }, 100);
    }

    // ---- Focus message input ----
    if (step === 'confirm') {
      var msgInput = document.getElementById('gifMessageInput');
      if (msgInput) setTimeout(function () { msgInput.focus(); }, 100);
    }

    // ---- EVENT DELEGATION ----
    modal.addEventListener('click', function (e) {
      // Close
      if (e.target.closest('.room-gif-modal-close') || e.target.classList.contains('room-gif-modal-backdrop')) {
        self._removeModal();
        return;
      }

      // Back
      if (e.target.closest('.room-gif-modal-back')) {
        if (step === 'action') self._showStep('member');
        else if (step === 'results') self._showStep('action');
        else if (step === 'custom') self._showStep('member');
        else if (step === 'confirm') {
          if (self._selectedMember === 'custom') self._showStep('custom');
          else self._showStep('results');
        }
        return;
      }

      // Member pick
      var memberBtn = e.target.closest('.room-gif-member-btn');
      if (memberBtn) {
        self._selectedMember = memberBtn.dataset.member;
        if (self._selectedMember === 'custom') {
          self._showStep('custom');
        } else {
          self._showStep('action');
        }
        return;
      }

      // Action pick
      var actionBtn = e.target.closest('.room-gif-action-btn');
      if (actionBtn) {
        self._selectedAction = actionBtn.dataset.action;
        self._showStep('results');
        return;
      }

      // GIF result pick
      var gifCard = e.target.closest('.room-gif-result-card');
      if (gifCard) {
        self._selectedGifUrl = gifCard.dataset.gifUrl;
        self._selectedGifIsVideo = gifCard.dataset.gifIsVideo === 'true';
        self._showStep('confirm');
        return;
      }

      // Custom search button
      if (e.target.closest('#gifCustomSearchBtn')) {
        self._doCustomSearch();
        return;
      }

      // Send button
      if (e.target.closest('#gifSendBtn')) {
        var msg = document.getElementById('gifMessageInput');
        self._sendGif(msg ? msg.value.trim() : '');
        return;
      }
    });

    // Enter key on custom search
    if (step === 'custom') {
      var inp = document.getElementById('gifCustomInput');
      if (inp) {
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') self._doCustomSearch();
        });
      }
    }

    // Enter key on message input
    if (step === 'confirm') {
      var mInp = document.getElementById('gifMessageInput');
      if (mInp) {
        mInp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            self._sendGif(mInp.value.trim());
          }
        });
      }
    }
  },

  // ============================
  //  KLIPY API SEARCH
  // ============================

  _searchGifs: function () {
    var self = this;
    var apiKey = CONFIG.klipyApiKey;
    if (!apiKey) return;

    var memberTerm = this._selectedMember === 'ot4' ? 'blackpink' : 'blackpink ' + this._selectedMember;
    var query = encodeURIComponent(memberTerm + ' ' + this._selectedAction);
    var url = 'https://api.klipy.com/api/v1/' + apiKey + '/gifs/search?q=' + query + '&customer_id=bpsl&per_page=10';

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.result && json.data && json.data.data && json.data.data.length > 0) {
          self._gifResults = json.data.data;
          self._renderGifGrid();
        } else {
          self._renderGifGridEmpty();
        }
      })
      .catch(function () {
        self._renderGifGridEmpty();
      });
  },

  _doCustomSearch: function () {
    var self = this;
    var inp = document.getElementById('gifCustomInput');
    if (!inp || !inp.value.trim()) return;

    var apiKey = CONFIG.klipyApiKey;
    if (!apiKey) return;

    var grid = document.getElementById('gifResultsGrid');
    if (grid) grid.innerHTML = '<div class="room-gif-loading"><div class="room-gif-spinner"></div>Searching...</div>';

    // Always prefix with blackpink
    var query = encodeURIComponent('blackpink ' + inp.value.trim());
    var url = 'https://api.klipy.com/api/v1/' + apiKey + '/gifs/search?q=' + query + '&customer_id=bpsl&per_page=10';

    // Store for the confirm step back-navigation
    this._selectedAction = 'custom:' + inp.value.trim();

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.result && json.data && json.data.data && json.data.data.length > 0) {
          self._gifResults = json.data.data;
          self._renderGifGrid();
        } else {
          self._renderGifGridEmpty();
        }
      })
      .catch(function () {
        self._renderGifGridEmpty();
      });
  },

  _renderGifGrid: function () {
    var grid = document.getElementById('gifResultsGrid');
    if (!grid) return;

    var html = '';
    for (var i = 0; i < this._gifResults.length; i++) {
      var pick = this._gifResults[i];
      var gifUrl = null;
      var isVideo = false;
      var previewUrl = null;

      // Full size: md format (for sending)
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

      if (!gifUrl) continue;

      // Thumbnail: sm format (for grid preview)
      previewUrl = gifUrl;
      if (pick.file && pick.file.sm) {
        if (pick.file.sm.mp4 && pick.file.sm.mp4.url) {
          previewUrl = pick.file.sm.mp4.url;
        } else if (pick.file.sm.gif && pick.file.sm.gif.url) {
          previewUrl = pick.file.sm.gif.url;
        } else if (pick.file.sm.webp && pick.file.sm.webp.url) {
          previewUrl = pick.file.sm.webp.url;
        }
      }

      var mediaHtml;
      if (isVideo) {
        mediaHtml =
          '<video autoplay loop muted playsinline class="room-gif-result-media">' +
          '<source src="' + this._esc(previewUrl) + '" type="video/mp4">' +
          '</video>';
      } else {
        mediaHtml = '<img src="' + this._esc(previewUrl) + '" alt="" class="room-gif-result-media" loading="lazy">';
      }

      html +=
        '<div class="room-gif-result-card" data-gif-url="' + this._esc(gifUrl) + '" data-gif-is-video="' + isVideo + '">' +
        mediaHtml +
        '</div>';
    }

    grid.innerHTML = html || '<div class="room-gif-empty">No GIFs found. Try a different combo!</div>';
  },

  _renderGifGridEmpty: function () {
    var grid = document.getElementById('gifResultsGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="room-gif-empty">No GIFs found. Try a different combo!</div>';
  },

  // ============================
  //  SEND GIF
  // ============================

  _sendGif: function (message) {
    var self = this;

    // Cooldown check
    var cooldownKey = this._targetPhone;
    if (this._gifCooldowns[cooldownKey] && Date.now() - this._gifCooldowns[cooldownKey] < 30000) {
      ROOM.Animations && ROOM.Animations.showToast('gif', '⏳', 'Wait before sending another GIF!');
      this._removeModal();
      return;
    }

    // Client-side GIF availability check
    if (this._getAvailableGifs() <= 0) {
      var nextUnlock = (this._getGifsSent() + 1) * 10;
      ROOM.Animations && ROOM.Animations.showToast('gif', '🎞', 'No GIFs available! Next unlock at <strong>' + nextUnlock + ' pts</strong>.');
      this._removeModal();
      return;
    }

    this._gifCooldowns[cooldownKey] = Date.now();
    var targetUsername = this._targetUsername;
    this._removeModal();

    ConvexService.mutation('gifMessages:send', {
      roomId: ROOM.Firebase.roomId,
      senderPhoneNumber: ROOM.currentUser.phoneNumber,
      senderUsername: ROOM.currentUser.username,
      senderAvatarColor: ROOM.currentUser.avatarColor,
      recipientPhoneNumber: self._targetPhone,
      recipientUsername: self._targetUsername,
      gifUrl: self._selectedGifUrl,
      gifIsVideo: self._selectedGifIsVideo,
      member: self._selectedMember || 'custom',
      action: self._selectedAction || 'custom',
      message: message || undefined,
    }).then(function (result) {
      if (result && result.success === false) {
        if (result.reason === 'no_gifs_available') {
          var nextAt = result.nextUnlockAt || '?';
          ROOM.Animations && ROOM.Animations.showToast('gif', '🎞', 'No GIFs available! Next unlock at <strong>' + nextAt + ' pts</strong>.');
        } else if (result.reason === 'cooldown') {
          ROOM.Animations && ROOM.Animations.showToast('gif', '⏳', 'Wait before sending another GIF!');
        }
        delete self._gifCooldowns[cooldownKey];
        return;
      }

      var remaining = (result && result.gifsAvailable != null) ? result.gifsAvailable : '?';
      ROOM.Animations && ROOM.Animations.showToast(
        'gif',
        '🎞',
        'GIF sent to <strong>' + self._esc(targetUsername) + '</strong>! (Token x' + remaining + ')'
      );
    });
  },

  // ============================
  //  RECEIVE: REAL-TIME (via event)
  // ============================

  playGifMessage: function (data) {
    if (!data || !data.gifUrl) return;

    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'room-gif-overlay';

    var mediaHtml;
    if (data.gifIsVideo) {
      mediaHtml =
        '<video autoplay loop muted playsinline class="room-gif-recv-media">' +
        '<source src="' + this._esc(data.gifUrl) + '" type="video/mp4">' +
        '</video>';
    } else {
      mediaHtml = '<img src="' + this._esc(data.gifUrl) + '" alt="GIF" class="room-gif-recv-media">';
    }

    var messageHtml = data.message
      ? '<div class="room-gif-recv-message">' + this._esc(data.message) + '</div>'
      : '';

    overlay.innerHTML =
      '<div class="room-gif-recv-backdrop"></div>' +
      '<div class="room-gif-recv-scene">' +
      '<div class="room-gif-recv-aura"></div>' +
      '<div class="room-gif-recv-media-wrap">' + mediaHtml + '</div>' +
      '<div class="room-gif-recv-sender">' +
      '<strong>' + this._esc(data.senderUsername) + '</strong> sent you a GIF!' +
      '</div>' +
      messageHtml +
      '<button class="room-gif-recv-dismiss">Dismiss</button>' +
      '</div>';

    document.body.appendChild(overlay);

    // Screen shake
    document.body.classList.add('room-screen-shake');
    setTimeout(function () { document.body.classList.remove('room-screen-shake'); }, 500);

    // Confetti
    if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
      ROOM.Animations.spawnConfetti(15);
    }

    // Dismiss handler
    var dismissBtn = overlay.querySelector('.room-gif-recv-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        overlay.classList.add('room-gif-overlay--exit');
        setTimeout(function () {
          if (overlay.parentNode) overlay.remove();
          // If we're processing inbox queue, show next
          if (self._isShowingInbox) self._playNextInQueue();
        }, 400);
      });
    }

    // Mark as read if this is from the inbox queue (has _id)
    if (data._id) {
      ConvexService.mutation('gifMessages:markAsRead', { messageId: data._id });
    }
  },

  // ============================
  //  INBOX: OFFLINE CATCH-UP
  // ============================

  handleUnreadGifs: function (gifs) {
    if (!gifs || gifs.length === 0) return;

    // Add only new (unprocessed) GIFs to the queue
    var newGifs = [];
    for (var i = 0; i < gifs.length; i++) {
      var g = gifs[i];
      if (g._id && !this._inboxProcessedIds[g._id]) {
        this._inboxProcessedIds[g._id] = true;
        newGifs.push(g);
      }
    }

    if (newGifs.length === 0) return;

    // Add to queue (oldest first, so reverse the desc order)
    this._inboxQueue = this._inboxQueue.concat(newGifs.reverse());

    // Start showing if not already
    if (!this._isShowingInbox) {
      // Small delay to let the room fully load
      var self = this;
      setTimeout(function () {
        self._isShowingInbox = true;
        self._playNextInQueue();
      }, 3000);
    }
  },

  _playNextInQueue: function () {
    if (this._inboxQueue.length === 0) {
      this._isShowingInbox = false;
      return;
    }

    var next = this._inboxQueue.shift();
    this.playGifMessage(next);
  },

  // ============================
  //  HELPERS
  // ============================

  _getMyPoints: function () {
    if (!ROOM.Firebase || !ROOM.Firebase.participantsCache || !ROOM.currentUser) return 0;
    var myPhone = ROOM.currentUser.phoneNumber;
    for (var i = 0; i < ROOM.Firebase.participantsCache.length; i++) {
      if (ROOM.Firebase.participantsCache[i].id === myPhone) {
        return ROOM.Firebase.participantsCache[i].data.totalPoints || 0;
      }
    }
    return 0;
  },

  _getGifsSent: function () {
    if (!ROOM.Firebase || !ROOM.Firebase.participantsCache || !ROOM.currentUser) return 0;
    var myPhone = ROOM.currentUser.phoneNumber;
    for (var i = 0; i < ROOM.Firebase.participantsCache.length; i++) {
      if (ROOM.Firebase.participantsCache[i].id === myPhone) {
        return ROOM.Firebase.participantsCache[i].data.gifsSent || 0;
      }
    }
    return 0;
  },

  _getAvailableGifs: function () {
    var pts = this._getMyPoints();
    var sent = this._getGifsSent();
    var unlocked = Math.floor(pts / 10);
    return Math.max(0, unlocked - sent);
  },

  _getMemberLabel: function (key) {
    for (var i = 0; i < this.MEMBERS.length; i++) {
      if (this.MEMBERS[i].key === key) return this.MEMBERS[i].emoji + ' ' + this.MEMBERS[i].label;
    }
    return key;
  },

  _getActionLabel: function (key) {
    for (var i = 0; i < this.ACTIONS.length; i++) {
      if (this.ACTIONS[i].key === key) return this.ACTIONS[i].emoji + ' ' + this.ACTIONS[i].label;
    }
    return key;
  },

  _removeModal: function () {
    if (this._modalEl) {
      this._modalEl.remove();
      this._modalEl = null;
    }
  },

  _esc: function (text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  },
};
