/**
 * Agora RTM Token Server
 * Deploy this as a Google Apps Script Web App
 *
 * Setup Instructions:
 * 1. Go to https://script.google.com
 * 2. Create a new project
 * 3. Paste this code
 * 4. Go to Project Settings > Script Properties
 * 5. Add properties:
 *    - AGORA_APP_ID: your Agora App ID
 *    - AGORA_APP_CERTIFICATE: your Agora App Certificate (from Agora Console)
 * 6. Deploy > New deployment > Web app
 * 7. Execute as: Me
 * 8. Who has access: Anyone
 * 9. Copy the Web App URL
 */

// Main entry point for POST requests
function doPost(e) {
  // Handle CORS preflight
  if (e.parameter.method === 'OPTIONS') {
    return createCorsResponse();
  }

  try {
    var params = JSON.parse(e.postData.contents);
    var userId = params.userId;
    var channelName = params.channelName || '';

    if (!userId) {
      return createResponse(400, { error: 'userId is required' });
    }

    var token = generateRtmToken(userId);

    return createResponse(200, {
      token: token,
      userId: userId,
      expiresIn: 86400 // 24 hours in seconds
    });

  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return createResponse(500, { error: error.toString() });
  }
}

// Also support GET requests (this works better with CORS)
function doGet(e) {
  var userId = e.parameter.userId;
  var callback = e.parameter.callback;

  if (!userId) {
    return createResponse(400, { error: 'userId parameter is required' }, callback);
  }

  try {
    var token = generateRtmToken(userId);

    return createResponse(200, {
      token: token,
      userId: userId,
      expiresIn: 86400
    }, callback);

  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return createResponse(500, { error: error.toString() }, callback);
  }
}

/**
 * Generate Agora RTM Token
 * Based on Agora's token generation algorithm
 */
function generateRtmToken(userId) {
  var appId = PropertiesService.getScriptProperties().getProperty('AGORA_APP_ID');
  var appCertificate = PropertiesService.getScriptProperties().getProperty('AGORA_APP_CERTIFICATE');

  if (!appId || !appCertificate) {
    throw new Error('AGORA_APP_ID and AGORA_APP_CERTIFICATE must be set in Script Properties');
  }

  // Token valid for 24 hours
  var expirationTime = Math.floor(Date.now() / 1000) + 86400;

  // Build the token using AccessToken2 format
  var token = buildToken(appId, appCertificate, userId, expirationTime);

  return token;
}

/**
 * Build Agora RTM Token (Version 2)
 * This implements the Agora Token v2 algorithm
 */
function buildToken(appId, appCertificate, userId, expireTime) {
  // Service type for RTM
  var SERVICE_TYPE_RTM = 2;

  // Create message to sign
  var now = Math.floor(Date.now() / 1000);
  var salt = Math.floor(Math.random() * 100000000);

  // Pack message: appId + userId + salt + serviceType + expireTime
  var message = appId + userId + salt.toString() + SERVICE_TYPE_RTM.toString() + expireTime.toString();

  // Generate signature using HMAC-SHA256 (both params must be same type: string, string)
  var signature = Utilities.computeHmacSha256Signature(message, appCertificate);

  // Convert signature to hex string
  var signatureHex = signature.reduce(function(str, byte) {
    return str + ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }, '');

  // Build token string
  // Format: version:appId:expireTime:salt:signature:userId
  var version = '007';
  var tokenString = [
    version,
    appId,
    expireTime.toString(),
    salt.toString(),
    signatureHex,
    SERVICE_TYPE_RTM.toString(),
    userId
  ].join(':');

  // Base64 encode the token
  var tokenBytes = Utilities.newBlob(tokenString).getBytes();
  var tokenBase64 = Utilities.base64Encode(tokenBytes);

  return tokenBase64;
}

/**
 * Create JSON or JSONP response
 */
function createResponse(statusCode, data, callback) {
  if (statusCode !== 200) {
    data.statusCode = statusCode;
  }

  var json = JSON.stringify(data);
  var output;

  if (callback) {
    // JSONP response (bypasses CORS)
    output = ContentService.createTextOutput(callback + '(' + json + ')');
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    // Regular JSON response
    output = ContentService.createTextOutput(json);
    output.setMimeType(ContentService.MimeType.JSON);
  }

  return output;
}

/**
 * Create CORS preflight response
 */
function createCorsResponse() {
  var output = ContentService.createTextOutput('');
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
}

/**
 * Test function - run this to verify setup
 */
function testTokenGeneration() {
  var testUserId = '1234567890';

  try {
    var token = generateRtmToken(testUserId);
    Logger.log('✓ Token generated successfully!');
    Logger.log('User ID: ' + testUserId);
    Logger.log('Token: ' + token);
    Logger.log('Token length: ' + token.length + ' characters');
    return true;
  } catch (error) {
    Logger.log('✗ Error generating token: ' + error.toString());
    return false;
  }
}
