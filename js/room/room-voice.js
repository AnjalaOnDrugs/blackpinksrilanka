/**
 * Room Voice Messages
 * Top 5 players can record and send voice messages displayed as bubbles.
 * Uses browser MediaRecorder API for recording, Convex for storage/sync.
 * 10-minute cooldown per user; new messages replace previous ones.
 */

window.ROOM = window.ROOM || {};

ROOM.Voice = {
  bubbleBar: null,
  recordBtn: null,
  recordModal: null,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  recordingStartTime: 0,
  recordingTimer: null,
  MAX_DURATION: 15, // seconds
  unsubscribers: [],
  currentAudio: null,
  playingMessageId: null,
  canSendCache: { canSend: false, isTop5: false, cooldownRemaining: 0 },
  cooldownTimer: null,

  init: function () {
    this.bubbleBar = document.getElementById('voiceBubbleBar');
    this.recordBtn = document.getElementById('voiceRecordBtn');

    if (!this.bubbleBar) return;

    var self = this;

    // Record button click
    if (this.recordBtn) {
      this.recordBtn.addEventListener('click', function () {
        self.showRecordModal();
      });
    }

    // Subscribe to voice messages
    var unsub1 = ConvexService.watch(
      'voiceMessages:listByRoom',
      { roomId: ROOM.Firebase.roomId },
      function (messages) {
        if (messages) self.renderBubbles(messages);
      }
    );
    this.unsubscribers.push(unsub1);

    // Subscribe to canSend status
    if (ROOM.currentUser) {
      var unsub2 = ConvexService.watch(
        'voiceMessages:canSend',
        {
          roomId: ROOM.Firebase.roomId,
          phoneNumber: ROOM.currentUser.phoneNumber
        },
        function (status) {
          if (status) {
            self.canSendCache = status;
            self.updateRecordButton(status);
          }
        }
      );
      this.unsubscribers.push(unsub2);
    }
  },

  updateRecordButton: function (status) {
    if (!this.recordBtn) return;

    var container = document.getElementById('voiceBubbleContainer');

    if (!status.isTop5) {
      this.recordBtn.style.display = 'none';
      // Still show container if there are voice bubbles
      return;
    }

    this.recordBtn.style.display = '';
    // Ensure container is visible when user is top 5
    if (container) container.style.display = '';

    if (status.canSend) {
      this.recordBtn.classList.remove('room-voice-btn--cooldown');
      this.recordBtn.removeAttribute('disabled');
      this.recordBtn.title = 'Record voice message';
      // Clear any running cooldown timer display
      var timerEl = this.recordBtn.querySelector('.room-voice-btn-timer');
      if (timerEl) timerEl.remove();
    } else {
      this.recordBtn.classList.add('room-voice-btn--cooldown');
      this.recordBtn.setAttribute('disabled', 'true');
      this.startCooldownDisplay(status.cooldownRemaining);
    }
  },

  startCooldownDisplay: function (remainingMs) {
    var self = this;
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);

    var endTime = Date.now() + remainingMs;

    function update() {
      var remaining = endTime - Date.now();
      if (remaining <= 0) {
        clearInterval(self.cooldownTimer);
        self.cooldownTimer = null;
        var timerEl = self.recordBtn.querySelector('.room-voice-btn-timer');
        if (timerEl) timerEl.remove();
        return;
      }
      var mins = Math.floor(remaining / 60000);
      var secs = Math.floor((remaining % 60000) / 1000);
      var timerEl = self.recordBtn.querySelector('.room-voice-btn-timer');
      if (!timerEl) {
        timerEl = document.createElement('span');
        timerEl.className = 'room-voice-btn-timer';
        self.recordBtn.appendChild(timerEl);
      }
      timerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    update();
    this.cooldownTimer = setInterval(update, 1000);
  },

  renderBubbles: function (messages) {
    if (!this.bubbleBar) return;

    var self = this;
    var html = '';

    messages.forEach(function (msg) {
      var color = msg.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
      var voicePic = (ROOM.profilePicMap && msg.phoneNumber) ? ROOM.profilePicMap[msg.phoneNumber] : null;
      var voiceAv = ROOM.avatarInner({ profilePicture: voicePic, username: msg.username });
      var durationStr = Math.round(msg.duration) + 's';
      var isPlaying = self.playingMessageId === msg._id;
      var playingClass = isPlaying ? ' room-voice-bubble--playing' : '';

      html +=
        '<button class="room-voice-bubble' + playingClass + '" data-id="' + msg._id + '" title="' + self.escapeAttr(msg.username) + ' - Voice message">' +
          '<div class="room-voice-bubble-avatar" style="' + (voiceAv.hasImage ? 'background:transparent;' : 'background:' + color + ';') + '">' +
            voiceAv.html +
            '<div class="room-voice-bubble-rank">#' + msg.rank + '</div>' +
          '</div>' +
          '<div class="room-voice-bubble-wave">' +
            '<div class="room-voice-wave-bar"></div>' +
            '<div class="room-voice-wave-bar"></div>' +
            '<div class="room-voice-wave-bar"></div>' +
            '<div class="room-voice-wave-bar"></div>' +
            '<div class="room-voice-wave-bar"></div>' +
          '</div>' +
          '<div class="room-voice-bubble-info">' +
            '<span class="room-voice-bubble-name">' + self.escapeHtml(msg.username) + '</span>' +
            '<span class="room-voice-bubble-dur">' + durationStr + '</span>' +
          '</div>' +
        '</button>';
    });

    this.bubbleBar.innerHTML = html;

    // Attach click handlers
    var bubbles = this.bubbleBar.querySelectorAll('.room-voice-bubble');
    bubbles.forEach(function (bubble) {
      bubble.addEventListener('click', function () {
        var msgId = bubble.dataset.id;
        self.playMessage(msgId, bubble);
      });
    });

    // Show/hide the bar (show if there are messages OR user is top 5)
    var container = document.getElementById('voiceBubbleContainer');
    if (container) {
      var hasMessages = messages.length > 0;
      var isTop5 = this.canSendCache.isTop5;
      container.style.display = (hasMessages || isTop5) ? '' : 'none';
    }
  },

  playMessage: function (messageId, bubbleEl) {
    var self = this;

    // If already playing this message, stop it
    if (this.playingMessageId === messageId && this.currentAudio) {
      this.stopPlayback();
      return;
    }

    // Stop any current playback
    this.stopPlayback();

    // Mark as playing
    this.playingMessageId = messageId;
    if (bubbleEl) bubbleEl.classList.add('room-voice-bubble--playing');

    // Fetch audio data
    ConvexService.query('voiceMessages:getAudio', { messageId: messageId })
      .then(function (result) {
        if (!result || !result.audioData) {
          self.stopPlayback();
          return;
        }

        // Decode base64 to blob
        var byteChars = atob(result.audioData);
        var byteNumbers = new Array(byteChars.length);
        for (var i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        var byteArray = new Uint8Array(byteNumbers);
        var blob = new Blob([byteArray], { type: 'audio/webm;codecs=opus' });
        var url = URL.createObjectURL(blob);

        var audio = new Audio(url);
        self.currentAudio = audio;

        audio.addEventListener('ended', function () {
          URL.revokeObjectURL(url);
          self.stopPlayback();
        });

        audio.addEventListener('error', function () {
          URL.revokeObjectURL(url);
          self.stopPlayback();
        });

        audio.play().catch(function () {
          self.stopPlayback();
        });
      })
      .catch(function () {
        self.stopPlayback();
      });
  },

  stopPlayback: function () {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    // Remove playing state from all bubbles
    if (this.bubbleBar) {
      var playing = this.bubbleBar.querySelectorAll('.room-voice-bubble--playing');
      playing.forEach(function (el) { el.classList.remove('room-voice-bubble--playing'); });
    }

    this.playingMessageId = null;
  },

  showRecordModal: function () {
    if (!this.canSendCache.canSend || !this.canSendCache.isTop5) return;

    var self = this;

    // Create modal
    var modal = document.createElement('div');
    modal.className = 'room-modal-backdrop room-voice-modal-backdrop';
    modal.innerHTML =
      '<div class="room-modal room-voice-modal">' +
        '<div class="room-modal-icon room-voice-modal-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
            '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
            '<line x1="12" y1="19" x2="12" y2="23"/>' +
            '<line x1="8" y1="23" x2="16" y2="23"/>' +
          '</svg>' +
        '</div>' +
        '<div class="room-modal-title">Voice Message</div>' +
        '<div class="room-modal-desc">Hold to record (max ' + this.MAX_DURATION + 's). Release to stop.</div>' +
        '<div class="room-voice-recorder">' +
          '<div class="room-voice-timer" id="voiceRecordTimer">0:00</div>' +
          '<div class="room-voice-progress">' +
            '<div class="room-voice-progress-fill" id="voiceProgressFill"></div>' +
          '</div>' +
          '<button class="room-voice-record-circle" id="voiceRecordCircle">' +
            '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">' +
              '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
            '</svg>' +
          '</button>' +
          '<div class="room-voice-record-hint" id="voiceRecordHint">Tap to start recording</div>' +
        '</div>' +
        '<div class="room-voice-preview" id="voicePreview" style="display:none;">' +
          '<button class="room-voice-preview-play" id="voicePreviewPlay">' +
            '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">' +
              '<polygon points="5 3 19 12 5 21 5 3"></polygon>' +
            '</svg>' +
          '</button>' +
          '<div class="room-voice-preview-wave">' +
            '<div class="room-voice-wave-bar"></div><div class="room-voice-wave-bar"></div>' +
            '<div class="room-voice-wave-bar"></div><div class="room-voice-wave-bar"></div>' +
            '<div class="room-voice-wave-bar"></div><div class="room-voice-wave-bar"></div>' +
            '<div class="room-voice-wave-bar"></div><div class="room-voice-wave-bar"></div>' +
          '</div>' +
          '<span class="room-voice-preview-dur" id="voicePreviewDur">0s</span>' +
        '</div>' +
        '<div class="room-modal-actions">' +
          '<button class="room-modal-btn room-modal-btn--secondary" id="voiceCancelBtn">Cancel</button>' +
          '<button class="room-modal-btn room-modal-btn--primary" id="voiceSendBtn" disabled>Send</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    this.recordModal = modal;

    var recordCircle = modal.querySelector('#voiceRecordCircle');
    var cancelBtn = modal.querySelector('#voiceCancelBtn');
    var sendBtn = modal.querySelector('#voiceSendBtn');
    var timerEl = modal.querySelector('#voiceRecordTimer');
    var progressFill = modal.querySelector('#voiceProgressFill');
    var hintEl = modal.querySelector('#voiceRecordHint');
    var previewDiv = modal.querySelector('#voicePreview');
    var previewPlayBtn = modal.querySelector('#voicePreviewPlay');
    var previewDur = modal.querySelector('#voicePreviewDur');

    var recordedBlob = null;
    var previewAudio = null;

    // Tap to start/stop recording
    recordCircle.addEventListener('click', function () {
      if (self.isRecording) {
        self.stopRecording();
      } else {
        self.startRecording(timerEl, progressFill, hintEl, recordCircle, function (blob, duration) {
          recordedBlob = blob;
          sendBtn.removeAttribute('disabled');
          previewDiv.style.display = '';
          previewDur.textContent = Math.round(duration) + 's';
          hintEl.textContent = 'Recording complete!';
          recordCircle.style.display = 'none';
        });
      }
    });

    // Preview playback
    previewPlayBtn.addEventListener('click', function () {
      if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
        previewPlayBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        return;
      }
      if (!recordedBlob) return;
      var url = URL.createObjectURL(recordedBlob);
      previewAudio = new Audio(url);
      previewPlayBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      previewAudio.play();
      previewAudio.addEventListener('ended', function () {
        URL.revokeObjectURL(url);
        previewAudio = null;
        previewPlayBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      });
    });

    // Cancel
    cancelBtn.addEventListener('click', function () {
      self.closeRecordModal();
    });

    // Send
    sendBtn.addEventListener('click', function () {
      if (!recordedBlob) return;
      sendBtn.setAttribute('disabled', 'true');
      sendBtn.textContent = 'Sending...';
      self.sendVoiceMessage(recordedBlob, function () {
        self.closeRecordModal();
        if (ROOM.Animations && ROOM.Animations.showToast) {
          ROOM.Animations.showToast('join', '🎤', 'Voice message sent!');
        }
      }, function (err) {
        sendBtn.removeAttribute('disabled');
        sendBtn.textContent = 'Send';
        hintEl.textContent = err || 'Failed to send. Try again.';
        hintEl.style.color = '#ff6b7a';
      });
    });

    // Click backdrop to close
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        self.closeRecordModal();
      }
    });
  },

  startRecording: function (timerEl, progressFill, hintEl, circleBtn, onComplete) {
    var self = this;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      hintEl.textContent = 'Microphone not supported in this browser';
      hintEl.style.color = '#ff6b7a';
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        self.isRecording = true;
        self.audioChunks = [];
        self.recordingStartTime = Date.now();

        circleBtn.classList.add('room-voice-record-circle--active');
        hintEl.textContent = 'Recording... Tap to stop';

        // Choose best available format
        var mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }

        var options = mimeType ? { mimeType: mimeType } : {};
        self.mediaRecorder = new MediaRecorder(stream, options);

        self.mediaRecorder.ondataavailable = function (e) {
          if (e.data.size > 0) {
            self.audioChunks.push(e.data);
          }
        };

        self.mediaRecorder.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          var duration = (Date.now() - self.recordingStartTime) / 1000;
          var blob = new Blob(self.audioChunks, { type: mimeType || 'audio/webm' });
          self.isRecording = false;
          circleBtn.classList.remove('room-voice-record-circle--active');

          if (duration < 1) {
            hintEl.textContent = 'Too short! Hold for at least 1 second.';
            hintEl.style.color = '#ff6b7a';
            return;
          }

          onComplete(blob, Math.min(duration, self.MAX_DURATION));
        };

        self.mediaRecorder.start(100); // Collect data every 100ms

        // Timer UI
        self.recordingTimer = setInterval(function () {
          var elapsed = (Date.now() - self.recordingStartTime) / 1000;
          var mins = Math.floor(elapsed / 60);
          var secs = Math.floor(elapsed % 60);
          timerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
          var pct = Math.min((elapsed / self.MAX_DURATION) * 100, 100);
          progressFill.style.width = pct + '%';

          if (elapsed >= self.MAX_DURATION) {
            self.stopRecording();
          }
        }, 200);
      })
      .catch(function (err) {
        console.error('Mic access denied:', err);
        hintEl.textContent = 'Microphone access denied';
        hintEl.style.color = '#ff6b7a';
      });
  },

  stopRecording: function () {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording = false;
  },

  sendVoiceMessage: function (blob, onSuccess, onError) {
    var self = this;
    var reader = new FileReader();

    reader.onloadend = function () {
      // Get base64 data (strip the data:audio/webm;base64, prefix)
      var base64 = reader.result.split(',')[1];
      var duration = (Date.now() - self.recordingStartTime) / 1000;
      duration = Math.min(duration, self.MAX_DURATION);

      ConvexService.mutation('voiceMessages:send', {
        roomId: ROOM.Firebase.roomId,
        phoneNumber: ROOM.currentUser.phoneNumber,
        username: ROOM.currentUser.username,
        avatarColor: ROOM.currentUser.avatarColor,
        audioData: base64,
        duration: duration,
      }).then(function () {
        onSuccess();
      }).catch(function (err) {
        console.error('Voice send error:', err);
        var msg = err.message || 'Failed to send';
        // Extract user-friendly part from Convex error
        if (msg.indexOf('Cooldown') >= 0 || msg.indexOf('top 5') >= 0) {
          onError(msg);
        } else {
          onError('Failed to send voice message');
        }
      });
    };

    reader.onerror = function () {
      onError('Failed to process audio');
    };

    reader.readAsDataURL(blob);
  },

  closeRecordModal: function () {
    this.stopRecording();
    if (this.recordModal) {
      this.recordModal.remove();
      this.recordModal = null;
    }
  },

  destroy: function () {
    this.stopPlayback();
    this.stopRecording();
    this.closeRecordModal();
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.unsubscribers.forEach(function (unsub) {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribers = [];
  },

  escapeHtml: function (text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  escapeAttr: function (text) {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
};
