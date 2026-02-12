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
  countryCode: "94"        // Sri Lanka country code
};
