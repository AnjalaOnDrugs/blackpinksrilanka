/**
 * Room Chat - "Concert Lightstick" Bubble System
 * Messages float up as glowing bubbles with sway animation
 */

window.ROOM = window.ROOM || {};

ROOM.Chat = {
  bubbleLayer: null,
  chatLogMessages: null,
  chatLog: [],
  MAX_LOG: 50,
  MAX_BUBBLES: 30,
  lastSendTime: 0,
  SEND_COOLDOWN: 1500, // 1.5s between messages
  lastWaveTime: 0,
  WAVE_COOLDOWN: 10000, // 10s between lightstick waves

  init: function () {
    this.bubbleLayer = document.getElementById('chatBubbleLayer');
    this.chatLogMessages = document.getElementById('chatLogMessages');

    var self = this;

    // Send button
    var sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) {
      sendBtn.addEventListener('click', function () { self.send(); });
    }

    // Enter key to send
    var input = document.getElementById('chatInput');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          self.send();
        }
      });
    }

    // Reaction buttons
    var reactionBtns = document.querySelectorAll('.room-reaction-btn');
    reactionBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.sendReaction(btn.dataset.emoji, btn.textContent.trim());
      });
    });

    // Lightstick wave button
    var lightstickBtn = document.getElementById('lightstickWaveBtn');
    if (lightstickBtn) {
      lightstickBtn.addEventListener('click', function () {
        self.sendLightstickWave();
      });
    }

    // Chat log toggle
    var toggle = document.getElementById('chatLogToggle');
    var chatLog = document.getElementById('chatLog');
    if (toggle && chatLog) {
      toggle.addEventListener('click', function () {
        chatLog.classList.toggle('room-chat-log--collapsed');
      });
    }
  },

  send: function () {
    var input = document.getElementById('chatInput');
    if (!input) return;

    var text = input.value.trim();
    if (!text) return;

    // Rate limit
    var now = Date.now();
    if (now - this.lastSendTime < this.SEND_COOLDOWN) return;
    this.lastSendTime = now;

    input.value = '';

    var msgData = {
      type: 'message',
      username: ROOM.currentUser.username,
      text: text,
      color: ROOM.currentUser.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)',
      timestamp: now
    };

    // Try Agora first, fallback to Firebase
    if (ROOM.Agora.channel) {
      ROOM.Agora.sendMessage(msgData);
    } else {
      ROOM.Firebase.sendChatMessage(msgData);
    }

    // Display own message immediately
    this.displayMessage(msgData);
  },

  sendReaction: function (emoji, emojiChar) {
    var now = Date.now();
    if (now - this.lastSendTime < 500) return;
    this.lastSendTime = now;

    var msgData = {
      type: 'reaction',
      username: ROOM.currentUser.username,
      emoji: emojiChar,
      emojiName: emoji,
      color: ROOM.currentUser.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)',
      timestamp: now
    };

    // Try Agora first, fallback to Firebase
    if (ROOM.Agora.channel) {
      ROOM.Agora.sendMessage(msgData);
    } else {
      ROOM.Firebase.sendChatMessage(msgData);
    }
    this.displayMessage(msgData);
  },

  sendLightstickWave: function () {
    var now = Date.now();
    if (now - this.lastWaveTime < this.WAVE_COOLDOWN) return;
    this.lastWaveTime = now;

    var msgData = {
      type: 'lightstick_wave',
      username: ROOM.currentUser.username,
      color: ROOM.currentUser.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)',
      timestamp: now
    };

    if (ROOM.Agora.channel) {
      ROOM.Agora.sendMessage(msgData);
    } else {
      ROOM.Firebase.sendChatMessage(msgData);
    }
    this.displayMessage(msgData);
  },

  displayLightstickWave: function (msg) {
    if (!this.bubbleLayer) return;

    var count = 10 + Math.floor(Math.random() * 6); // 10-15 lightsticks

    for (var i = 0; i < count; i++) {
      var el = document.createElement('div');
      el.className = 'room-lightstick-wave';

      var img = document.createElement('img');
      img.src = 'assets/logo/lightstick.png';
      img.alt = 'lightstick';
      el.appendChild(img);

      // Spread across 15%-85% of screen width
      el.style.left = (15 + Math.random() * 70) + '%';

      // Varied size (28-48px)
      var size = 28 + Math.floor(Math.random() * 20);
      el.style.setProperty('--wave-size', size + 'px');

      // Staggered delay (0 - 0.8s)
      el.style.setProperty('--wave-delay', (Math.random() * 0.8) + 's');

      // Varied duration (2.5 - 4s)
      el.style.setProperty('--wave-duration', (2.5 + Math.random() * 1.5) + 's');

      // Random horizontal drift
      el.style.setProperty('--wave-drift-x', (Math.random() * 120 - 60) + 'px');

      // Random rotation phases for a natural swaying feel
      el.style.setProperty('--wave-rot-start', (Math.random() * 30 - 15) + 'deg');
      el.style.setProperty('--wave-rot-mid', (Math.random() * 20 - 10) + 'deg');
      el.style.setProperty('--wave-rot-end', (Math.random() * 40 - 20) + 'deg');

      // Slight peak scale variation
      el.style.setProperty('--wave-peak-scale', (0.9 + Math.random() * 0.4).toFixed(2));

      this.bubbleLayer.appendChild(el);

      (function (element) {
        setTimeout(function () {
          if (element.parentNode) element.remove();
        }, 5000);
      })(el);
    }

    this.addToLog({
      username: msg.username,
      text: '🔦 lightstick wave',
      type: 'reaction'
    });
  },

  displayMessage: function (msg) {
    if (msg.type === 'lightstick_wave') {
      this.displayLightstickWave(msg);
      return;
    }
    if (msg.type === 'reaction') {
      this.displayReaction(msg);
      return;
    }

    this.createBubble(msg);
    this.addToLog(msg);
  },

  createBubble: function (msg) {
    if (!this.bubbleLayer) return;

    // Limit active bubbles
    var existing = this.bubbleLayer.querySelectorAll('.room-chat-bubble');
    if (existing.length >= this.MAX_BUBBLES) {
      existing[0].remove();
    }

    var bubble = document.createElement('div');
    bubble.className = 'room-chat-bubble';

    // Random horizontal position (15% - 85%)
    var xPos = 15 + Math.random() * 70;
    bubble.style.left = xPos + '%';
    bubble.style.setProperty('--sway', (Math.random() * 40 - 20) + 'px');

    var color = msg.color || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
    // Look up profile picture from participants cache
    var pic = (ROOM.profilePicMap && msg.userId) ? ROOM.profilePicMap[msg.userId] : null;
    if (!pic && ROOM.currentUser && msg.userId === ROOM.currentUser.phoneNumber) {
      pic = ROOM.currentUser.profilePicture;
    }
    var av = ROOM.avatarInner({ profilePicture: pic, username: msg.username });

    bubble.innerHTML =
      '<div class="room-chat-bubble-avatar" style="' + (av.hasImage ? 'background:transparent;overflow:hidden;' : 'background:' + color + ';') + '">' +
        av.html +
      '</div>' +
      '<div class="room-chat-bubble-content">' +
        '<span class="room-chat-bubble-name">' + this.escapeHtml(msg.username || 'Anon') + '</span>' +
        '<span class="room-chat-bubble-text">' + this.escapeHtml(msg.text) + '</span>' +
      '</div>';

    this.bubbleLayer.appendChild(bubble);

    // Remove after animation (8s)
    setTimeout(function () {
      if (bubble.parentNode) bubble.remove();
    }, 8000);
  },

  displayReaction: function (msg) {
    if (!this.bubbleLayer) return;

    var emoji = msg.emoji || '🔥';

    for (var i = 0; i < 6; i++) {
      var el = document.createElement('div');
      el.className = 'room-reaction-burst';
      el.textContent = emoji;
      el.style.left = (35 + Math.random() * 30) + '%';
      el.style.setProperty('--burst-x', (Math.random() * 200 - 100) + 'px');
      el.style.setProperty('--burst-delay', (Math.random() * 0.3) + 's');
      this.bubbleLayer.appendChild(el);

      (function (element) {
        setTimeout(function () {
          if (element.parentNode) element.remove();
        }, 2500);
      })(el);
    }

    // Add to log
    this.addToLog({
      username: msg.username,
      text: emoji,
      type: 'reaction'
    });
  },

  addToLog: function (msg) {
    if (!this.chatLogMessages) return;

    this.chatLog.push(msg);
    if (this.chatLog.length > this.MAX_LOG) {
      this.chatLog.shift();
    }

    var el = document.createElement('div');
    el.className = 'room-chat-log-msg';
    el.innerHTML =
      '<span class="room-chat-log-msg-name">' + this.escapeHtml(msg.username || 'Anon') + '</span>' +
      this.escapeHtml(msg.text || '');

    this.chatLogMessages.appendChild(el);

    // Keep only last 15 visible
    var children = this.chatLogMessages.children;
    while (children.length > 15) {
      children[0].remove();
    }

    // Auto scroll to bottom
    this.chatLogMessages.scrollTop = this.chatLogMessages.scrollHeight;
  },

  escapeHtml: function (text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
