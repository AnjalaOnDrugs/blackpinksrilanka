/**
 * Firebase Authentication Module
 * Keeps Firebase Auth for authentication, uses Convex for user data reads/writes.
 */

// Initialize Firebase (Auth only - Firestore no longer used for room data)
firebase.initializeApp(ENV.firebase);
const auth = firebase.auth();

// Initialize Convex for user data operations
ConvexService.init(CONFIG.convexUrl);

// Profile image upload settings
const PROFILE_IMAGE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const PROFILE_IMAGE_DEFAULT_MAX_DIMENSION = 320;
const PROFILE_IMAGE_DEFAULT_TARGET_BYTES = 350 * 1024;

/**
 * Validate a selected profile image file
 *
 * @param {File} file
 * @returns {{valid: boolean, message?: string}}
 */
function validateProfileImageFile(file) {
  if (!file) {
    return { valid: false, message: "No file selected" };
  }
  if (!file.type || !file.type.startsWith("image/")) {
    return { valid: false, message: "Please select an image file" };
  }
  if (file.size > PROFILE_IMAGE_MAX_UPLOAD_BYTES) {
    return { valid: false, message: "Image too large. Max 10MB." };
  }
  return { valid: true };
}

/**
 * Compress and crop an image to a square JPEG data URL.
 * It iteratively lowers quality and dimensions to stay under target bytes.
 *
 * @param {File} file
 * @param {{maxDimension?: number, targetMaxBytes?: number}} [options]
 * @returns {Promise<string>}
 */
async function compressProfileImage(file, options) {
  var opts = options || {};
  var maxDimension = opts.maxDimension || PROFILE_IMAGE_DEFAULT_MAX_DIMENSION;
  var targetMaxBytes = opts.targetMaxBytes || PROFILE_IMAGE_DEFAULT_TARGET_BYTES;

  var image = await loadImageFromFile(file);
  var sourceSize = Math.min(image.width, image.height);
  var sourceX = Math.floor((image.width - sourceSize) / 2);
  var sourceY = Math.floor((image.height - sourceSize) / 2);

  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not process image");
  }

  var dimension = Math.min(maxDimension, sourceSize);
  var qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
  var bestDataUrl = "";

  while (dimension >= 96) {
    canvas.width = dimension;
    canvas.height = dimension;
    ctx.clearRect(0, 0, dimension, dimension);
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      dimension,
      dimension
    );

    for (var i = 0; i < qualitySteps.length; i++) {
      var dataUrl = canvas.toDataURL("image/jpeg", qualitySteps[i]);
      bestDataUrl = dataUrl;
      if (estimateDataUrlBytes(dataUrl) <= targetMaxBytes) {
        return dataUrl;
      }
    }

    dimension = Math.floor(dimension * 0.85);
  }

  return bestDataUrl;
}

function loadImageFromFile(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (evt) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Invalid image"));
      };
      img.src = evt.target.result;
    };
    reader.onerror = function () {
      reject(new Error("Could not read image"));
    };
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlBytes(dataUrl) {
  var commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return 0;
  var base64 = dataUrl.substring(commaIndex + 1);
  var padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Check if user is currently authenticated
 * @returns {Promise<Object|null>} User object if authenticated, null otherwise
 */
async function checkAuthState() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged((user) => {
      resolve(user);
    });
  });
}

/**
 * Sign up new user with phone number flow
 * Creates Firebase Auth account using phone@bpsl.local email format
 *
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} username - User's chosen username
 * @param {string} password - User's chosen password
 * @param {string} [district] - User's district (optional)
 * @param {number|null} [lat] - Precise latitude (optional, only if user granted permission)
 * @param {number|null} [lng] - Precise longitude (optional)
 * @returns {Promise<Object>} User credential
 */
async function signUpWithPhone(phoneNumber, username, password, district, lat, lng) {
  try {
    // Construct email using phone number
    const email = `${phoneNumber}@bpsl.local`;

    // Create Firebase Auth account
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);

    // Update Convex user record with username, district, and precise coords
    var regArgs = {
      phoneNumber: phoneNumber,
      username: username
    };
    if (district) {
      regArgs.district = district;
    }
    if (lat != null && lng != null) {
      regArgs.lat = lat;
      regArgs.lng = lng;
    }
    await ConvexService.mutation('users:completeRegistration', regArgs);

    return userCredential;
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
}

/**
 * Login existing user with username and password
 * Looks up phone number by username via Convex, then authenticates via Firebase Auth
 *
 * @param {string} username - User's username
 * @param {string} password - User's password
 * @returns {Promise<Object>} User credential
 */
async function loginWithUsername(username, password) {
  try {
    // Look up phone number by username in Convex
    const userDoc = await ConvexService.query('users:getByUsername', { username: username });

    if (!userDoc) {
      throw new Error('Account not found');
    }

    const phoneNumber = userDoc.phoneNumber;

    // Verify active member status before login
    const verificationResult = await checkPhoneInSheet(phoneNumber);

    if (!verificationResult.isActive) {
      throw new Error('Your membership status is not active. Please contact BPSL admin.');
    }

    // Construct email and authenticate
    const email = `${phoneNumber}@bpsl.local`;
    const userCredential = await auth.signInWithEmailAndPassword(email, password);

    return userCredential;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Logout current user
 * @returns {Promise<void>}
 */
async function logoutUser() {
  try {
    await auth.signOut();
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

/**
 * Get current user's data from Convex
 * @returns {Promise<Object|null>} User data
 */
async function getCurrentUserData() {
  try {
    const user = auth.currentUser;
    if (!user) return null;

    // Extract phone number from email (phone@bpsl.local -> phone)
    const phoneNumber = user.email.replace('@bpsl.local', '');

    const userDoc = await ConvexService.query('users:getByPhone', { phoneNumber: phoneNumber });

    if (!userDoc) return null;

    return {
      phoneNumber: phoneNumber,
      username: userDoc.username,
      lastfmUsername: userDoc.lastfmUsername,
      avatarColor: userDoc.avatarColor,
      authStage: userDoc.authStage,
      registeredAt: userDoc.registeredAt,
      district: userDoc.district || null,
      districtLastChanged: userDoc.districtLastChanged || null,
      bias: userDoc.bias || null,
      profilePicture: userDoc.profilePicture || null,
      lat: userDoc.lat ?? null,
      lng: userDoc.lng ?? null
    };
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

/**
 * Initialize auth state listener for navbar updates
 * Updates Login/Members button based on authentication state
 */
function initAuthStateListener() {
  auth.onAuthStateChanged((user) => {
    const authButton = document.getElementById('authButton');

    if (!authButton) return; // Navbar not loaded yet

    if (user) {
      // User is logged in - show Members button
      authButton.textContent = 'Members';
      authButton.href = 'members.html';
    } else {
      // User is logged out - show Login button
      authButton.textContent = 'Login';
      authButton.href = 'login.html';
    }
  });
}

// Initialize auth listener when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthStateListener);
} else {
  initAuthStateListener();
}
