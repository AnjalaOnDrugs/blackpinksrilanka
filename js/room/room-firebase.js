/**
 * Room Firebase Service
 * Handles Firestore operations for room data, participants, and events
 */

window.ROOM = window.ROOM || {};

ROOM.Firebase = {
  roomRef: null,
  participantsRef: null,
  eventsRef: null,
  participantsCache: [],
  unsubscribers: [],
  roomId: null,

  init: function (roomId) {
    this.roomId = roomId;
    this.roomRef = db.collection('rooms').doc(roomId);
    this.participantsRef = this.roomRef.collection('participants');
    this.eventsRef = this.roomRef.collection('events');
    this.messagesRef = this.roomRef.collection('messages');

    // Ensure room document exists
    this.roomRef.set({
      name: 'Streaming Party',
      type: 'streaming',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Listen to participants (drives leaderboard + activity)
    var self = this;
    var unsub1 = this.participantsRef.orderBy('totalMinutes', 'desc')
      .onSnapshot(function (snapshot) {
        self.participantsCache = snapshot.docs.map(function (d) {
          return { id: d.id, data: d.data() };
        });

        // Update online count
        var onlineCount = self.participantsCache.filter(function (p) {
          return p.data.isOnline;
        }).length;
        var countEl = document.getElementById('onlineCount');
        if (countEl) countEl.textContent = onlineCount + ' online';

        // Update energy meter
        if (ROOM.Events && ROOM.Events.updateEnergy) {
          ROOM.Events.updateEnergy(onlineCount);
        }

        // Notify leaderboard and activity
        if (ROOM.Leaderboard && ROOM.Leaderboard.update) {
          ROOM.Leaderboard.update(self.participantsCache);
        }
        if (ROOM.Activity && ROOM.Activity.update) {
          ROOM.Activity.update(self.participantsCache);
        }
      });

    // Listen to events (drives mini event animations)
    var now = firebase.firestore.Timestamp.now();
    var unsub2 = this.eventsRef
      .where('createdAt', '>', now)
      .orderBy('createdAt', 'asc')
      .onSnapshot(function (snapshot) {
        snapshot.docChanges().forEach(function (change) {
          if (change.type === 'added') {
            var eventData = change.doc.data();
            if (ROOM.Events && ROOM.Events.handleEvent) {
              ROOM.Events.handleEvent(eventData);
            }
          }
        });
      });

    // Listen to room document for most-played changes
    var unsub3 = this.roomRef.onSnapshot(function (doc) {
      var data = doc.data();
      if (data && data.currentMostPlayed) {
        ROOM.Atmosphere && ROOM.Atmosphere.updateMostPlayed &&
          ROOM.Atmosphere.updateMostPlayed(data.currentMostPlayed);
      }
    });

    // Listen to chat messages (Firebase fallback)
    var chatNow = firebase.firestore.Timestamp.now();
    var unsub4 = this.messagesRef
      .where('createdAt', '>', chatNow)
      .orderBy('createdAt', 'asc')
      .limit(50)
      .onSnapshot(function (snapshot) {
        snapshot.docChanges().forEach(function (change) {
          if (change.type === 'added') {
            var msgData = change.doc.data();
            // Skip own messages (already displayed locally)
            if (msgData.userId !== ROOM.currentUser.phoneNumber) {
              if (ROOM.Chat && ROOM.Chat.displayMessage) {
                ROOM.Chat.displayMessage(msgData);
              }
            }
          }
        });
      });

    this.unsubscribers.push(unsub1, unsub2, unsub3, unsub4);
  },

  getParticipants: function () {
    return this.participantsCache;
  },

  joinRoom: function (userData) {
    var self = this;
    var colors = [
      'linear-gradient(135deg, #f7a6b9, #e8758a)',
      'linear-gradient(135deg, #25D366, #1da851)',
      'linear-gradient(135deg, #FA5BFF, #c44fd4)',
      'linear-gradient(135deg, #ffc107, #e0a800)',
      'linear-gradient(135deg, #64B5F6, #1976D2)',
      'linear-gradient(135deg, #FF7043, #D84315)',
      'linear-gradient(135deg, #AB47BC, #7B1FA2)',
      'linear-gradient(135deg, #26A69A, #00897B)'
    ];
    var randomColor = colors[Math.floor(Math.random() * colors.length)];

    return this.participantsRef.doc(userData.phoneNumber).set({
      username: userData.username,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      isOnline: true,
      lastfmUsername: userData.lastfmUsername || null,
      totalMinutes: 0,
      currentRank: 0,
      previousRank: 0,
      milestones: [],
      currentTrack: null,
      avatarColor: randomColor,
      streakMinutes: 0
    }, { merge: true }).then(function () {
      // Fire join event
      return self.eventsRef.add({
        type: 'join',
        data: { username: userData.username },
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
  },

  leaveRoom: function (phoneNumber) {
    return this.participantsRef.doc(phoneNumber).update({
      isOnline: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      streakMinutes: 0
    });
  },

  heartbeat: function (phoneNumber) {
    return this.participantsRef.doc(phoneNumber).update({
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  updateParticipantTrack: function (phoneNumber, trackData) {
    return this.participantsRef.doc(phoneNumber).update({
      currentTrack: trackData
    });
  },

  updateParticipantMinutes: function (phoneNumber, totalMinutes) {
    return this.participantsRef.doc(phoneNumber).update({
      totalMinutes: totalMinutes
    });
  },

  updateLastfmUsername: function (phoneNumber, lastfmUsername) {
    // Update in room participants
    this.participantsRef.doc(phoneNumber).update({
      lastfmUsername: lastfmUsername
    });
    // Also update in users collection for persistence
    return db.collection('users').doc(phoneNumber).update({
      lastfmUsername: lastfmUsername
    });
  },

  fireEvent: function (type, data) {
    return this.eventsRef.add({
      type: type,
      data: data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  updateMostPlayed: function (trackData) {
    return this.roomRef.update({
      currentMostPlayed: trackData
    });
  },

  addMilestone: function (phoneNumber, milestone) {
    return this.participantsRef.doc(phoneNumber).update({
      milestones: firebase.firestore.FieldValue.arrayUnion(milestone)
    });
  },

  sendChatMessage: function (msgData) {
    // Firebase fallback for chat
    return this.messagesRef.add({
      type: msgData.type,
      userId: ROOM.currentUser.phoneNumber,
      username: msgData.username,
      text: msgData.text || null,
      emoji: msgData.emoji || null,
      emojiName: msgData.emojiName || null,
      color: msgData.color,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      timestamp: msgData.timestamp
    });
  },

  destroy: function () {
    this.unsubscribers.forEach(function (unsub) {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribers = [];
  }
};
