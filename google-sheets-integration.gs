/**
 * Google Apps Script for BLACKPINK SRI LANKA Phone Number Verification
 *
 * This script verifies if a phone number exists in the member list
 * and checks if the member is active (green background color in Full Name column)
 *
 * Deployment Instructions:
 * 1. Go to https://script.google.com
 * 2. Create a new project
 * 3. Paste this code
 * 4. Deploy as Web App:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the deployment URL and update it in js/config.js
 *
 * Sheet Structure:
 * - Sheet Name: "Form responses 1"
 * - Column E (index 4): Full Name (background color determines active status)
 * - Column G (index 6): Phone Number
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // ACTION: VERIFY PHONE
    if (data.action === 'verifyPhone') {
      var sheet = SpreadsheetApp.openById('1cgEmVF7eizgMnjYxZUS_5QbLB6bWg2mXEfOfIA9fHnY')
                                 .getSheetByName("Form responses 1");
      var range = sheet.getDataRange();
      var values = range.getValues();
      var backgrounds = range.getBackgrounds(); // Get background colors
      var inputPhone = normalizePhone(data.phone);

      // Search through rows (skip header row)
      for (var i = 1; i < values.length; i++) {
        var sheetPhone = values[i][6]; // Column G (Phone Number)

        if (sheetPhone && normalizePhone(sheetPhone.toString()) === inputPhone) {
          // Check if Full Name column (E, index 4) has green background
          var nameColor = backgrounds[i][4]; // Column E background
          var isGreen = (nameColor && nameColor.toLowerCase() === "#00ff00");

          if (isGreen) {
            return ContentService.createTextOutput(JSON.stringify({
              status: 'success',
              isActive: true,
              message: 'Active member verified'
            })).setMimeType(ContentService.MimeType.JSON);
          } else {
            return ContentService.createTextOutput(JSON.stringify({
              status: 'success',
              isActive: false,
              message: 'Member found but not active'
            })).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }

      // Phone number not found in sheet
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        isActive: false,
        message: 'Phone number not found in active members list'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Unknown action
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Unknown action'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Normalize phone number for comparison
 * Removes non-digits, country code (94), and leading zero
 *
 * Examples:
 * - "+94771234567" → "771234567"
 * - "0771234567" → "771234567"
 * - "94771234567" → "771234567"
 * - "771234567" → "771234567"
 */
function normalizePhone(phone) {
  if (!phone) return '';

  // Remove all non-digits
  var cleaned = phone.toString().replace(/\D/g, '');

  // Remove country code if present (94)
  cleaned = cleaned.replace(/^94/, '');

  // Remove leading 0
  cleaned = cleaned.replace(/^0/, '');

  return cleaned; // e.g., "771234567"
}

/**
 * Test function to verify the script works
 * Run this in the Apps Script editor to test
 */
function testVerifyPhone() {
  var testData = {
    postData: {
      contents: JSON.stringify({
        action: 'verifyPhone',
        phone: '0771234567'  // Replace with a test phone number from your sheet
      })
    }
  };

  var result = doPost(testData);
  Logger.log(result.getContent());
}
