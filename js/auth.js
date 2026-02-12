/**
 * Firebase Authentication Module
 * Handles Firebase initialization and authentication operations
 */

// Initialize Firebase
firebase.initializeApp(ENV.firebase);
const auth = firebase.auth();
const db = firebase.firestore();

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
 * @returns {Promise<Object>} User credential
 */
async function signUpWithPhone(phoneNumber, username, password) {
  try {
    // Construct email using phone number
    const email = `${phoneNumber}@bpsl.local`;

    // Create Firebase Auth account
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);

    // Update Firestore record with username
    await db.collection('users').doc(phoneNumber).update({
      username: username,
      registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
      authStage: 3  // Complete
    });

    return userCredential;
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
}

/**
 * Login existing user with username and password
 * Looks up phone number by username, then authenticates
 *
 * @param {string} username - User's username
 * @param {string} password - User's password
 * @returns {Promise<Object>} User credential
 */
async function loginWithUsername(username, password) {
  try {
    // Look up phone number by username in Firestore
    const usersRef = db.collection('users');
    const querySnapshot = await usersRef.where('username', '==', username).limit(1).get();

    if (querySnapshot.empty) {
      throw new Error('Account not found');
    }

    // Get phone number (document ID)
    const userDoc = querySnapshot.docs[0];
    const phoneNumber = userDoc.id;

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
 * Get current user's Firestore data
 * @returns {Promise<Object|null>} User data from Firestore
 */
async function getCurrentUserData() {
  try {
    const user = auth.currentUser;
    if (!user) return null;

    // Extract phone number from email (phone@bpsl.local -> phone)
    const phoneNumber = user.email.replace('@bpsl.local', '');

    const userDoc = await db.collection('users').doc(phoneNumber).get();

    if (!userDoc.exists) return null;

    return {
      phoneNumber: phoneNumber,
      ...userDoc.data()
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
