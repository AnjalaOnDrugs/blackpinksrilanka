// config.js - Public configuration (safe to commit)
// Non-sensitive configuration values

const CONFIG = {
  // Main event song — the primary song that earns bonus points and tracks room milestones.
  // Change this to switch the featured song across the entire app.
  mainSong: { name: "GO", artist: "BLACKPINK" },

  // WhatsApp API endpoint
  whatsappApiUrl: "https://api.wawp.net/send-text",

  // Google Apps Script Web App URL
  // TODO: Update this after deploying the Google Apps Script
  googleSheetsUrl: "https://script.google.com/macros/s/AKfycbxgDmwP423ZUe42lavvOMOBthAgzQHXh0QFjXbQ6t8Q-CFPkvetxeb6K1Uxg5TDqvgr/exec",

  // Google Sheet ID for member verification
  sheetId: "1cgEmVF7eizgMnjYxZUS_5QbLB6bWg2mXEfOfIA9fHnY",

  // OTP settings
  otpDisplayTime: 600000,  // 10 minutes in milliseconds (when to show "Generate another code?" button)
  otpRateLimit: 120000,    // 2 minutes in milliseconds (cooldown between OTP requests)
  otpMaxAttempts: 3,       // Maximum failed OTP verification attempts

  // Phone number settings
  countryCode: "94",        // Sri Lanka country code

  // Agora RTM (Chat)
  agoraAppId: "cd95c07eac04413aa4b458bdab65136d",
  agoraTokenServerUrl: "/api/agora-token",

  // Last.fm API
  lastfmApiKey: "04d8f2a4df95b60f32595119d2b8fec5",

  // Convex Backend
  // TODO: Replace with your actual Convex deployment URL after running `npx convex dev`
  convexUrl: "https://lovely-heron-474.convex.cloud",

  // Room settings
  roomPollInterval: 2000,     // Last.fm polling interval per user (ms)
  // heartbeatInterval removed — presence now handled by Firebase RTDB onDisconnect()
  chatBubbleLifetime: 8000,   // How long chat bubbles stay visible (ms)
  maxChatBubbles: 30,         // Max simultaneous bubbles on screen

  // Offline tracking / check-in
  checkInInterval: 3600000,   // 1 hour — how long a check-in lasts (ms)
  offlinePollInterval: 10000, // 10s — how often online clients poll offline users' Last.fm

  // Listen Along event settings
  listenAlongCheckInterval: 60000,    // Check every 60s if we should trigger
  listenAlongCooldown: 3600000,       // 1 hour between events
  listenAlongDuration: 180000,        // 3 minute event duration
  listenAlongTriggerChance: 1,     // 15% chance per check once cooldown elapsed
  listenAlongJoinCheckInterval: 5000, // Check every 5s if current user is playing

  // Listen Along song catalog (random pick per event)
  listenAlongSongs: [
    { name: "GO", artist: "BLACKPINK" },
    { name: "DDU-DU DDU-DU", artist: "BLACKPINK" },
    { name: "Kill This Love", artist: "BLACKPINK" },
    { name: "How You Like That", artist: "BLACKPINK" },
    { name: "Lovesick Girls", artist: "BLACKPINK" },
    { name: "Pink Venom", artist: "BLACKPINK" },
    { name: "Shut Down", artist: "BLACKPINK" },
    { name: "Boombayah", artist: "BLACKPINK" },
    { name: "As If It's Your Last", artist: "BLACKPINK" },
    { name: "Playing With Fire", artist: "BLACKPINK" },
    { name: "Whistle", artist: "BLACKPINK" },
    { name: "Ice Cream", artist: "BLACKPINK" },
    { name: "SOLO", artist: "Jennie" },
    { name: "MONEY", artist: "Lisa" },
    { name: "LALISA", artist: "Lisa" },
    { name: "Flower", artist: "Jisoo" },
    { name: "On The Ground", artist: "Rosé" },
    { name: "APT.", artist: "Rosé" },
    { name: "number one girl", artist: "Rosé" },
  ],

  // Fill the Map event settings
  fillMapCheckInterval: 60000,       // Check every 60s if we should trigger
  fillMapCooldown: 3600000,          // 1 hour between events
  fillMapDuration: 180000,           // 3 minute event duration
  fillMapTriggerChance: 0.15,        // 15% chance per check once cooldown elapsed
  fillMapJoinCheckInterval: 5000,    // Check every 5s if current user is playing the song

  // Run the Playlist event settings (personal event)
  runPlaylistCheckInterval: 60000,         // Check every 60s if we should trigger
  runPlaylistCooldown: 3600000,            // 1 hour between events per user
  runPlaylistTriggerChance: 0.15,          // 15% chance per check once cooldown elapsed
  runPlaylistSongCheckInterval: 3000,      // Check every 3s if user is playing the correct song
  runPlaylistProgressSaveInterval: 5000,   // Save listen progress to server every 5s

  // Red Green event settings (personal event)
  redGreenCheckInterval: 60000,             // Check every 60s if we should trigger
  redGreenCooldown: 3600000,                // 1 hour between events per user
  redGreenTriggerChance: 0.15,              // 15% chance per check once cooldown elapsed
  redGreenSongCheckInterval: 3000,          // Check every 3s if user is playing on correct platform
  redGreenProgressSaveInterval: 5000,       // Save listen progress to server every 5s

  // Klipy GIF API
  klipyApiKey: 'dYu1PSt79FOOy7cv4JgoyK3Styf5zzAlHHWHNJOKwL2voxQ2c9rHoPaMgua1snFv',

  // Vroom race event settings
  vroomCheckInterval: 60000,           // Check every 60s if we should trigger
  vroomCooldown: 3600000,              // 1 hour between events
  vroomTriggerChance: 0.15,            // 15% chance per check once cooldown elapsed
  vroomJoinCheckInterval: 5000,        // Check every 5s for auto-join detection

  // Solo songs per member (for vroom race)
  vroomSoloSongs: {
    jennie: [
      { name: "SOLO", artist: "Jennie" },
      { name: "One Of The Girls", artist: "The Weeknd, Jennie, Lily Rose Depp" },
      { name: "You & Me", artist: "Jennie" },
      { name: "Slow Motion", artist: "Matt Champion & Jennie" },
      { name: "SPOT!", artist: "Zico feat. Jennie" },
      { name: "Mantra", artist: "Jennie" },
      { name: "ZEN", artist: "Jennie" },
      { name: "Love Hangover", artist: "Jennie feat. Dominic Fike" },
      { name: "ExtraL", artist: "Jennie feat. Doechii" },
      { name: "Intro: JANE", artist: "Jennie with FKJ" },
      { name: "like JENNIE", artist: "Jennie" },
      { name: "start a war", artist: "Jennie" },
      { name: "Handlebars", artist: "Jennie feat. Dua Lipa" },
      { name: "with the IE (way up)", artist: "Jennie" },
      { name: "Damn Right", artist: "Jennie feat. Childish Gambino & Kali Uchis" },
      { name: "F.T.S.", artist: "Jennie" },
      { name: "Filter", artist: "Jennie" },
      { name: "Seoul City", artist: "Jennie" },
      { name: "Starlight", artist: "Jennie" },
      { name: "twin", artist: "Jennie" },
      { name: "Like JENNIE (Peggy Gou Remix)", artist: "Jennie" }
    ],
    lisa: [
      { name: "LALISA", artist: "Lisa" },
      { name: "MONEY", artist: "Lisa" },
      { name: "SG", artist: "DJ Snake, Ozuna, Megan Thee Stallion & Lisa" },
      { name: "Rockstar", artist: "Lisa" },
      { name: "New Woman", artist: "Lisa feat. Rosalía" },
      { name: "Moonlit Floor (Kiss Me)", artist: "Lisa" },
      { name: "BORN AGAIN", artist: "Lisa feat. Doja Cat & RAYE" },
      { name: "Elastigirl", artist: "Lisa" },
      { name: "Thunder", artist: "Lisa" },
      { name: "FXCK UP THE WORLD", artist: "Lisa feat. Future" },
      { name: "Rapunzel", artist: "Lisa feat. Megan Thee Stallion" },
      { name: "When I’m With You", artist: "Lisa feat. Tyla" },
      { name: "BADGRRRL", artist: "Lisa" },
      { name: "Lifestyle", artist: "Lisa" },
      { name: "Chill", artist: "Lisa" },
      { name: "Dream", artist: "Lisa" },
      { name: "Priceless", artist: "Maroon 5 feat. Lisa" },
      { name: "Messy", artist: "Lisa" },
      { name: "On My Mind", artist: "Lisa with Alex Warren" }
    ],
    jisoo: [
      { name: "Flower", artist: "Jisoo" },
      { name: "All Eyes On Me", artist: "Jisoo" },
      { name: "earthquake", artist: "Jisoo" },
      { name: "Your Love", artist: "Jisoo" },
      { name: "TEARS", artist: "Jisoo" },
      { name: "Hugs & Kisses", artist: "Jisoo" },
      { name: "Earthquake (Sam Feldt Remix)", artist: "Jisoo" },
      { name: "Eyes Closed", artist: "Zayn & Jisoo" }
    ],
    rose: [
      { name: "On The Ground", artist: "Rosé" },
      { name: "Gone", artist: "Rosé" },
      { name: "Hard To Love", artist: "Rosé" },
      { name: "APT.", artist: "Rosé & Bruno Mars" },
      { name: "number one girl", artist: "Rosé" },
      { name: "3am", artist: "Rosé" },
      { name: "two years", artist: "Rosé" },
      { name: "toxic till the end", artist: "Rosé" },
      { name: "drinks or coffee", artist: "Rosé" },
      { name: "gameboy", artist: "Rosé" },
      { name: "stay a little longer", artist: "Rosé" },
      { name: "not the same", artist: "Rosé" },
      { name: "too bad for us", artist: "Rosé" },
      { name: "call it the end", artist: "Rosé" },
      { name: "dance all night", artist: "Rosé" },
      { name: "vampirehollie", artist: "Rosé" }
    ],
  },

  // Member display info
  vroomMembers: ['jisoo', 'jennie', 'rose', 'lisa'],
  vroomMemberLabels: {
    jisoo: 'Jisoo',
    jennie: 'Jennie',
    rose: 'Rosé',
    lisa: 'Lisa',
  },
  vroomMemberColors: {
    jisoo: '#ef4444',
    jennie: '#fbbf24',
    rose: '#60a5fa',
    lisa: '#a78bfa',
  },
};
