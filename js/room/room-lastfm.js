/**
 * Room Last.fm Service
 * Polls Last.fm API for user streaming activity
 */

window.ROOM = window.ROOM || {};

ROOM.LastFM = {
  pollInterval: null,
  pollIndex: 0,
  apiKey: null,

  init: function () {
    this.apiKey = CONFIG.lastfmApiKey;
    if (!this.apiKey || this.apiKey === 'YOUR_LASTFM_API_KEY') {
      console.warn('Last.fm API key not configured.');
      return;
    }

    var self = this;
    // Poll only the current user's Last.fm data
    // Each client updates only its own participant document
    // Other users' data arrives via Firestore onSnapshot listeners
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
      var nowPlaying = track['@attr'] && track['@attr'].nowplaying === 'true';
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

    // Find current user's participant data from cache
    var participants = ROOM.Firebase.getParticipants();
    var currentParticipant = null;
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === phoneNumber) {
        currentParticipant = participants[i];
        break;
      }
    }

    this.getUserRecentTracks(ROOM.currentUser.lastfmUsername).then(function (trackData) {
      if (trackData) {
        // Only write to our own participant document
        ROOM.Firebase.updateParticipantTrack(phoneNumber, trackData);

        // Check if user was idle and just started streaming
        var prevTrack = currentParticipant ? currentParticipant.data.currentTrack : null;
        var wasIdle = !prevTrack || !prevTrack.nowPlaying;
        if (wasIdle && trackData.nowPlaying) {
          ROOM.Firebase.fireEvent('session_start', {
            username: ROOM.currentUser.username
          });
        }
      } else {
        // No track data means user stopped playing - clear their track
        ROOM.Firebase.updateParticipantTrack(phoneNumber, null);
      }
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

      var key = track.name + '|' + track.artist;
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
    var participants = ROOM.Firebase.getParticipants();
    var songMap = {};

    participants.forEach(function (p) {
      var track = p.data.currentTrack;
      if (!track || !track.nowPlaying) return;

      var key = track.name + '|' + track.artist;
      if (!songMap[key]) songMap[key] = [];
      songMap[key].push(p.data.username);
    });

    for (var key in songMap) {
      if (songMap[key].length >= 2) {
        var parts = key.split('|');
        ROOM.Firebase.fireEvent('same_song', {
          track: parts[0],
          artist: parts[1],
          usernames: songMap[key],
          count: songMap[key].length
        });
      }
    }
  },

  destroy: function () {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
};
