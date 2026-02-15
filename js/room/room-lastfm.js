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
  // Map of coreSong → { usernames: [...], count, track, artist }
  // Tracks ALL active twinning groups for persistent mini cards
  _activeTwins: {},

  /**
   * Clean a track string for fuzzy matching.
   * Strips common Last.fm junk: "Official Video/Audio", "VEVO", "MV",
   * featured artists, parenthetical/bracket tags, punctuation, extra spaces.
   */
  cleanString: function (str) {
    var s = (str || '').toLowerCase();
    // Remove common video/audio tags
    s = s.replace(/\(official\s*(music\s*)?video\)/gi, '');
    s = s.replace(/\(official\s*audio\)/gi, '');
    s = s.replace(/\(official\)/gi, '');
    s = s.replace(/\(lyrics?\)/gi, '');
    s = s.replace(/\(visuali[sz]er\)/gi, '');
    s = s.replace(/\[official\s*(music\s*)?video\]/gi, '');
    s = s.replace(/\[official\s*audio\]/gi, '');
    s = s.replace(/official\s*(music\s*)?video/gi, '');
    s = s.replace(/official\s*audio/gi, '');
    s = s.replace(/\bm\/?v\b/gi, '');
    s = s.replace(/\blive\b/gi, '');
    // Remove VEVO suffix from artist names
    s = s.replace(/vevo$/gi, '');
    // Remove feat/ft tags
    s = s.replace(/[\(\[]\s*(feat|ft)\.?\s*[^\)\]]*[\)\]]/gi, '');
    s = s.replace(/\s+(feat|ft)\.?\s+.*/gi, '');
    // Remove all punctuation and extra whitespace
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

  // Normalize song key — used by calculateMostPlayed
  normalizeSongKey: function (name, artist) {
    // Use core song extraction for consistent grouping
    return this.extractCoreSong(name, artist);
  },

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

    var phoneNumber = ROOM.currentUser.phoneNumber;

    this.getUserRecentTracks(ROOM.currentUser.lastfmUsername).then(function (trackData) {
      // updateParticipantTrack now routes to Convex mutation with change detection
      // The mutation only writes if the track actually changed (~93% reduction)
      ROOM.Firebase.updateParticipantTrack(phoneNumber, trackData || null)
        .then(function (result) {
          // If the mutation returns session_start info, fire the event
          if (result && result.wasIdle && trackData && trackData.nowPlaying) {
            ROOM.Firebase.fireEvent('session_start', {
              username: ROOM.currentUser.username,
              track: trackData.name,
              artist: trackData.artist
            });
          }
        });
    }).catch(function (err) {
      // Silently handle rate limit errors
    });
  },

  calculateMostPlayed: function () {
    var participants = ROOM.Firebase.getParticipants();
    var songCounts = {};
    var songData = {};

    participants.forEach(function (p) {
      var track = p.data.currentTrack;
      if (!track || !track.nowPlaying) return;

      var key = ROOM.LastFM.normalizeSongKey(track.name, track.artist);
      songCounts[key] = (songCounts[key] || 0) + 1;
      songData[key] = track;
    });

    var mostPlayed = null;
    var maxCount = 0;
    for (var key in songCounts) {
      if (songCounts[key] > maxCount) {
        maxCount = songCounts[key];
        mostPlayed = songData[key];
      }
    }

    if (mostPlayed) {
      ROOM.Firebase.updateMostPlayed({
        track: mostPlayed.name,
        artist: mostPlayed.artist,
        albumArt: mostPlayed.albumArt || ''
      });

      // Update the now playing display
      var titleEl = document.getElementById('roomSongTitle');
      var artistEl = document.getElementById('roomSongArtist');
      if (titleEl) titleEl.textContent = mostPlayed.name;
      if (artistEl) artistEl.textContent = mostPlayed.artist;
    }

    return { mostPlayed: mostPlayed, songCounts: songCounts };
  },

  detectSameSong: function () {
    var self = this;
    var participants = ROOM.Firebase.getParticipants();

    // 1. Collect all online, now-playing listeners
    var listeners = [];
    participants.forEach(function (p) {
      if (!p.data.isOnline) return;
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

  destroy: function () {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
};
