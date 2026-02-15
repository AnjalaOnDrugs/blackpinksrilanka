/**
 * Members Home Page Logic
 * Handles auth protection, user data, particles, floating icons, and song rotation
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
    document.getElementById('profileInitial').textContent =
      username.charAt(0).toUpperCase();
  } catch (err) {
    console.error('Error loading user data:', err);
    document.getElementById('greetingName').innerHTML =
      'BLINK<span class="mh-pink">.</span>';
    document.getElementById('profileInitial').textContent = 'B';
  }
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
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await logoutUser();
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Logout error:', err);
  }
});

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

// ========== SONG ROTATION (simulated) ==========
var songs = [
  { title: 'Pink Venom', artist: 'BLACKPINK' },
  { title: 'APT.', artist: 'Rosé ft. Bruno Mars' },
  { title: 'Shut Down', artist: 'BLACKPINK' },
  { title: 'How You Like That', artist: 'BLACKPINK' },
  { title: 'Lovesick Girls', artist: 'BLACKPINK' },
  { title: 'DDU-DU DDU-DU', artist: 'BLACKPINK' },
  { title: 'Kill This Love', artist: 'BLACKPINK' },
  { title: 'BOOMBAYAH', artist: 'BLACKPINK' },
  { title: 'SOLO', artist: 'JENNIE' },
  { title: 'LALISA', artist: 'LISA' },
  { title: 'On The Ground', artist: 'Rosé' },
  { title: 'number one girl', artist: 'Rosé' },
  { title: 'toxic till the end', artist: 'Rosé' }
];

var currentSong = 0;

function rotateSong() {
  currentSong = (currentSong + 1) % songs.length;
  var titleEl = document.getElementById('nowPlayingTitle');
  var artistEl = document.getElementById('nowPlayingArtist');
  // Fade out
  titleEl.style.opacity = '0';
  artistEl.style.opacity = '0';

  setTimeout(function () {
    titleEl.textContent = songs[currentSong].title;
    artistEl.textContent = songs[currentSong].artist;
    titleEl.style.opacity = '1';
    artistEl.style.opacity = '1';
  }, 400);
}

setInterval(rotateSong, 8000);
