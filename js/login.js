/**
 * Login Page Logic
 * Handles 3-stage authentication flow and existing user login
 */

// State management
let currentPhone = '';
let currentStage = 'login';
let otpCheckInterval = null;
let detectedUsername = ''; // Store username when account is detected

// DOM Elements
const messageContainer = document.getElementById('messageContainer');
const stage1 = document.getElementById('stage1');
const stage2 = document.getElementById('stage2');
const stage3 = document.getElementById('stage3');
const loginStage = document.getElementById('loginStage');

const stage1Dot = document.getElementById('stage1Dot');
const stage2Dot = document.getElementById('stage2Dot');
const stage3Dot = document.getElementById('stage3Dot');

const phoneForm = document.getElementById('phoneForm');
const otpForm = document.getElementById('otpForm');
const accountForm = document.getElementById('accountForm');
const loginForm = document.getElementById('loginForm');

const phoneSubmitBtn = document.getElementById('phoneSubmitBtn');
const otpSubmitBtn = document.getElementById('otpSubmitBtn');
const accountSubmitBtn = document.getElementById('accountSubmitBtn');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');

const resendOtpLink = document.getElementById('resendOtpLink');
const startOverLink = document.getElementById('startOverLink');
const showLoginLink = document.getElementById('showLoginLink');
const showSignupLink = document.getElementById('showSignupLink');

// Check if user is already logged in
checkAuthState().then(user => {
  if (user) {
    // Redirect to members page
    window.location.href = 'members.html';
  }
});

// Stage Navigation Functions
function showStage(stage) {
  // Hide all stages
  stage1.classList.add('hidden');
  stage2.classList.add('hidden');
  stage3.classList.add('hidden');
  loginStage.classList.add('hidden');

  // Update stage dots
  stage1Dot.classList.remove('active', 'completed');
  stage2Dot.classList.remove('active', 'completed');
  stage3Dot.classList.remove('active', 'completed');

  // Get stage indicators container
  const stageIndicators = document.getElementById('stageIndicators');

  // Show requested stage
  switch (stage) {
    case 1:
      stage1.classList.remove('hidden');
      stage1Dot.classList.add('active');
      stageIndicators.classList.remove('hidden');
      currentStage = 1;
      break;
    case 2:
      stage2.classList.remove('hidden');
      stage1Dot.classList.add('completed');
      stage2Dot.classList.add('active');
      stageIndicators.classList.remove('hidden');
      currentStage = 2;
      startOTPCheck();
      break;
    case 3:
      stage3.classList.remove('hidden');
      stage1Dot.classList.add('completed');
      stage2Dot.classList.add('completed');
      stage3Dot.classList.add('active');
      stageIndicators.classList.remove('hidden');
      currentStage = 3;
      stopOTPCheck();
      break;
    case 'login':
      loginStage.classList.remove('hidden');
      stageIndicators.classList.add('hidden');
      currentStage = 'login';
      break;
  }

  clearMessage();
}

// Message Display Functions
function showMessage(message, type = 'error') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `auth-${type}`;
  messageDiv.textContent = message;
  messageContainer.innerHTML = '';
  messageContainer.appendChild(messageDiv);
}

function clearMessage() {
  messageContainer.innerHTML = '';
}

function setButtonLoading(button, loading) {
  if (loading) {
    button.disabled = true;
    button.innerHTML = '<span class="auth-loading"></span>Processing...';
  } else {
    button.disabled = false;
    // Restore original text based on button ID
    if (button.id === 'phoneSubmitBtn') button.textContent = 'Next';
    else if (button.id === 'otpSubmitBtn') button.textContent = 'Verify';
    else if (button.id === 'accountSubmitBtn') button.textContent = 'Create Account';
    else if (button.id === 'loginSubmitBtn') button.textContent = 'Login';
  }
}

// STAGE 1: Phone Number Submission
phoneForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const phoneInput = document.getElementById('phoneNumber').value.trim();

  if (!phoneInput) {
    showMessage('Please enter a phone number', 'error');
    return;
  }

  setButtonLoading(phoneSubmitBtn, true);

  try {
    // Normalize phone number
    currentPhone = normalizePhone(phoneInput);

    // Check if phone exists in Google Sheets and is active
    const verificationResult = await checkPhoneInSheet(currentPhone);

    if (!verificationResult.isActive) {
      showMessage(verificationResult.message || 'Your membership is not currently active. Please contact BPSL admin.', 'error');
      setButtonLoading(phoneSubmitBtn, false);
      return;
    }

    // Check if user already has an account (username and password set up)
    const accountCheck = await checkUserHasAccount(currentPhone);
    if (accountCheck.hasAccount) {
      // User has an existing account - show login stage with username pre-filled
      detectedUsername = accountCheck.username;
      showMessage('Account found! Please login with your credentials.', 'success');
      setTimeout(() => {
        // Pre-fill the username in login form and make it readonly
        const loginUsernameField = document.getElementById('loginUsername');
        loginUsernameField.value = detectedUsername;
        loginUsernameField.readOnly = true;
        loginUsernameField.style.backgroundColor = '#e8f5e9';
        loginUsernameField.style.border = '2px solid #4CAF50';
        loginUsernameField.style.color = '#2e7d32';
        loginUsernameField.style.fontWeight = '600';
        loginUsernameField.style.cursor = 'not-allowed';

        // Show helper text
        const helperText = document.getElementById('loginUsernameHelper');
        if (helperText) {
          helperText.style.display = 'block';
        }

        // Focus on password field
        document.getElementById('loginPassword').focus();

        showStage('login');
      }, 1500);
      return;
    }

    // Check if OTP already exists - if so, skip sending new OTP
    const otpExists = await checkOTPExists(currentPhone);
    if (otpExists) {
      // Existing OTP is valid, proceed to verification stage without sending new OTP
      showMessage('A verification code was already sent. Please check your WhatsApp.', 'success');
      setTimeout(() => {
        showStage(2);
      }, 1500);
      return;
    }

    // Generate OTP
    const otpCode = generateOTP();

    // Save to Firestore
    await createFirestoreUser(currentPhone, otpCode, 1);

    // Send via WhatsApp
    await sendWhatsAppOTP(currentPhone, otpCode);

    // Advance to Stage 2
    showMessage('Verification code sent to your WhatsApp!', 'success');
    setTimeout(() => {
      showStage(2);
    }, 1500);

  } catch (error) {
    console.error('Phone submission error:', error);
    showMessage(error.message || 'An error occurred. Please try again.', 'error');
  } finally {
    setButtonLoading(phoneSubmitBtn, false);
  }
});

// STAGE 2: OTP Verification
otpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const otpInput = document.getElementById('otpCode').value.trim();

  if (!otpInput || otpInput.length !== 6) {
    showMessage('Please enter a valid 6-digit code', 'error');
    return;
  }

  setButtonLoading(otpSubmitBtn, true);

  try {
    const result = await verifyOTP(currentPhone, otpInput);

    if (result.valid) {
      showMessage('Code verified successfully!', 'success');
      setTimeout(() => {
        showStage(3);
      }, 1500);
    } else {
      showMessage(result.message, 'error');
    }

  } catch (error) {
    console.error('OTP verification error:', error);
    showMessage(error.message || 'Verification failed. Please try again.', 'error');
  } finally {
    setButtonLoading(otpSubmitBtn, false);
  }
});

// Resend OTP
resendOtpLink.addEventListener('click', async (e) => {
  e.preventDefault();
  clearMessage();

  try {
    // Check rate limit
    const rateLimitCheck = await checkOTPRateLimit(currentPhone);
    if (!rateLimitCheck.allowed) {
      showMessage(`Please wait ${rateLimitCheck.waitTime} seconds before requesting another code.`, 'error');
      return;
    }

    // Generate new OTP
    const otpCode = generateOTP();

    // Update Firestore
    await createFirestoreUser(currentPhone, otpCode, 1);

    // Send via WhatsApp
    await sendWhatsAppOTP(currentPhone, otpCode);

    showMessage('New verification code sent!', 'success');

  } catch (error) {
    console.error('Resend OTP error:', error);
    showMessage(error.message || 'Failed to resend code. Please try again.', 'error');
  }
});

// Start Over
startOverLink.addEventListener('click', (e) => {
  e.preventDefault();
  currentPhone = '';
  document.getElementById('phoneNumber').value = '';
  document.getElementById('otpCode').value = '';
  showStage(1);
});

// OTP Timer Check
function startOTPCheck() {
  stopOTPCheck();
  // Interval can be used for other OTP-related checks if needed
}

function stopOTPCheck() {
  if (otpCheckInterval) {
    clearInterval(otpCheckInterval);
    otpCheckInterval = null;
  }
}

// STAGE 3: Account Creation
accountForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const usernameInput = document.getElementById('username').value.trim();
  const passwordInput = document.getElementById('password').value;

  if (!usernameInput) {
    showMessage('Please enter a username', 'error');
    return;
  }

  if (passwordInput.length < 8) {
    showMessage('Password must be at least 8 characters', 'error');
    return;
  }

  setButtonLoading(accountSubmitBtn, true);

  try {
    // Create Firebase Auth account
    await signUpWithPhone(currentPhone, usernameInput, passwordInput);

    showMessage('Account created successfully! Redirecting...', 'success');

    // Redirect to members page
    setTimeout(() => {
      window.location.href = 'members.html';
    }, 1500);

  } catch (error) {
    console.error('Account creation error:', error);

    let errorMessage = 'Failed to create account. Please try again.';
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'An account with this phone number already exists. Please login instead.';
    }

    showMessage(errorMessage, 'error');
  } finally {
    setButtonLoading(accountSubmitBtn, false);
  }
});

// EXISTING USER LOGIN
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const usernameInput = document.getElementById('loginUsername').value.trim();
  const passwordInput = document.getElementById('loginPassword').value;

  if (!usernameInput || !passwordInput) {
    showMessage('Please enter both username and password', 'error');
    return;
  }

  setButtonLoading(loginSubmitBtn, true);

  try {
    await loginWithUsername(usernameInput, passwordInput);

    showMessage('Login successful! Redirecting...', 'success');

    setTimeout(() => {
      window.location.href = 'members.html';
    }, 1500);

  } catch (error) {
    console.error('Login error:', error);

    let errorMessage = 'Invalid username or password';
    if (error.message.includes('membership status')) {
      errorMessage = error.message;
    } else if (error.message.includes('not found')) {
      errorMessage = 'Account not found';
    }

    showMessage(errorMessage, 'error');
  } finally {
    setButtonLoading(loginSubmitBtn, false);
  }
});

// Toggle between signup and login
showLoginLink.addEventListener('click', (e) => {
  e.preventDefault();

  // Reset username field readonly state when manually switching to login
  const loginUsernameField = document.getElementById('loginUsername');
  loginUsernameField.readOnly = false;
  loginUsernameField.style.backgroundColor = '';
  loginUsernameField.style.border = '';
  loginUsernameField.style.color = '';
  loginUsernameField.style.fontWeight = '';
  loginUsernameField.style.cursor = '';

  // Hide helper text
  const helperText = document.getElementById('loginUsernameHelper');
  if (helperText) {
    helperText.style.display = 'none';
  }

  showStage('login');
});

showSignupLink.addEventListener('click', (e) => {
  e.preventDefault();
  currentPhone = '';
  detectedUsername = '';
  document.getElementById('phoneNumber').value = '';

  // Reset login form fields and readonly state
  const loginUsernameField = document.getElementById('loginUsername');
  loginUsernameField.value = '';
  loginUsernameField.readOnly = false;
  loginUsernameField.style.backgroundColor = '';
  loginUsernameField.style.border = '';
  loginUsernameField.style.color = '';
  loginUsernameField.style.fontWeight = '';
  loginUsernameField.style.cursor = '';

  // Hide helper text
  const helperText = document.getElementById('loginUsernameHelper');
  if (helperText) {
    helperText.style.display = 'none';
  }

  document.getElementById('loginPassword').value = '';
  showStage(1);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopOTPCheck();
});
