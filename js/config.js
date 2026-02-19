// config.js - Public configuration (safe to commit)
// Non-sensitive configuration values

const CONFIG = {
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
  heartbeatInterval: 30000,   // Presence heartbeat interval (ms)
  chatBubbleLifetime: 8000,   // How long chat bubbles stay visible (ms)
  maxChatBubbles: 30,         // Max simultaneous bubbles on screen

  // Offline tracking / check-in
  checkInInterval: 3600000,   // 1 hour — how long a check-in lasts (ms)
  offlinePollInterval: 10000, // 10s — how often online clients poll offline users' Last.fm

  // Listen Along event settings
  listenAlongCheckInterval: 60000,    // Check every 60s if we should trigger
  listenAlongCooldown: 3600000,       // 1 hour between events
  listenAlongDuration: 180000,        // 3 minute event duration
  listenAlongTriggerChance: 0.15,     // 15% chance per check once cooldown elapsed
  listenAlongJoinCheckInterval: 5000, // Check every 5s if current user is playing

  // Listen Along song catalog (random pick per event)
  listenAlongSongs: [
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

  // Klipy GIF API
  klipyApiKey: 'dYu1PSt79FOOy7cv4JgoyK3Styf5zzAlHHWHNJOKwL2voxQ2c9rHoPaMgua1snFv'
};
