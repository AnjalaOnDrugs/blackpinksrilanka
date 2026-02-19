/**
 * Login Page Logic
 * Handles 3-stage authentication flow and existing user login
 */

// State management
let currentPhone = '';
let currentStage = 'login';
let otpCheckInterval = null;
let detectedUsername = ''; // Store username when account is detected
let capturedLat = null;   // Precise latitude (if user grants location permission)
let capturedLng = null;   // Precise longitude (if user grants location permission)

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

// Populate district dropdown
populateDistrictDropdown('district');

// ── Two-phase location prompt ──

function _showDistrictGroup(helperMsg) {
    var promptCard = document.getElementById('locationPromptCard');
    var districtGroup = document.getElementById('districtGroup');
    if (promptCard) promptCard.style.display = 'none';
    if (districtGroup) districtGroup.style.display = '';
    if (helperMsg) {
        var helper = document.getElementById('districtHelper');
        if (helper) { helper.textContent = helperMsg; helper.style.color = '#25D366'; }
    }
}

// "Allow location" button — try geolocation, store raw coords AND detect district
var allowLocationBtn = document.getElementById('allowLocationBtn');
if (allowLocationBtn) {
    allowLocationBtn.addEventListener('click', function () {
        var btn = this;
        btn.disabled = true;
        btn.innerHTML = '<span class="auth-loading"></span>Detecting...';

        if (!navigator.geolocation) {
            // Browser doesn't support — fall through to manual district selection
            _showDistrictGroup('Geolocation not supported. Please select your district manually.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            function (position) {
                capturedLat = position.coords.latitude;
                capturedLng = position.coords.longitude;

                var district = findDistrictByCoords(capturedLat, capturedLng);
                _showDistrictGroup(
                    district
                        ? 'Location captured \u2714 Detected: ' + district + '. You can change it if needed.'
                        : 'Location captured \u2714 Could not detect district \u2014 please select manually.'
                );

                if (district) {
                    var districtSelect = document.getElementById('district');
                    if (districtSelect) districtSelect.value = district;
                }
            },
            function () {
                // User denied permission — fall back to manual district selection
                capturedLat = null;
                capturedLng = null;
                _showDistrictGroup('Location access denied. Please select your district manually.');
            },
            { timeout: 10000, maximumAge: 300000 }
        );
    });
}

// "I'd rather not" button — skip precise location, show district dropdown only
var skipLocationBtn = document.getElementById('skipLocationBtn');
if (skipLocationBtn) {
    skipLocationBtn.addEventListener('click', function () {
        capturedLat = null;
        capturedLng = null;
        _showDistrictGroup(null);
        var helper = document.getElementById('districtHelper');
        if (helper) {
            helper.textContent = 'We understand! Your streams will appear on the district map.';
            helper.style.color = '';
        }
    });
}

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
    const districtGroup = document.getElementById('districtGroup');
    const districtInput = districtGroup && districtGroup.style.display !== 'none'
        ? document.getElementById('district').value
        : '';

    if (!usernameInput) {
        showMessage('Please enter a username', 'error');
        return;
    }

    if (passwordInput.length < 8) {
        showMessage('Password must be at least 8 characters', 'error');
        return;
    }

    // District is optional — if the district group is visible a selection is encouraged but not blocking
    // (user may have skipped location and not selected a district yet — that's allowed)

    setButtonLoading(accountSubmitBtn, true);

    try {
        // Create Firebase Auth account (pass district and precise coords if available)
        await signUpWithPhone(currentPhone, usernameInput, passwordInput, districtInput || null, capturedLat, capturedLng);

        showMessage('Account created successfully!', 'success');

        // Show profile picture upload dialog instead of redirecting immediately
        setTimeout(() => {
            showPostSignupPfpDialog();
        }, 800);

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

// ========== POST-SIGNUP PROFILE PICTURE DIALOG ==========
var pendingSignupPfpDataUrl = null;

function showPostSignupPfpDialog() {
    var overlay = document.getElementById('pfpUploadOverlay');
    if (!overlay) {
        // Fallback: redirect straight to profile
        window.location.href = 'profile.html?newSignup=1';
        return;
    }

    overlay.classList.add('active');

    var fileInput = document.getElementById('pfpFileInput');
    var previewWrap = document.getElementById('pfpUploadPreview');
    var previewImg = document.getElementById('pfpPreviewImg');
    var saveBtn = document.getElementById('pfpSaveBtn');
    var skipBtn = document.getElementById('pfpSkipBtn');
    var uploadBtn = document.getElementById('pfpUploadBtn');

    fileInput.addEventListener('change', async function () {
        var file = this.files[0];
        if (!file) return;

        var validation = validateProfileImageFile(file);
        if (!validation.valid) {
            showMessage(validation.message, 'error');
            return;
        }

        // Loading state
        uploadBtn.innerHTML = '<span class="auth-loading"></span>Compressing...';
        uploadBtn.style.pointerEvents = 'none';

        try {
            var dataUrl = await compressProfileImage(file);
            pendingSignupPfpDataUrl = dataUrl;

            previewImg.src = dataUrl;
            previewWrap.style.display = '';
            saveBtn.style.display = '';
            uploadBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Change Photo';
            uploadBtn.style.pointerEvents = '';
        } catch (err) {
            console.error('[PFP] Compression error:', err);
            showMessage('Failed to process image. Try a different photo.', 'error');
            uploadBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Choose Photo';
            uploadBtn.style.pointerEvents = '';
        }
    });

    saveBtn.addEventListener('click', async function () {
        if (!pendingSignupPfpDataUrl) return;

        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        try {
            await ConvexService.mutation('users:updateProfilePicture', {
                phoneNumber: currentPhone,
                profilePicture: pendingSignupPfpDataUrl
            });

            overlay.classList.remove('active');
            window.location.href = 'profile.html?newSignup=1';
        } catch (err) {
            console.error('[PFP] Save error:', err);
            showMessage('Failed to save profile picture. You can add it later.', 'error');
            saveBtn.textContent = 'Save & Continue';
            saveBtn.disabled = false;
        }
    });

    skipBtn.addEventListener('click', function () {
        overlay.classList.remove('active');
        window.location.href = 'profile.html?newSignup=1';
    });
}
