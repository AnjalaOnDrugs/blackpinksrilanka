/**
 * Firebase Authentication Module
 * Keeps Firebase Auth for authentication, uses Convex for user data reads/writes.
 */

// Initialize Firebase (Auth only - Firestore no longer used for room data)
firebase.initializeApp(ENV.firebase);
const auth = firebase.auth();

// Initialize Convex for user data operations
ConvexService.init(CONFIG.convexUrl);

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
