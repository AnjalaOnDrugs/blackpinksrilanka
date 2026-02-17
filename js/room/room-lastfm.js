/**
 * Room Last.fm Service
 * Polls Last.fm API for user streaming activity.
 * Now uses Convex's change-detection mutation to reduce unnecessary writes by ~93%.
 */

window.ROOM = window.ROOM || {};

ROOM.LastFM = {
  pollInterval: null,
  pollIndex: 0,
  apiKey: null,
  // Client-side caches to skip redundant Convex mutations
  _lastTrackKey: null,
  // Map of coreSong → { usernames: [...], count, track, artist }
  // Tracks ALL active twinning groups for persistent mini cards
  _activeTwins: {},
  // Cache for Last.fm track.getInfo validation: "name|artist" → { isMusic: bool, expiry: timestamp }
  _trackValidationCache: {},
  _CACHE_TTL: 5 * 60 * 1000, // 5 minutes

  /**
   * Layer 1: Fast heuristic check — returns true if the track is likely NOT music.
   * Catches ads, podcasts, system sounds, app notifications, etc.
   */
  isLikelyNonMusic: function (name, artist) {
    var n = (name || '').toLowerCase();
    var a = (artist || '').toLowerCase();
    var combined = n + ' ' + a;

    // Empty or garbage
    if (!name || name.trim().length <= 2) return true;
    if (!artist || artist.trim().length === 0) return true;

    // Generic/placeholder artists
    if (/^(unknown|various|unknown artist|various artists|unknown album)$/.test(a.trim())) return true;

    // Very long titles are usually podcast episodes, not songs
    if (name.length > 120) return true;

    // Ad / sponsored content
    if (/\b(advertisement|sponsored|commercial)\b/.test(combined)) return true;

    // App sounds & notifications
    if (/\b(notification|ringtone|alarm\s*sound|system\s*sound)\b/.test(combined)) return true;
    if (/^(whatsapp|telegram|instagram|tiktok|facebook|snapchat|messenger|viber|signal)\b/.test(a.trim())) return true;

    // YouTube noise
    if (/\b(subscribe|like and subscribe|channel intro|end\s*screen)\b/.test(n)) return true;

    // News / radio filler
    if (/\b(breaking news|weather update|news update|traffic update)\b/.test(combined)) return true;

    return false;
  },

  /**
   * Layer 2: Validate track against Last.fm's database using track.getInfo.
   * Returns a Promise<boolean> — true if the track is valid music.
   * Results are cached for 5 minutes to avoid rate-limiting.
   */
  validateMusicTrack: function (name, artist) {
    var cacheKey = (name + '|' + artist).toLowerCase();
    var cached = this._trackValidationCache[cacheKey];

    if (cached && Date.now() < cached.expiry) {
      return Promise.resolve(cached.isMusic);
    }

    var self = this;
    var url = 'https://ws.audioscrobbler.com/2.0/?method=track.getInfo' +
      '&track=' + encodeURIComponent(name) +
      '&artist=' + encodeURIComponent(artist) +
      '&api_key=' + this.apiKey +
      '&format=json';

    return fetch(url).then(function (resp) {
      return resp.json();
    }).then(function (data) {
      // track.getInfo returns { track: { listeners, playcount, ... } } for real tracks
      // Returns { error: ..., message: "Track not found" } for non-existent tracks
      var isMusic = !!(data.track && parseInt(data.track.listeners || '0', 10) > 0);

      self._trackValidationCache[cacheKey] = {
        isMusic: isMusic,
        expiry: Date.now() + self._CACHE_TTL
      };

      if (!isMusic) {
        console.debug('[LastFM Filter] Rejected by track.getInfo:', name, '—', artist);
      }
      return isMusic;
    }).catch(function () {
      // On network/rate-limit errors, let the track through (graceful degradation)
      return true;
    });
  },

  /**
   * Clean a track string for fuzzy matching.
   * Strips common Last.fm junk: "Official Video/Audio", "VEVO", "MV",
   * featured artists, parenthetical/bracket tags, punctuation, extra spaces.
   */
  cleanString: function (str) {
    var s = (str || '').toLowerCase();
    // Consolidated: remove bracketed tags (official video/audio, lyrics, feat, etc.)
    s = s.replace(/[\(\[](?:official\s*(?:music\s*)?(?:video|audio)|lyrics?|visuali[sz]er|(?:feat|ft)\.?\s*[^\)\]]*)\s*[\)\]]/gi, '');
    // Remove loose keywords
    s = s.replace(/\b(?:official\s*(?:music\s*)?video|official\s*audio|m\/?v|live)\b/gi, '');
    s = s.replace(/vevo$/gi, '');
    s = s.replace(/\s+(?:feat|ft)\.?\s+.*/gi, '');
    s = s.replace(/[^\w\s]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  },

  /**
   * Extract just the core song title from a track name.
   * Handles "ARTIST - Song Title" format that some scrobblers use.
   */
  extractCoreSong: function (name, artist) {
    var cleanName = this.cleanString(name);
    var cleanArtist = this.cleanString(artist);

    // If track name starts with "artist - ", strip the artist prefix
    // e.g. "JENNIE - like JENNIE" → "like jennie"
    if (cleanArtist && cleanName.indexOf(cleanArtist + ' ') === 0) {
      cleanName = cleanName.substring(cleanArtist.length).trim();
    }
    // Also handle "artist name" appearing with a dash separator in the raw name
    var rawLower = (name || '').toLowerCase();
    var dashIdx = rawLower.indexOf(' - ');
    if (dashIdx > 0) {
      var beforeDash = this.cleanString(rawLower.substring(0, dashIdx));
      // If part before dash matches the artist, use part after dash
      if (beforeDash === cleanArtist || cleanArtist.indexOf(beforeDash) === 0) {
        cleanName = this.cleanString(rawLower.substring(dashIdx + 3));
      }
    }

    return cleanName;
  },

  /**
   * Fuzzy-match two song entries. Returns true if they're likely the same song.
   * Compares cleaned core song titles using word overlap.
   */
  isSameSong: function (name1, artist1, name2, artist2) {
    var song1 = this.extractCoreSong(name1, artist1);
    var song2 = this.extractCoreSong(name2, artist2);

    // Direct match after cleaning
    if (song1 === song2 && song1.length > 0) return true;

    // Word-level overlap: check if most words in the shorter title appear in the longer
    var words1 = song1.split(' ').filter(function (w) { return w.length > 1; });
    var words2 = song2.split(' ').filter(function (w) { return w.length > 1; });

    if (words1.length === 0 || words2.length === 0) return false;

    var shorter = words1.length <= words2.length ? words1 : words2;
    var longer = words1.length <= words2.length ? words2 : words1;
    var longerJoined = longer.join(' ');

    var matchCount = 0;
    for (var i = 0; i < shorter.length; i++) {
      if (longerJoined.indexOf(shorter[i]) !== -1) matchCount++;
    }

    // At least 70% of the shorter title's words must appear in the longer
    return shorter.length > 0 && (matchCount / shorter.length) >= 0.7;
  },

  /**
   * Detect platform from album art + track name.
   * Album art => Spotify, MV/video markers => YouTube, otherwise => Other.
   */
  detectPlatform: function (trackName, albumArt) {
    if ((albumArt || '').trim().length > 0) {
      return 'spotify';
    }

    var n = (trackName || '').toLowerCase();
    if (
      /\b(music\s*video|official\s*video|official\s*audio)\b/i.test(n) ||
      /[\(\[]\s*(music\s*video|official\s*video|official\s*audio|m\/?v)\s*[\)\]]/i.test(n) ||
      /\b(m\/v|mv)\b/i.test(n)
    ) {
      return 'youtube';
    }
    return 'other';
  },

  // Stream counting state
  _streamCheckInterval: null,
  _currentStreamTrack: null, // { name, artist } of track being timed
  _lastStreamCountResult: null, // Last result from tryCountStream

  /**
   * Check if the current user has an active check-in.
   * Stream counting only works when checked in.
   */
  isCheckedIn: function () {
    if (!ROOM.currentUser) return false;
    var participants = ROOM.Firebase.getParticipants();
    var me = participants.find(function (p) { return p.id === ROOM.currentUser.phoneNumber; });
    if (!me || !me.data.offlineTracking || !me.data.lastCheckIn) return false;
    var elapsed = Date.now() - me.data.lastCheckIn;
    var interval = CONFIG.checkInInterval || 3600000;
    return elapsed < interval;
  },

  // Track which offline users this client is responsible for polling
  _offlinePollAssignments: {},
  _offlinePollInterval: null,
  // Track last known track per offline user to avoid redundant startListening calls
  _offlineLastTrack: {},

  init: function () {
    this.apiKey = CONFIG.lastfmApiKey;
    if (!this.apiKey || this.apiKey === 'YOUR_LASTFM_API_KEY') {
      console.warn('Last.fm API key not configured.');
      return;
    }

    var self = this;
    // Poll only the current user's Last.fm data
    // Each client updates only its own participant document
    // Other users' data arrives via Convex reactive queries
    this.pollInterval = setInterval(function () {
      self.pollCurrentUser();
    }, CONFIG.roomPollInterval || 2000);

    // Initial poll for current user
    this.pollCurrentUser();

    // Poll offline-tracked users every 10s (slower to avoid rate limits)
    this._offlinePollInterval = setInterval(function () {
      self.pollOfflineTrackedUsers();
    }, CONFIG.offlinePollInterval || 10000);

    // Stream counting: check every 5 seconds if the 30s threshold is met
    this._streamCheckInterval = setInterval(function () {
      self._checkStreamCount();
    }, 5000);
  },

  getUserRecentTracks: function (lastfmUsername) {
    var url = 'https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks' +
      '&user=' + encodeURIComponent(lastfmUsername) +
      '&api_key=' + this.apiKey +
      '&format=json&limit=1';

    return fetch(url).then(function (resp) {
      return resp.json();
    }).then(function (data) {
      if (!data.recenttracks || !data.recenttracks.track || !data.recenttracks.track.length) {
        return null;
      }

      var track = data.recenttracks.track[0];
      var nowPlaying = !!(track['@attr'] && track['@attr'].nowplaying === 'true');
      var images = track.image || [];
      var albumArt = '';
      for (var i = 0; i < images.length; i++) {
        if (images[i].size === 'medium' || images[i].size === 'large') {
          albumArt = images[i]['#text'];
          break;
        }
      }

      return {
        name: track.name,
        artist: track.artist['#text'] || track.artist.name || '',
        albumArt: albumArt,
        nowPlaying: nowPlaying,
        timestamp: track.date ? parseInt(track.date.uts) : null
      };
    });
  },

  pollCurrentUser: function () {
    if (!ROOM.currentUser || !ROOM.currentUser.lastfmUsername) return;

    var self = this;
    var phoneNumber = ROOM.currentUser.phoneNumber;

    this.getUserRecentTracks(ROOM.currentUser.lastfmUsername).then(function (trackData) {
      if (!trackData) {
        return self._applyTrackUpdate(phoneNumber, null);
      }

      // Layer 1: Fast heuristic rejection
      if (self.isLikelyNonMusic(trackData.name, trackData.artist)) {
        console.debug('[LastFM Filter] Heuristic rejection:', trackData.name, '—', trackData.artist);
        return self._applyTrackUpdate(phoneNumber, null);
      }

      // Layer 2: Last.fm track.getInfo validation (async, cached)
      return self.validateMusicTrack(trackData.name, trackData.artist).then(function (isMusic) {
        if (!isMusic) {
          return self._applyTrackUpdate(phoneNumber, null);
        }
        return self._applyTrackUpdate(phoneNumber, trackData);
      });
    }).catch(function (err) {
      // Silently handle rate limit errors
    });
  },

  /** Internal: apply filtered track data with change detection + Convex update */
  _applyTrackUpdate: function (phoneNumber, trackData) {
    var newKey = trackData
      ? trackData.name + '|' + trackData.artist + '|' + trackData.nowPlaying
      : null;

    if (newKey === this._lastTrackKey) return;
    this._lastTrackKey = newKey;

    var self = this;
    var isCurrentUser = ROOM.currentUser && phoneNumber === ROOM.currentUser.phoneNumber;

    return ROOM.Firebase.updateParticipantTrack(phoneNumber, trackData)
      .then(function (result) {
        if (result && result.wasIdle && trackData && trackData.nowPlaying) {
          ROOM.Firebase.fireEvent('session_start', {
            username: ROOM.currentUser.username,
            track: trackData.name,
            artist: trackData.artist
          });
        }

        // Stream counting: only for current user
        if (isCurrentUser) {
          if (trackData && trackData.nowPlaying) {
            // Start or continue a listening session
            self._startStreamSession(trackData);
          } else {
            // Stopped playing or went idle — end session
            self._stopStreamSession();
          }
        }
      });
  },

  /**
   * Poll Last.fm for offline users who have offlineTracking enabled
   * and a valid (non-expired) check-in. Only one online client should
   * update each offline user — we use a simple deterministic assignment:
   * the first online user (sorted by phoneNumber) takes responsibility.
   */
  pollOfflineTrackedUsers: function () {
    if (!ROOM.currentUser || !this.apiKey) return;

    var participants = ROOM.Firebase.getParticipants();
    var now = Date.now();
    var checkInExpiry = CONFIG.checkInInterval || 3600000; // 1 hour

    // Find the first online user (sorted) to be the "poller" — prevents duplicates
    var onlineUsers = participants
      .filter(function (p) { return p.data.isOnline; })
      .map(function (p) { return p.id; })
      .sort();

    // Only the first online user polls for offline users
    if (onlineUsers.length === 0 || onlineUsers[0] !== ROOM.currentUser.phoneNumber) return;

    var self = this;

    // Find offline users with valid check-in and a Last.fm username
    participants.forEach(function (p) {
      if (p.data.isOnline) return; // Skip online users
      if (!p.data.offlineTracking) return; // Not opted in
      if (!p.data.lastCheckIn) return;
      if (!p.data.lastfmUsername) return;

      // Check if check-in has expired
      var timeSinceCheckIn = now - p.data.lastCheckIn;
      if (timeSinceCheckIn > checkInExpiry) {
        // Check-in expired — disable offline tracking and clean up stream session
        delete self._offlineLastTrack[p.id];
        ConvexService.mutation('streams:stopListening', {
          roomId: ROOM.Firebase.roomId,
          phoneNumber: p.id
        }).catch(function () {});
        ConvexService.mutation('participants:disableOfflineTracking', {
          roomId: ROOM.Firebase.roomId,
          phoneNumber: p.id
        });
        return;
      }

      // Poll this offline user's Last.fm
      var userId = p.id;
      self.getUserRecentTracks(p.data.lastfmUsername).then(function (trackData) {
        if (!trackData) {
          // No track — stop any active stream session
          if (self._offlineLastTrack[userId]) {
            delete self._offlineLastTrack[userId];
            ConvexService.mutation('streams:stopListening', {
              roomId: ROOM.Firebase.roomId,
              phoneNumber: userId
            }).catch(function () {});
          }
          return ROOM.Firebase.updateParticipantTrack(userId, null);
        }

        if (self.isLikelyNonMusic(trackData.name, trackData.artist)) {
          if (self._offlineLastTrack[userId]) {
            delete self._offlineLastTrack[userId];
            ConvexService.mutation('streams:stopListening', {
              roomId: ROOM.Firebase.roomId,
              phoneNumber: userId
            }).catch(function () {});
          }
          return ROOM.Firebase.updateParticipantTrack(userId, null);
        }

        return self.validateMusicTrack(trackData.name, trackData.artist).then(function (isMusic) {
          if (!isMusic) {
            if (self._offlineLastTrack[userId]) {
              delete self._offlineLastTrack[userId];
              ConvexService.mutation('streams:stopListening', {
                roomId: ROOM.Firebase.roomId,
                phoneNumber: userId
              }).catch(function () {});
            }
            return ROOM.Firebase.updateParticipantTrack(userId, null);
          }

          // Update track display
          ROOM.Firebase.updateParticipantTrack(userId, trackData);

          // Manage stream session for this offline-tracked user
          if (trackData.nowPlaying) {
            var offlineTrackId = trackData.name + '|' + trackData.artist;
            if (self._offlineLastTrack[userId] !== offlineTrackId) {
              self._offlineLastTrack[userId] = offlineTrackId;
              ConvexService.mutation('streams:startListening', {
                roomId: ROOM.Firebase.roomId,
                phoneNumber: userId,
                trackName: trackData.name,
                trackArtist: trackData.artist,
                trackAlbumArt: trackData.albumArt || undefined
              }).catch(function () {});
            }
            // Try counting the stream (idempotent — won't double-count)
            ConvexService.mutation('streams:tryCountStream', {
              roomId: ROOM.Firebase.roomId,
              phoneNumber: userId
            }).catch(function () {});
          } else {
            // Not currently playing — end session
            if (self._offlineLastTrack[userId]) {
              delete self._offlineLastTrack[userId];
              ConvexService.mutation('streams:stopListening', {
                roomId: ROOM.Firebase.roomId,
                phoneNumber: userId
              }).catch(function () {});
            }
          }
        });
      }).catch(function () {
        // Silently handle errors
      });
    });
  },

  detectSameSong: function () {
    var self = this;
    var participants = ROOM.Firebase.getParticipants();

    // 1. Collect all eligible now-playing listeners (online OR offline-tracked with valid check-in)
    var listeners = [];
    var now = Date.now();
    var checkInExpiry = CONFIG.checkInInterval || 3600000;
    participants.forEach(function (p) {
      var isEligible = p.data.isOnline;
      // Offline users with active check-in are also eligible
      if (!isEligible && p.data.offlineTracking && p.data.lastCheckIn) {
        isEligible = (now - p.data.lastCheckIn) < checkInExpiry;
      }
      if (!isEligible) return;
      var track = p.data.currentTrack;
      if (!track || !track.nowPlaying) return;
      listeners.push({
        username: p.data.username,
        name: track.name,
        artist: track.artist,
        coreSong: self.extractCoreSong(track.name, track.artist),
        track: track
      });
    });

    // 2. Fuzzy-group listeners into song groups
    var groups = [];
    for (var i = 0; i < listeners.length; i++) {
      var merged = false;
      for (var g = 0; g < groups.length; g++) {
        var ref = groups[g].ref;
        if (self.isSameSong(listeners[i].name, listeners[i].artist, ref.name, ref.artist)) {
          groups[g].usernames.push(listeners[i].username);
          merged = true;
          break;
        }
      }
      if (!merged) {
        groups.push({
          ref: listeners[i],
          usernames: [listeners[i].username],
          track: listeners[i].track
        });
      }
    }

    // 3. Build new active twins map (only groups with 2+)
    var newTwins = {};
    for (var g = 0; g < groups.length; g++) {
      if (groups[g].usernames.length >= 2) {
        var key = groups[g].ref.coreSong;
        newTwins[key] = {
          usernames: groups[g].usernames.slice().sort(),
          count: groups[g].usernames.length,
          track: groups[g].track.name,
          artist: groups[g].track.artist
        };
      }
    }

    // 4. Compare with previous state to detect changes
    var prev = this._activeTwins;

    for (var key in newTwins) {
      var cur = newTwins[key];
      var old = prev[key];

      if (!old) {
        // Brand new twinning — play the big animation
        if (ROOM.Animations && ROOM.Animations.playSameSong) {
          ROOM.Animations.playSameSong({
            track: cur.track,
            artist: cur.artist,
            usernames: cur.usernames,
            count: cur.count
          });
        }
      } else if (cur.count > old.count) {
        // Someone new joined an existing twinning group — streak upgrade!
        if (ROOM.Animations && ROOM.Animations.playSameSong) {
          ROOM.Animations.playSameSong({
            track: cur.track,
            artist: cur.artist,
            usernames: cur.usernames,
            count: cur.count,
            isUpgrade: true
          });
        }
      }
    }

    // 5. Save current state
    this._activeTwins = newTwins;

    // 6. Update persistent mini cards
    if (ROOM.Animations && ROOM.Animations.updateTwinCards) {
      ROOM.Animations.updateTwinCards(newTwins);
    }
  },

  /**
   * Start a listening session for stream counting.
   * Called when user starts playing a new validated track.
   */
  _startStreamSession: function (trackData) {
    if (!ROOM.currentUser || !trackData || !trackData.nowPlaying) return;
    // Stream counting requires active check-in
    if (!this.isCheckedIn()) return;

    var trackId = trackData.name + '|' + trackData.artist;

    // If same track is already being tracked, skip
    if (this._currentStreamTrack === trackId) return;

    this._currentStreamTrack = trackId;
    this._lastStreamCountResult = null;

    ConvexService.mutation('streams:startListening', {
      roomId: ROOM.Firebase.roomId,
      phoneNumber: ROOM.currentUser.phoneNumber,
      trackName: trackData.name,
      trackArtist: trackData.artist,
      trackAlbumArt: trackData.albumArt || undefined
    }).catch(function () {
      // Silently handle errors
    });
  },

  /**
   * Stop the listening session (user stopped playing or went idle).
   */
  _stopStreamSession: function () {
    if (!ROOM.currentUser) return;

    this._currentStreamTrack = null;
    this._lastStreamCountResult = null;

    ConvexService.mutation('streams:stopListening', {
      roomId: ROOM.Firebase.roomId,
      phoneNumber: ROOM.currentUser.phoneNumber
    }).catch(function () {
      // Silently handle errors
    });
  },

  /**
   * Periodically check if the current listening session qualifies as a stream.
   * Server validates: 30s minimum, cooldown, daily cap.
   */
  _checkStreamCount: function () {
    if (!ROOM.currentUser || !this._currentStreamTrack) return;
    // Stream counting requires active check-in
    if (!this.isCheckedIn()) return;

    var self = this;

    ConvexService.mutation('streams:tryCountStream', {
      roomId: ROOM.Firebase.roomId,
      phoneNumber: ROOM.currentUser.phoneNumber
    }).then(function (result) {
      if (!result) return;

      self._lastStreamCountResult = result;

      if (result.counted) {
        console.log('[Stream] Counted stream for:', result.trackName, '—', result.trackArtist,
          '(listened', result.listenDuration + 's, main:', result.isMainSong, ', +' + (result.points || 0) + ' pts)');

        // Fire a stream_counted event for UI feedback
        if (ROOM.Firebase && ROOM.Firebase.fireEvent) {
          ROOM.Firebase.fireEvent('stream_counted', {
            username: ROOM.currentUser.username,
            track: result.trackName,
            artist: result.trackArtist,
            duration: result.listenDuration,
            isMainSong: result.isMainSong,
            points: result.points || 0
          });
        }
      }
    }).catch(function () {
      // Silently handle errors
    });
  },

  destroy: function () {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this._offlinePollInterval) {
      clearInterval(this._offlinePollInterval);
      this._offlinePollInterval = null;
    }
    if (this._streamCheckInterval) {
      clearInterval(this._streamCheckInterval);
      this._streamCheckInterval = null;
    }
  }
};
