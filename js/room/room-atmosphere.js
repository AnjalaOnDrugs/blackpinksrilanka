/**
 * Room Atmosphere
 * Ambient particles, dynamic album-art background, floating icons
 */

window.ROOM = window.ROOM || {};

ROOM.Atmosphere = {
  init: function () {
    this.createParticles();
  },

  createParticles: function () {
    var container = document.getElementById('roomParticles');
    if (!container) return;

    var colors = ['#f7a6b9', '#25D366', '#FA5BFF', '#fcd5de', '#ffc107'];

    for (var i = 0; i < 35; i++) {
      var p = document.createElement('div');
      p.className = 'room-particle';
      var size = Math.random() * 4 + 2;
      var color = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.background = color;
      p.style.left = Math.random() * 100 + '%';
      p.style.setProperty('--p-speed', (Math.random() * 10 + 6) + 's');
      p.style.setProperty('--p-delay', (Math.random() * 12) + 's');
      p.style.setProperty('--p-opacity', (Math.random() * 0.35 + 0.1).toString());
      container.appendChild(p);
    }
  },

  updateMostPlayed: function (trackData) {
    if (!trackData) return;

    // Update the now-playing display
    var titleEl = document.getElementById('roomSongTitle');
    var artistEl = document.getElementById('roomSongArtist');

    if (titleEl && trackData.track) {
      titleEl.style.opacity = '0';
      artistEl.style.opacity = '0';

      setTimeout(function () {
        titleEl.textContent = trackData.track;
        artistEl.textContent = trackData.artist || '-';
        titleEl.style.opacity = '1';
        artistEl.style.opacity = '1';
      }, 400);
    }

    // Update dynamic background with album art
    if (trackData.albumArt) {
      this.crossfadeBackground(trackData.albumArt);
    }
  },

  crossfadeBackground: function (imageUrl) {
    var bgContainer = document.getElementById('dynamicBg');
    if (!bgContainer) return;

    var newBg = document.createElement('div');
    newBg.className = 'room-bg-dynamic-image room-bg-dynamic-image--entering';
    newBg.style.backgroundImage = 'url(' + imageUrl + ')';
    bgContainer.appendChild(newBg);

    // Trigger transition
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        newBg.classList.remove('room-bg-dynamic-image--entering');
      });
    });

    // Remove old backgrounds after transition
    setTimeout(function () {
      var images = bgContainer.querySelectorAll('.room-bg-dynamic-image');
      for (var i = 0; i < images.length - 1; i++) {
        images[i].remove();
      }
    }, 2500);
  }
};
