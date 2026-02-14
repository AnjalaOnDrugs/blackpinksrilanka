/**
 * Phone Verification and OTP Module
 * Handles phone number verification, OTP generation, and WhatsApp messaging
 */

/**
 * Normalize phone number
 * Removes country code, spaces, dashes, and leading zero
 *
 * @param {string} phone - Raw phone number input
 * @returns {string} Normalized phone number (e.g., "771234567")
 */
function normalizePhone(phone) {
  if (!phone) return '';

  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');

  // Remove country code if present (94)
  cleaned = cleaned.replace(/^94/, '');

  // Remove leading 0
  cleaned = cleaned.replace(/^0/, '');

  return cleaned;
}

/**
 * Format phone number for WhatsApp API
 * Adds country code 94
 *
 * @param {string} normalizedPhone - Normalized phone number
 * @returns {string} Phone number with country code (e.g., "94771234567")
 */
function formatPhoneForWhatsApp(normalizedPhone) {
  return CONFIG.countryCode + normalizedPhone;
}

/**
 * Check if phone number exists in Google Sheets and is active
 * Calls the Google Apps Script Web App
 *
 * @param {string} phoneNumber - Phone number to verify (will be normalized)
 * @returns {Promise<Object>} {isActive: boolean, message: string}
 */
async function checkPhoneInSheet(phoneNumber) {
  try {
    const normalizedPhone = normalizePhone(phoneNumber);

    const response = await fetch(CONFIG.googleSheetsUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'verifyPhone',
        phone: normalizedPhone
      })
    });

    const data = await response.json();

    if (data.status === 'error') {
      throw new Error(data.message);
    }

    return {
      isActive: data.isActive,
      message: data.message
    };
  } catch (error) {
    console.error('Sheet verification error:', error);
    throw new Error('Failed to verify membership status. Please try again.');
  }
}

/**
 * Generate a random 6-digit OTP code
 * @returns {string} 6-digit OTP
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP via WhatsApp
 *
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} otpCode - 6-digit OTP code
 * @returns {Promise<boolean>} Success status
 */
async function sendWhatsAppOTP(phoneNumber, otpCode) {
  try {
    const whatsappPhone = formatPhoneForWhatsApp(phoneNumber);
    const message = `[BPSL community] Your login code is ${otpCode}`;

    // Route through Google Apps Script to avoid CORS
    // Credentials are stored server-side in the Apps Script, not sent from browser
    const response = await fetch(CONFIG.googleSheetsUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'sendWhatsApp',
        phone: whatsappPhone,
        message: message
      })
    });

    const data = await response.json();
    if (data.status !== 'success') {
      throw new Error('WhatsApp API request failed');
    }

    return true;
  } catch (error) {
    console.error('WhatsApp send error:', error);
    throw new Error('Failed to send OTP. Please try again.');
  }
}

/**
 * Create or update Firestore user document with OTP
 *
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} otpCode - 6-digit OTP code
 * @param {number} stage - Auth stage (1=phone, 2=otp, 3=complete)
 * @returns {Promise<void>}
 */
async function createFirestoreUser(phoneNumber, otpCode, stage = 1) {
  try {
    const userRef = db.collection('users').doc(phoneNumber);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      // Update existing document
      await userRef.update({
        otpCode: otpCode,
        otpGeneratedAt: firebase.firestore.FieldValue.serverTimestamp(),
        otpAttempts: 0,  // Reset attempts
        authStage: stage
      });
    } else {
      // Create new document
      await userRef.set({
        phoneNumber: phoneNumber,
        otpCode: otpCode,
        otpGeneratedAt: firebase.firestore.FieldValue.serverTimestamp(),
        otpAttempts: 0,
        authStage: stage
      });
    }
  } catch (error) {
    console.error('Firestore error:', error);
    throw new Error('Failed to save verification data. Please try again.');
  }
}

/**
 * Verify OTP code
 *
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} enteredOTP - OTP code entered by user
 * @returns {Promise<Object>} {valid: boolean, attemptsRemaining: number, message: string}
 */
async function verifyOTP(phoneNumber, enteredOTP) {
  try {
    const userRef = db.collection('users').doc(phoneNumber);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return {
        valid: false,
        attemptsRemaining: 0,
        message: 'Session expired. Please start over.'
      };
    }

    const userData = userDoc.data();
    const storedOTP = userData.otpCode;
    const attempts = userData.otpAttempts || 0;

    // Check if max attempts reached
    if (attempts >= CONFIG.otpMaxAttempts) {
      return {
        valid: false,
        attemptsRemaining: 0,
        message: 'Maximum attempts exceeded. Please request a new code.'
      };
    }

    // Verify OTP
    if (enteredOTP === storedOTP) {
      // Correct OTP - advance to next stage
      await userRef.update({
        authStage: 2
      });

      return {
        valid: true,
        attemptsRemaining: CONFIG.otpMaxAttempts - attempts,
        message: 'OTP verified successfully'
      };
    } else {
      // Incorrect OTP - increment attempts
      const newAttempts = attempts + 1;
      await userRef.update({
        otpAttempts: newAttempts
      });

      const remaining = CONFIG.otpMaxAttempts - newAttempts;

      return {
        valid: false,
        attemptsRemaining: remaining,
        message: remaining > 0
          ? `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
          : 'Maximum attempts exceeded. Please request a new code.'
      };
    }
  } catch (error) {
    console.error('OTP verification error:', error);
    throw new Error('Failed to verify OTP. Please try again.');
  }
}

/**
 * Check if an OTP already exists for the phone number
 *
 * @param {string} phoneNumber - Normalized phone number
 * @returns {Promise<boolean>} True if OTP exists
 */
async function checkOTPExists(phoneNumber) {
  try {
    const userRef = db.collection('users').doc(phoneNumber);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return false;
    }

    const userData = userDoc.data();
    return !!userData.otpCode;
  } catch (error) {
    console.error('OTP exists check error:', error);
    return false;
  }
}

/**
 * Check if user has an existing account (username and password set up)
 *
 * @param {string} phoneNumber - Normalized phone number
 * @returns {Promise<Object>} {hasAccount: boolean, username: string|null}
 */
async function checkUserHasAccount(phoneNumber) {
  try {
    const userRef = db.collection('users').doc(phoneNumber);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return { hasAccount: false, username: null };
    }

    const userData = userDoc.data();
    
    // Check if user has completed registration (has username)
    if (userData.username && userData.authStage === 3) {
      return { hasAccount: true, username: userData.username };
    }

    return { hasAccount: false, username: null };
  } catch (error) {
    console.error('Account check error:', error);
    return { hasAccount: false, username: null };
  }
}

/**
 * Check if user can request a new OTP (rate limiting)
 *
 * @param {string} phoneNumber - Normalized phone number
 * @returns {Promise<Object>} {allowed: boolean, waitTime: number}
 */
async function checkOTPRateLimit(phoneNumber) {
  try {
    const userRef = db.collection('users').doc(phoneNumber);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return { allowed: true, waitTime: 0 };
    }

    const userData = userDoc.data();
    const lastGenerated = userData.otpGeneratedAt;

    if (!lastGenerated) {
      return { allowed: true, waitTime: 0 };
    }

    const now = new Date();
    const lastGeneratedDate = lastGenerated.toDate();
    const timeDiff = now - lastGeneratedDate;

    if (timeDiff < CONFIG.otpRateLimit) {
      const waitTime = Math.ceil((CONFIG.otpRateLimit - timeDiff) / 1000); // seconds
      return {
        allowed: false,
        waitTime: waitTime
      };
    }

    return { allowed: true, waitTime: 0 };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true, waitTime: 0 }; // Allow on error to prevent blocking
  }
}

/**
 * Check if "Generate another code?" button should be shown
 * Based on time elapsed since OTP generation
 *
 * @param {string} phoneNumber - Normalized phone number
 * @returns {Promise<boolean>} True if button should be shown
 */
async function shouldShowRegenerateButton(phoneNumber) {
  try {
    const userRef = db.collection('users').doc(phoneNumber);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return false;
    }

    const userData = userDoc.data();
    const lastGenerated = userData.otpGeneratedAt;

    if (!lastGenerated) {
      return false;
    }

    const now = new Date();
    const lastGeneratedDate = lastGenerated.toDate();
    const timeDiff = now - lastGeneratedDate;

    return timeDiff >= CONFIG.otpDisplayTime; // 10 minutes
  } catch (error) {
    console.error('Regenerate button check error:', error);
    return false;
  }
}
