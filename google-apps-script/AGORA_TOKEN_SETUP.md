# Agora RTM Token Server Setup Guide

This guide will help you deploy a serverless Agora token server using Google Apps Script.

## Why Do You Need This?

Your Agora project has "Primary Certificate" enabled, which requires token authentication for security. This token server generates valid tokens so users can connect to the chat.

## Step-by-Step Setup

### 1. Get Your Agora App Certificate

1. Go to [Agora Console](https://console.agora.io)
2. Select your project
3. Go to **Settings** → **Features**
4. You'll see **Primary Certificate** - click the eye icon to reveal it
5. Copy this certificate (you'll need it in step 3)

### 2. Create the Google Apps Script

1. Go to [Google Apps Script](https://script.google.com)
2. Click **+ New project**
3. Delete the default `myFunction()` code
4. Copy the entire contents of `agora-token-server.gs`
5. Paste it into the script editor
6. Rename the project to "Agora Token Server" (click "Untitled project" at the top)
7. Click **Save** (💾 icon)

### 3. Configure Script Properties

1. In the Apps Script editor, click **Project Settings** (⚙️ icon on the left)
2. Scroll down to **Script Properties**
3. Click **Add script property**
4. Add these two properties:

   | Property | Value |
   |----------|-------|
   | `AGORA_APP_ID` | `cd95c07eac04413aa4b458bdab65136d` |
   | `AGORA_APP_CERTIFICATE` | Your certificate from step 1 |

5. Click **Save script properties**

### 4. Test the Script (Optional but Recommended)

1. In the script editor, select the function `testTokenGeneration` from the dropdown at the top
2. Click **Run** (▶️ icon)
3. You may need to authorize the script (click "Review permissions" and allow access)
4. Check the **Execution log** at the bottom - you should see:
   ```
   ✓ Token generated successfully!
   User ID: 1234567890
   Token: <long base64 string>
   Token length: XXX characters
   ```

### 5. Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ next to "Select type"
3. Choose **Web app**
4. Fill in the deployment settings:
   - **Description**: "Agora RTM Token Server v1"
   - **Execute as**: **Me** (your account)
   - **Who has access**: **Anyone** (important - your website needs to access this)
5. Click **Deploy**
6. Copy the **Web app URL** - it will look like:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

### 6. Update Your Website Config

1. Open `js/config.js` in your project
2. Find the line with `agoraTokenServerUrl`
3. Paste your Web App URL:
   ```javascript
   agoraTokenServerUrl: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
   ```
4. Save the file

### 7. Test the Chat

1. Refresh your `room.html` page
2. Open the browser console (F12)
3. You should see:
   ```
   Logging in to Agora RTM with token
   Agora RTM connected
   ```
4. Send a test message - it should work!

## Testing the Token Server Directly

You can test your deployed token server by visiting this URL in your browser:

```
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?userId=test123
```

You should get a JSON response like:
```json
{
  "token": "007eJxT...base64string...",
  "userId": "test123",
  "expiresIn": 86400
}
```

## Troubleshooting

### Error: "AGORA_APP_ID and AGORA_APP_CERTIFICATE must be set"
- Go back to step 3 and make sure both script properties are added correctly
- Check for typos in the property names (they are case-sensitive)

### Error: "Token server returned 403"
- Make sure "Who has access" is set to **Anyone** in deployment settings
- Try redeploying with a new deployment

### Chat still says "Falling back to Firebase"
- Check that you pasted the correct Web App URL in `config.js`
- Make sure the URL ends with `/exec`
- Clear your browser cache and refresh

### Token works but chat messages don't appear
- The Firebase fallback is working! Check your Firestore rules to ensure the `messages` collection is writable

## Token Security Notes

- ✅ Tokens expire after 24 hours automatically
- ✅ The App Certificate is kept secret in Google Apps Script (never exposed to the client)
- ✅ Anyone can request a token, but they need a valid userId
- ✅ Each token is tied to a specific userId for accountability

## Need Help?

- [Agora Token Server Documentation](https://docs.agora.io/en/video-calling/develop/authentication-workflow)
- [Google Apps Script Documentation](https://developers.google.com/apps-script)
