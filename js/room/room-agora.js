/**
 * Room Agora RTM Service
 * Handles real-time chat messaging via Agora RTM SDK
 */

window.ROOM = window.ROOM || {};

ROOM.Agora = {
  client: null,
  channel: null,
  userId: null,

  init: function (userId, roomId) {
    this.userId = userId;

    if (typeof AgoraRTM === 'undefined') {
      console.warn('Agora RTM SDK not loaded. Using Firebase fallback for chat.');
      return Promise.resolve();
    }

    var appId = CONFIG.agoraAppId;
    if (!appId || appId === 'YOUR_AGORA_APP_ID') {
      console.warn('Agora App ID not configured. Using Firebase fallback for chat.');
      return Promise.resolve();
    }

    var self = this;

    try {
      this.client = AgoraRTM.createInstance(appId);
    } catch (e) {
      console.error('Failed to create Agora RTM instance:', e);
      return Promise.resolve();
    }

    // Check if token server is configured
    var tokenServerUrl = CONFIG.agoraTokenServerUrl;

    if (!tokenServerUrl) {
      // Try without token first (will fail if dynamic key enabled)
      return this.loginAndJoin(null, userId, roomId);
    }

    // Fetch token from server
    return this.fetchToken(userId, roomId).then(function (token) {
      return self.loginAndJoin(token, userId, roomId);
    }).catch(function (err) {
      console.error('Failed to fetch Agora token:', err);
      // Try without token as fallback
      return self.loginAndJoin(null, userId, roomId);
    });
  },

  fetchToken: function (userId, roomId) {
    // Use JSONP to avoid CORS issues with Google Apps Script
    return new Promise(function (resolve, reject) {
      var callbackName = 'agoraTokenCallback_' + Date.now();
      var url = CONFIG.agoraTokenServerUrl +
                '?userId=' + encodeURIComponent(userId) +
                '&channelName=' + encodeURIComponent(roomId) +
                '&callback=' + callbackName;

      // Create callback function
      window[callbackName] = function (data) {
        // Cleanup
        delete window[callbackName];
        document.body.removeChild(script);

        // Log the response for debugging
        console.log('Token server response:', data);

        // Check for errors
        if (data.error) {
          reject(new Error('Token server error: ' + data.error));
          return;
        }

        // Check for success and token
        if (!data.success || !data.token) {
          reject(new Error('No token in response: ' + JSON.stringify(data)));
          return;
        }

        console.log('Token received successfully');
        resolve(data.token);
      };

      // Create script tag for JSONP
      var script = document.createElement('script');
      script.src = url;
      script.onerror = function () {
        delete window[callbackName];
        document.body.removeChild(script);
        reject(new Error('Failed to load token from server'));
      };

      // Add timeout
      setTimeout(function () {
        if (window[callbackName]) {
          delete window[callbackName];
          if (script.parentNode) {
            document.body.removeChild(script);
          }
          reject(new Error('Token request timeout'));
        }
      }, 10000); // 10 second timeout

      document.body.appendChild(script);
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

      console.log('Agora RTM connected');
    }).catch(function (err) {
      console.error('Agora RTM connection error:', err);
      console.warn('Falling back to Firebase for chat. To fix: Disable "Primary Certificate" in Agora Console or implement token authentication.');
    });
  },

  sendMessage: function (data) {
    if (!this.channel) return Promise.resolve();
    return this.channel.sendMessage({
      text: JSON.stringify(data)
    }).catch(function (err) {
      console.error('Failed to send message:', err);
    });
  },

  destroy: function () {
    var self = this;
    if (this.channel) {
      this.channel.leave().catch(function () {});
    }
    if (this.client) {
      this.client.logout().catch(function () {});
    }
    this.channel = null;
    this.client = null;
  }
};
