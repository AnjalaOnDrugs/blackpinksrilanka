/**
 * Agora RTM Token Server - Simplified Version
 * This version uses a simpler token generation approach
 */

function doGet(e) {
  var userId = e.parameter.userId;
  var callback = e.parameter.callback;

  // Validate userId
  if (!userId) {
    return createJsonpResponse({
      error: 'userId parameter is required'
    }, callback);
  }

  try {
    // Get credentials from script properties
    var appId = PropertiesService.getScriptProperties().getProperty('AGORA_APP_ID');
    var appCertificate = PropertiesService.getScriptProperties().getProperty('AGORA_APP_CERTIFICATE');

    if (!appId) {
      throw new Error('AGORA_APP_ID not configured in Script Properties');
    }

    if (!appCertificate) {
      throw new Error('AGORA_APP_CERTIFICATE not configured in Script Properties');
    }

    // Generate token
    var token = generateAgoraToken(appId, appCertificate, userId);

    // Return success response
    return createJsonpResponse({
      success: true,
      token: token,
      userId: userId,
      expiresIn: 86400
    }, callback);

  } catch (error) {
    Logger.log('Error generating token: ' + error.toString());

    return createJsonpResponse({
      success: false,
      error: error.toString()
    }, callback);
  }
}

/**
 * Generate Agora RTM Token using AccessToken2
 */
function generateAgoraToken(appId, appCertificate, userId) {
  // Token configuration
  var expirationTimeInSeconds = 86400; // 24 hours
  var currentTimestamp = Math.floor(Date.now() / 1000);
  var privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  // Service type: RTM = 2
  var SERVICE_TYPE_RTM = 2;

  // Generate salt (random 32-bit integer)
  var salt = Math.floor(Math.random() * 0xFFFFFFFF);

  // Build the message to sign
  // Format: appId + userId + salt + service + expireTime
  var message = appId + userId + salt.toString() + SERVICE_TYPE_RTM.toString() + privilegeExpiredTs.toString();

  // Sign with HMAC-SHA256 (both params must be same type: string, string)
  var signatureBytes = Utilities.computeHmacSha256Signature(message, appCertificate);

  // Convert signature to hex
  var signature = bytesToHex(signatureBytes);

  // Build token components
  var version = '007'; // Agora token version
  var components = [
    version,
    appId,
    privilegeExpiredTs.toString(),
    salt.toString(),
    signature,
    SERVICE_TYPE_RTM.toString(),
    userId
  ];

  // Join with colons
  var tokenString = components.join(':');

  // Base64 encode
  var tokenBytes = Utilities.newBlob(tokenString).getBytes();
  var token = Utilities.base64Encode(tokenBytes);

  return token;
}

/**
 * Convert byte array to hex string
 */
function bytesToHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var byte = bytes[i] & 0xFF;
    var hexByte = ('0' + byte.toString(16)).slice(-2);
    hex += hexByte;
  }
  return hex;
}

/**
 * Create JSONP response
 */
function createJsonpResponse(data, callback) {
  var json = JSON.stringify(data);
  var output;

  if (callback) {
    // JSONP response
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
 * Test function
 */
function testTokenGeneration() {
  var appId = PropertiesService.getScriptProperties().getProperty('AGORA_APP_ID');
  var appCertificate = PropertiesService.getScriptProperties().getProperty('AGORA_APP_CERTIFICATE');
  var testUserId = '94771234567';

  if (!appId) {
    Logger.log('❌ AGORA_APP_ID not set in Script Properties');
    return false;
  }

  if (!appCertificate) {
    Logger.log('❌ AGORA_APP_CERTIFICATE not set in Script Properties');
    return false;
  }

  Logger.log('App ID: ' + appId);
  Logger.log('Certificate: ' + appCertificate.substring(0, 10) + '...');

  try {
    var token = generateAgoraToken(appId, appCertificate, testUserId);

    Logger.log('\n✅ Token generated successfully!');
    Logger.log('User ID: ' + testUserId);
    Logger.log('Token: ' + token);
    Logger.log('Token length: ' + token.length + ' characters');
    Logger.log('\nFirst 50 chars: ' + token.substring(0, 50) + '...');

    // Test response format
    var response = {
      success: true,
      token: token,
      userId: testUserId,
      expiresIn: 86400
    };

    Logger.log('\nResponse object:');
    Logger.log(JSON.stringify(response, null, 2));

    return true;
  } catch (error) {
    Logger.log('\n❌ Error: ' + error.toString());
    return false;
  }
}
