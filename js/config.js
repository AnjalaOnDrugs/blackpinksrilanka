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
  agoraTokenServerUrl: "https://script.google.com/macros/s/AKfycbyGEJ4zY85fgqem94NidctBQIXGlOTMDZqxdkZAlgn7afXexW-iVHmqDRMdiLEsT3nljg/exec", // TODO: Add your Google Apps Script Web App URL here after deployment

  // Last.fm API
  lastfmApiKey: "04d8f2a4df95b60f32595119d2b8fec5",

  // Room settings
  roomPollInterval: 2000,     // Last.fm polling interval per user (ms)
  heartbeatInterval: 30000,   // Firestore presence heartbeat (ms)
  chatBubbleLifetime: 8000,   // How long chat bubbles stay visible (ms)
  maxChatBubbles: 30          // Max simultaneous bubbles on screen
};
