/**
 * Members Home Page Logic
 * Handles auth protection, user data, particles, floating icons,
 * and REAL room data from Convex (participants, leaderboard, now-playing)
 */

// ========== AUTH PROTECTION ==========
checkAuthState().then(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Load user data
  try {
    const userData = await getCurrentUserData();
    const username = (userData && userData.username) ? userData.username : 'BLINK';
    document.getElementById('greetingName').innerHTML =
      username + '<span class="mh-pink">.</span>';

    // Show profile picture or initial in top bar
    var profileInitialEl = document.getElementById('profileInitial');
    var profileWrap = profileInitialEl ? profileInitialEl.parentElement : null;
    if (userData && userData.profilePicture && profileWrap) {
      profileInitialEl.style.display = 'none';
      var pfImg = document.createElement('img');
      pfImg.src = userData.profilePicture;
      pfImg.alt = '';
      pfImg.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
      profileWrap.appendChild(pfImg);
    } else if (profileInitialEl) {
      profileInitialEl.textContent = username.charAt(0).toUpperCase();
    }
  } catch (err) {
    console.error('Error loading user data:', err);
    document.getElementById('greetingName').innerHTML =
      'BLINK<span class="mh-pink">.</span>';
    document.getElementById('profileInitial').textContent = 'B';
  }

  // After auth, start loading real room data
  MembersRoom.init();
});

// ========== ROOM NAVIGATION ==========
var joinStreamBtn = document.getElementById('joinStreamBtn');
if (joinStreamBtn) {
  joinStreamBtn.addEventListener('click', function () {
    window.location.href = 'room.html?id=streaming';
  });
}

// Also make the featured room card clickable
var streamingRoom = document.getElementById('streamingRoom');
if (streamingRoom) {
  streamingRoom.addEventListener('click', function (e) {
    // Don't navigate if clicking the users button
    if (e.target.closest('.mh-room-users-btn')) return;
    window.location.href = 'room.html?id=streaming';
  });
}

// ========== LOGOUT ==========
var logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await logoutUser();
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Logout error:', err);
    }
  });
}

// ========== FLOATING PARTICLES (background) ==========
(function createParticles() {
  var container = document.getElementById('particles');
  if (!container) return;
  var colors = ['#f7a6b9', '#25D366', '#FA5BFF', '#fcd5de'];
  for (var i = 0; i < 20; i++) {
    var p = document.createElement('div');
    p.className = 'mh-particle';
    var size = Math.random() * 4 + 2;
    var color = colors[Math.floor(Math.random() * colors.length)];
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = color;
    p.style.left = Math.random() * 100 + '%';
    p.style.setProperty('--p-speed', (Math.random() * 10 + 6) + 's');
    p.style.setProperty('--p-delay', (Math.random() * 10) + 's');
    p.style.setProperty('--p-opacity', (Math.random() * 0.3 + 0.1).toString());
    container.appendChild(p);
  }
})();

// ========== FLOATING MUSIC ICONS (inside featured card) ==========
(function createFloatingIcons() {
  var container = document.getElementById('floatingIcons');
  if (!container) return;

  // SVG icon paths
  var icons = [
    // Music note
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    // Headphones
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
    // Disc
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>',
    // Music 2
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 4"/></svg>',
    // Radio
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/><circle cx="12" cy="12" r="2"/></svg>'
  ];

  for (var i = 0; i < 12; i++) {
    var el = document.createElement('div');
    el.className = 'mh-float-icon';
    el.innerHTML = icons[Math.floor(Math.random() * icons.length)];

    var size = Math.random() * 14 + 14; // 14-28px
    el.style.setProperty('--fi-size', size + 'px');
    el.style.setProperty('--fi-speed', (Math.random() * 6 + 4) + 's');
    el.style.setProperty('--fi-delay', (Math.random() * 8) + 's');
    el.style.setProperty('--fi-opacity', (Math.random() * 0.3 + 0.15).toString());
    el.style.left = Math.random() * 90 + 5 + '%';
    el.style.top = Math.random() * 80 + 10 + '%';

    container.appendChild(el);
  }
})();

// ========== REAL ROOM DATA FROM CONVEX ==========
var MembersRoom = {
  _roomId: 'streaming',
  _participants: [],
  _unsubs: [],
  _songRotationTimer: null,
  _nowPlayingTracks: [],
  _currentTrackIdx: 0,

  init: function () {
    var self = this;

    // 1. Watch participants in real time
    var unsub1 = ConvexService.watch(
      'participants:listByRoom',
      { roomId: this._roomId },
      function (participants) {
        if (!participants) return;
        self._participants = participants;
        self._renderAvatars();
        self._renderLeaderboard();
        self._buildNowPlayingList();
      }
    );
    this._unsubs.push(unsub1);

    // 2. Watch room document for currentMostPlayed
    var unsub2 = ConvexService.watch(
      'rooms:getRoom',
      { roomId: this._roomId },
      function (room) {
        if (!room) return;
        self._renderRoomStatus(room);
      }
    );
    this._unsubs.push(unsub2);
  },

  // ---- Render online user avatars ----
  _renderAvatars: function () {
    var container = document.getElementById('roomAvatars');
    var countEl = document.getElementById('roomOnlineCount');
    if (!container) return;
    container.innerHTML = '';

    var onlineUsers = [];
    var offlineUsers = [];

    for (var i = 0; i < this._participants.length; i++) {
      var p = this._participants[i];
      if (p.data.isOnline) {
        onlineUsers.push(p);
      } else {
        offlineUsers.push(p);
      }
    }

    // Show online first, then offline, max 5 avatars
    var toShow = onlineUsers.concat(offlineUsers);
    var maxAvatars = 5;
    var totalMembers = this._participants.length;
    var onlineCount = onlineUsers.length;

    for (var j = 0; j < toShow.length && j < maxAvatars; j++) {
      var user = toShow[j];
      var avatar = document.createElement('div');
      avatar.className = 'mh-room-avatar';
      if (user.data.isOnline) {
        avatar.classList.add('mh-room-avatar--online');
      }
      if (user.data.profilePicture) {
        avatar.style.background = 'transparent';
        avatar.style.overflow = 'hidden';
        avatar.innerHTML = '<img src="' + user.data.profilePicture + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">';
      } else {
        avatar.style.background = user.data.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
        var initial = (user.data.username || '?').charAt(0).toUpperCase();
        avatar.innerHTML = '<span>' + initial + '</span>';
      }
      container.appendChild(avatar);
    }

    // +N more badge
    if (totalMembers > maxAvatars) {
      var more = document.createElement('div');
      more.className = 'mh-room-avatar mh-room-avatar--more';
      more.textContent = '+' + (totalMembers - maxAvatars);
      container.appendChild(more);
    }

    // Update count text
    if (countEl) {
      if (onlineCount > 0) {
        countEl.innerHTML = '<strong>' + onlineCount + '</strong> streaming';
      } else if (totalMembers > 0) {
        countEl.innerHTML = '<strong>' + totalMembers + '</strong> member' + (totalMembers !== 1 ? 's' : '');
      } else {
        countEl.innerHTML = '';
      }
    }

    // Update status tag based on online users
    var tagEl = document.getElementById('roomStatusTag');
    var tagText = document.getElementById('roomStatusText');
    if (tagEl && tagText) {
      if (onlineCount > 0) {
        tagText.textContent = 'Live Now';
        tagEl.classList.remove('mh-room-tag--idle');
      } else {
        tagText.textContent = 'Room Open';
        tagEl.classList.add('mh-room-tag--idle');
      }
    }
  },

  // ---- Render top 3 leaderboard ----
  _renderLeaderboard: function () {
    var list = document.getElementById('roomLeadersList');
    if (!list) return;
    list.innerHTML = '';

    // Participants are already sorted by totalPoints desc from Convex
    var top3 = this._participants.slice(0, 3);
    var rankClasses = ['mh-leader--1st', 'mh-leader--2nd', 'mh-leader--3rd'];
    var badgeClasses = ['mh-leader-badge--gold', 'mh-leader-badge--silver', 'mh-leader-badge--bronze'];
    var rankLabelClasses = ['', 'mh-leader-rank--silver', 'mh-leader-rank--bronze'];

    if (top3.length === 0) {
      list.innerHTML = '<div class="mh-leader-empty">No streamers yet — be the first!</div>';
      return;
    }

    for (var i = 0; i < top3.length; i++) {
      var p = top3[i];
      var data = p.data;
      var rank = i + 1;
      var color = data.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)';
      var hasPic = !!data.profilePicture;

      // Format score: prefer totalPoints, fallback to totalMinutes
      var points = data.totalPoints || 0;
      var mins = data.totalMinutes || 0;
      var scoreText = '';
      if (points > 0) {
        scoreText = this._formatNumber(points) + ' pts &middot; ' + this._formatNumber(mins) + ' mins';
      } else {
        scoreText = this._formatNumber(mins) + ' mins streamed';
      }

      // Rank display: 1st gets star icon, 2nd and 3rd get number
      var rankHtml = '';
      if (rank === 1) {
        rankHtml = '<div class="mh-leader-rank">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">' +
          '<path d="M12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/>' +
          '</svg></div>';
      } else {
        rankHtml = '<div class="mh-leader-rank ' + rankLabelClasses[i] + '">' +
          '<span>' + rank + '</span></div>';
      }

      var avatarInnerHtml = hasPic
        ? '<img src="' + data.profilePicture + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">'
        : '<span>' + (data.username || '?').charAt(0).toUpperCase() + '</span>';
      var avatarStyle = hasPic ? 'background:transparent;overflow:hidden;' : 'background: ' + color + ';';

      var entry = document.createElement('div');
      entry.className = 'mh-leader ' + rankClasses[i];
      entry.innerHTML =
        rankHtml +
        '<div class="mh-leader-avatar" style="' + avatarStyle + '">' +
        avatarInnerHtml + '</div>' +
        '<div class="mh-leader-info">' +
        '<div class="mh-leader-name">' + this._esc(data.username || 'Unknown') + '</div>' +
        '<div class="mh-leader-score">' + scoreText + '</div></div>' +
        '<div class="mh-leader-badge ' + badgeClasses[i] + '">' +
        '<span>#' + rank + '</span></div>';

      list.appendChild(entry);
    }
  },

  // ---- Build now-playing track list from active participants ----
  _buildNowPlayingList: function () {
    var tracks = [];
    var seen = {};

    // Collect unique currently-playing tracks from participants
    for (var i = 0; i < this._participants.length; i++) {
      var p = this._participants[i];
      var track = p.data.currentTrack;
      if (track && track.nowPlaying && track.name) {
        var key = track.name + '|' + track.artist;
        if (!seen[key]) {
          seen[key] = true;
          tracks.push({ title: track.name, artist: track.artist, albumArt: track.albumArt || null });
        }
      }
    }

    // If no one is playing anything, use fallback list
    if (tracks.length === 0) {
      tracks = [
        { title: 'Pink Venom', artist: 'BLACKPINK', albumArt: null },
        { title: 'APT.', artist: 'Rosé ft. Bruno Mars', albumArt: null },
        { title: 'Shut Down', artist: 'BLACKPINK', albumArt: null },
        { title: 'How You Like That', artist: 'BLACKPINK', albumArt: null },
        { title: 'Lovesick Girls', artist: 'BLACKPINK', albumArt: null },
        { title: 'DDU-DU DDU-DU', artist: 'BLACKPINK', albumArt: null },
        { title: 'Kill This Love', artist: 'BLACKPINK', albumArt: null },
        { title: 'BOOMBAYAH', artist: 'BLACKPINK', albumArt: null },
        { title: 'SOLO', artist: 'JENNIE', albumArt: null },
        { title: 'LALISA', artist: 'LISA', albumArt: null },
        { title: 'On The Ground', artist: 'Rosé', albumArt: null },
        { title: 'number one girl', artist: 'Rosé', albumArt: null },
        { title: 'toxic till the end', artist: 'Rosé', albumArt: null }
      ];
    }

    this._nowPlayingTracks = tracks;

    // Show first track immediately
    this._showTrack(this._nowPlayingTracks[0]);

    // Start rotation if multiple tracks
    this._startTrackRotation();
  },

  _showTrack: function (track) {
    if (!track) return;
    var titleEl = document.getElementById('nowPlayingTitle');
    var artistEl = document.getElementById('nowPlayingArtist');
    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;

    // Update vinyl label with album art if available
    var vinylLabel = document.querySelector('.mh-vinyl-label-inner');
    if (vinylLabel) {
      if (track.albumArt) {
        vinylLabel.style.backgroundImage = 'url(' + track.albumArt + ')';
        vinylLabel.style.backgroundSize = 'cover';
        vinylLabel.style.backgroundPosition = 'center';
      } else {
        vinylLabel.style.backgroundImage = '';
      }
    }
  },

  _startTrackRotation: function () {
    var self = this;
    if (this._songRotationTimer) {
      clearInterval(this._songRotationTimer);
    }

    if (this._nowPlayingTracks.length <= 1) return;

    this._currentTrackIdx = 0;
    this._songRotationTimer = setInterval(function () {
      self._currentTrackIdx = (self._currentTrackIdx + 1) % self._nowPlayingTracks.length;
      var titleEl = document.getElementById('nowPlayingTitle');
      var artistEl = document.getElementById('nowPlayingArtist');
      if (!titleEl || !artistEl) return;

      // Fade out
      titleEl.style.opacity = '0';
      artistEl.style.opacity = '0';

      setTimeout(function () {
        self._showTrack(self._nowPlayingTracks[self._currentTrackIdx]);
        titleEl.style.opacity = '1';
        artistEl.style.opacity = '1';
      }, 400);
    }, 8000);
  },

  // ---- Render room status from room doc ----
  _renderRoomStatus: function (room) {
    // If room has a currentMostPlayed track, it shows as the "featured" track
    if (room.currentMostPlayed && room.currentMostPlayed.track) {
      var titleEl = document.getElementById('nowPlayingTitle');
      var artistEl = document.getElementById('nowPlayingArtist');
      if (titleEl && artistEl) {
        // Only override if no live participants are playing
        var hasLiveTracks = false;
        for (var i = 0; i < this._participants.length; i++) {
          var t = this._participants[i].data.currentTrack;
          if (t && t.nowPlaying) { hasLiveTracks = true; break; }
        }
        if (!hasLiveTracks) {
          titleEl.textContent = room.currentMostPlayed.track;
          artistEl.textContent = room.currentMostPlayed.artist || '';

          var vinylLabel = document.querySelector('.mh-vinyl-label-inner');
          if (vinylLabel && room.currentMostPlayed.albumArt) {
            vinylLabel.style.backgroundImage = 'url(' + room.currentMostPlayed.albumArt + ')';
            vinylLabel.style.backgroundSize = 'cover';
            vinylLabel.style.backgroundPosition = 'center';
          }
        }
      }
    }
  },

  // ---- Helpers ----
  _esc: function (str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _formatNumber: function (n) {
    if (n >= 1000) {
      return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return n.toLocaleString();
  },

  destroy: function () {
    for (var i = 0; i < this._unsubs.length; i++) {
      if (typeof this._unsubs[i] === 'function') this._unsubs[i]();
    }
    this._unsubs = [];
    if (this._songRotationTimer) clearInterval(this._songRotationTimer);
  }
};
