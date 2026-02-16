/**
 * Room Atmosphere
 * Ambient particles and floating icons
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
  }
};
