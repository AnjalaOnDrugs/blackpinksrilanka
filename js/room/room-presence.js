/**
 * Room Presence - Firebase Realtime Database Presence System
 *
 * Uses Firebase RTDB's connection-level detection (onDisconnect) for instant
 * offline detection. Replaces the old 30s heartbeat polling to Convex.
 *
 * Architecture:
 * - Firebase RTDB handles ONLY presence (isOnline, lastSeen)
 * - Convex handles everything else (leaderboard, tracks, points, minutes)
 * - onDisconnect() fires server-side when the WebSocket drops (tab close,
 *   network loss, phone sleep) — instant, no polling needed
 *
 * RTDB structure:
 *   /presence/{roomId}/{phoneNumber} = {
 *     online: true/false,
 *     lastSeen: <server timestamp>
 *   }
 */

window.ROOM = window.ROOM || {};

ROOM.Presence = {
  _db: null,
  _roomRef: null,
  _userRef: null,
  _connectedRef: null,
  _roomId: null,
  _phoneNumber: null,
  _presenceCache: {},    // { phoneNumber: { online: bool, lastSeen: number } }
  _listeners: [],        // callbacks to notify on presence change
  _roomListener: null,   // Firebase listener handle
  _connListener: null,   // .info/connected listener handle
  _initialized: false,
  _readOnly: false,       // if true, only reads presence data (no writes)

  /**
   * Initialize presence for a room.
   * Sets up Firebase RTDB listeners and onDisconnect handlers.
   *
   * @param {string} roomId
   * @param {string} phoneNumber - current user's phone number
   * @param {Object} [options] - { readOnly: true } to only listen (e.g., members page)
   */
  init: function (roomId, phoneNumber, options) {
    if (this._initialized) return;

    var opts = options || {};
    this._readOnly = !!opts.readOnly;
    this._roomId = roomId;
    this._phoneNumber = phoneNumber;
    this._db = firebase.database();
    this._roomRef = this._db.ref('presence/' + roomId);

    var self = this;

    // Only set up write-side presence if not in read-only mode
    if (!this._readOnly) {
      this._userRef = this._roomRef.child(phoneNumber);
      this._connectedRef = this._db.ref('.info/connected');

      // Listen for connection state changes
      this._connListener = this._connectedRef.on('value', function (snap) {
        if (snap.val() === true) {
          // We're connected — set up onDisconnect BEFORE writing online state
          self._userRef.onDisconnect().set({
            online: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
          }).then(function () {
            // Now safe to mark ourselves online
            self._userRef.set({
              online: true,
              lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
          });
        }
        // If snap.val() === false, we've lost connection.
        // Firebase server will fire onDisconnect automatically.
      });
    }

    // Listen to the whole room's presence for all users (always, even in read-only mode)
    this._roomListener = this._roomRef.on('value', function (snap) {
      var data = snap.val() || {};
      self._presenceCache = data;
      self._notifyListeners();
    });

    this._initialized = true;
  },

  /**
   * Go online (called on join and when tab becomes visible again).
   * No-op in read-only mode.
   */
  goOnline: function () {
    if (!this._userRef || this._readOnly) return;
    var self = this;

    // Re-set onDisconnect (in case it was consumed by a previous disconnect)
    this._userRef.onDisconnect().set({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      self._userRef.set({
        online: true,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    });
  },

  /**
   * Go offline explicitly (called on leave / beforeunload).
   * Uses set() for immediate write; onDisconnect is backup.
   * No-op in read-only mode.
   */
  goOffline: function () {
    if (!this._userRef || this._readOnly) return;

    // Cancel the onDisconnect since we're leaving explicitly
    this._userRef.onDisconnect().cancel();
    this._userRef.set({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  },

  /**
   * Check if a user is online.
   * @param {string} phoneNumber
   * @returns {boolean}
   */
  isOnline: function (phoneNumber) {
    var entry = this._presenceCache[phoneNumber];
    return !!(entry && entry.online);
  },

  /**
   * Get lastSeen timestamp for a user.
   * @param {string} phoneNumber
   * @returns {number|null}
   */
  getLastSeen: function (phoneNumber) {
    var entry = this._presenceCache[phoneNumber];
    return entry ? (entry.lastSeen || null) : null;
  },

  /**
   * Get all presence data for the room.
   * @returns {Object} { phoneNumber: { online, lastSeen }, ... }
   */
  getAllPresence: function () {
    return this._presenceCache;
  },

  /**
   * Get count of online users.
   * @returns {number}
   */
  getOnlineCount: function () {
    var count = 0;
    var cache = this._presenceCache;
    for (var key in cache) {
      if (cache.hasOwnProperty(key) && cache[key].online) {
        count++;
      }
    }
    return count;
  },

  /**
   * Register a callback for presence changes.
   * Callback receives the full presence cache.
   * @param {Function} cb
   */
  onPresenceChange: function (cb) {
    this._listeners.push(cb);
  },

  /**
   * Remove a previously registered callback.
   * @param {Function} cb
   */
  offPresenceChange: function (cb) {
    this._listeners = this._listeners.filter(function (fn) { return fn !== cb; });
  },

  /** @private */
  _notifyListeners: function () {
    var cache = this._presenceCache;
    for (var i = 0; i < this._listeners.length; i++) {
      try {
        this._listeners[i](cache);
      } catch (e) {
        console.error('[Presence] Listener error:', e);
      }
    }
  },

  /**
   * Clean up all listeners and go offline.
   */
  destroy: function () {
    if (this._roomRef && this._roomListener !== null) {
      this._roomRef.off('value', this._roomListener);
    }
    if (this._connectedRef && this._connListener !== null) {
      this._connectedRef.off('value', this._connListener);
    }

    // Explicit offline on destroy (no-op if read-only)
    this.goOffline();

    this._listeners = [];
    this._presenceCache = {};
    this._initialized = false;
    this._readOnly = false;
    this._roomRef = null;
    this._userRef = null;
    this._connectedRef = null;
    this._db = null;
  }
};
