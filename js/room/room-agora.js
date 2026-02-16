/**
 * Room Agora RTM Service
 * Handles real-time chat messaging via Agora RTM SDK
 * Includes automatic reconnection with exponential backoff
 */

window.ROOM = window.ROOM || {};

ROOM.Agora = {
  client: null,
  channel: null,
  userId: null,
  roomId: null,
  connected: false,
  destroyed: false,

  // Reconnection state
  _reconnecting: false,
  _reconnectAttempts: 0,
  _maxReconnectAttempts: 10,
  _baseReconnectDelay: 2000,   // 2 seconds
  _maxReconnectDelay: 60000,   // 60 seconds
  _reconnectTimer: null,
  _kickedPromptShown: false,

  init: function (userId, roomId) {
    this.userId = userId;
    this.roomId = roomId;
    this.destroyed = false;
    this._reconnectAttempts = 0;
    this._kickedPromptShown = false;

    if (typeof AgoraRTM === 'undefined') {
      console.warn('Agora RTM SDK not loaded. Using Firebase fallback for chat.');
      return Promise.resolve();
    }

    var appId = CONFIG.agoraAppId;
    if (!appId || appId === 'YOUR_AGORA_APP_ID') {
      console.warn('Agora App ID not configured. Using Firebase fallback for chat.');
      return Promise.resolve();
    }

    return this._connect();
  },

  _connect: function () {
    var self = this;
    var appId = CONFIG.agoraAppId;

    // Clean up any existing client before reconnecting
    this._cleanup();

    try {
      this.client = AgoraRTM.createInstance(appId);
    } catch (e) {
      console.error('Failed to create Agora RTM instance:', e);
      return Promise.resolve();
    }

    // Listen for connection state changes
    this.client.on('ConnectionStateChanged', function (newState, reason) {
      console.log('Agora RTM state:', newState, 'reason:', reason);

      if (newState === 'DISCONNECTED' || newState === 'ABORTED') {
        self.connected = false;

        if (self.destroyed) return;

        if (reason === 'REMOTE_LOGIN') {
          // Kicked by another session — prompt user
          self._showKickedPrompt();
        } else if (reason === 'TOKEN_EXPIRED') {
          console.warn('Agora RTM: Token expired. Reconnecting with new token...');
          self._scheduleReconnect();
        } else if (reason !== 'LOGOUT') {
          // Network disconnect or other issue — auto reconnect
          console.warn('Agora RTM: Disconnected (' + reason + '). Reconnecting...');
          self._scheduleReconnect();
        }
      } else if (newState === 'CONNECTED') {
        self.connected = true;
        self._reconnectAttempts = 0;
        self._reconnecting = false;
      }
    });

    // Listen for token expiration warning
    this.client.on('TokenExpired', function () {
      console.warn('Agora RTM: Token about to expire. Renewing...');
      self._renewToken();
    });

    // Check if token server is configured
    var tokenServerUrl = CONFIG.agoraTokenServerUrl;

    if (!tokenServerUrl) {
      return this.loginAndJoin(null, this.userId, this.roomId);
    }

    // Fetch token from server
    return this.fetchToken(this.userId, this.roomId).then(function (token) {
      return self.loginAndJoin(token, self.userId, self.roomId);
    }).catch(function (err) {
      console.error('Failed to fetch Agora token:', err);
      return self.loginAndJoin(null, self.userId, self.roomId);
    });
  },

  _showKickedPrompt: function () {
    if (this._kickedPromptShown || this.destroyed) return;
    this._kickedPromptShown = true;

    var self = this;

    // Use a small delay to ensure the UI is ready
    setTimeout(function () {
      var stayHere = confirm('You were logged in from another device.\n\nDo you want to log back in here?');

      if (stayHere) {
        console.log('Agora RTM: User chose to log back in here.');
        self._kickedPromptShown = false;
        self._reconnectAttempts = 0;
        self._connect().catch(function (err) {
          console.error('Agora RTM: Re-login failed:', err);
        });
      } else {
        console.log('Agora RTM: User chose to leave the room.');
        self.destroyed = true;
        self._cleanup();

        // Leave the room
        if (ROOM.currentUser) {
          ROOM.Firebase.leaveRoom(ROOM.currentUser.phoneNumber);
        }
        window.location.href = 'login.html';
      }
    }, 300);
  },

  _scheduleReconnect: function () {
    var self = this;

    if (this.destroyed || this._reconnecting) return;

    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.error('Agora RTM: Max reconnection attempts reached (' + this._maxReconnectAttempts + '). Giving up.');
      console.warn('Falling back to Firebase for chat.');
      return;
    }

    this._reconnecting = true;
    this._reconnectAttempts++;

    // Exponential backoff with jitter
    var delay = Math.min(
      this._baseReconnectDelay * Math.pow(2, this._reconnectAttempts - 1),
      this._maxReconnectDelay
    );
    // Add random jitter (0-25% of delay)
    delay += Math.random() * delay * 0.25;

    console.log('Agora RTM: Reconnecting in ' + Math.round(delay / 1000) + 's (attempt ' + this._reconnectAttempts + '/' + this._maxReconnectAttempts + ')');

    this._reconnectTimer = setTimeout(function () {
      if (self.destroyed) return;
      self._connect().catch(function (err) {
        console.error('Agora RTM: Reconnection failed:', err);
        self._reconnecting = false;
        self._scheduleReconnect();
      });
    }, delay);
  },

  _renewToken: function () {
    var self = this;

    if (!CONFIG.agoraTokenServerUrl || !this.client) return;

    this.fetchToken(this.userId, this.roomId).then(function (token) {
      return self.client.renewToken(token);
    }).then(function () {
      console.log('Agora RTM: Token renewed successfully');
    }).catch(function (err) {
      console.error('Agora RTM: Token renewal failed:', err);
    });
  },

  _cleanup: function () {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this.channel) {
      try { this.channel.leave().catch(function () { }); } catch (e) { }
      this.channel = null;
    }

    if (this.client) {
      try {
        this.client.removeAllListeners();
        this.client.logout().catch(function () { });
      } catch (e) { }
      this.client = null;
    }

    this.connected = false;
  },

  fetchToken: function (userId, roomId) {
    var url = CONFIG.agoraTokenServerUrl +
      '?userId=' + encodeURIComponent(userId) +
      '&channelName=' + encodeURIComponent(roomId);

    return fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Token server returned HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        console.log('Token server response:', data);

        if (data.error || !data.success) {
          throw new Error('Token server error: ' + (data.error || 'Unknown error'));
        }

        if (!data.token) {
          throw new Error('No token in response');
        }

        console.log('Token received successfully');
        return data.token;
      });
  },

  loginAndJoin: function (token, userId, roomId) {
    var self = this;

    // Login with or without token
    var loginOptions = { uid: String(userId) };
    if (token) {
      loginOptions.token = token;
      console.log('Logging in to Agora RTM with token');
    } else {
      console.log('Logging in to Agora RTM without token');
    }

    return this.client.login(loginOptions).then(function () {
      self.channel = self.client.createChannel(roomId);
      return self.channel.join();
    }).then(function () {
      // Listen for channel messages
      self.channel.on('ChannelMessage', function (message, memberId) {
        try {
          var parsed = JSON.parse(message.text);
          if (ROOM.Chat && ROOM.Chat.displayMessage) {
            ROOM.Chat.displayMessage(parsed);
          }
        } catch (e) {
          console.error('Failed to parse chat message:', e);
        }
      });

      // Listen for member join/leave
      self.channel.on('MemberJoined', function (memberId) {
        // Join events are handled via Firestore for consistency
      });

      self.connected = true;
      console.log('Agora RTM connected');
    }).catch(function (err) {
      self.connected = false;
      console.error('Agora RTM connection error:', err);
      console.warn('Falling back to Firebase for chat. To fix: Disable "Primary Certificate" in Agora Console or implement token authentication.');
    });
  },

  sendMessage: function (data) {
    if (!this.channel || !this.connected) return Promise.resolve();
    return this.channel.sendMessage({
      text: JSON.stringify(data)
    }).catch(function (err) {
      console.error('Failed to send message:', err);
    });
  },

  destroy: function () {
    this.destroyed = true;
    this._cleanup();
  }
};
