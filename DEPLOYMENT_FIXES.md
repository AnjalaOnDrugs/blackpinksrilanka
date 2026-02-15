# Deployment Fixes - Chat Token & Permissions

You have two issues to fix:

## Issue 1: Token Generation Error ❌
**Error**: "No token in response"
**Cause**: The token generation algorithm might have issues

## Issue 2: Firebase Permission Error ❌
**Error**: "Missing or insufficient permissions"
**Cause**: Firestore security rules don't allow writing to messages collection

---

## Fix 1: Update Google Apps Script Token Server

### Option A: Replace with Simplified Version (Recommended)

1. Go to your [Google Apps Script project](https://script.google.com)
2. **Delete all existing code**
3. Copy the entire contents of `google-apps-script/agora-token-server-v2.gs`
4. Paste it into the script editor
5. **Test it first**:
   - Select function: `testTokenGeneration`
   - Click **Run** ▶️
   - Check the **Execution log** - should see:
     ```
     ✅ Token generated successfully!
     Token: 007eJxT...
     Token length: XXX characters
     ```
6. If test passes, **Deploy**:
   - Deploy → Manage deployments
   - Click ✏️ (Edit)
   - Version: **New version**
   - Click **Deploy**
   - **Keep the same URL** (no need to update config.js)

### What's Different in v2?

- ✅ Simpler, more reliable token generation
- ✅ Better error messages
- ✅ Returns `{success: true, token: "..."}` format
- ✅ Improved logging for debugging

---

## Fix 2: Update Firestore Security Rules

### Step-by-Step:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click **Firestore Database** in the left menu
4. Click the **Rules** tab at the top
5. **Replace all rules** with the contents of `firestore-rules/firestore.rules`
6. Click **Publish**

### What These Rules Do:

```javascript
// Messages collection rules
match /messages/{messageId} {
  // ✅ Anyone authenticated can read messages
  allow read: if request.auth != null;

  // ✅ Users can create messages with their own userId
  allow create: if request.auth != null
    && request.resource.data.userId == request.auth.token.phone_number
    && request.resource.data.username is string
    && request.resource.data.type in ['message', 'reaction'];

  // ❌ Messages cannot be edited or deleted
  allow update, delete: if false;
}
```

---

## Fix 3: Test Everything

### 1. Test Token Server URL Directly

Open this in your browser (replace with your URL and user ID):
```
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?userId=94771234567&callback=test
```

Before clicking, open browser console (F12) and create the callback:
```javascript
window.test = function(data) {
  console.log('Response:', data);
  if (data.success && data.token) {
    console.log('✅ Token generation working!');
  } else {
    console.log('❌ Error:', data.error);
  }
}
```

Then load the URL. You should see:
```
Response: {success: true, token: "007eJxT...", userId: "94771234567", expiresIn: 86400}
✅ Token generation working!
```

### 2. Test Chat in Room

1. Refresh `room.html` (Ctrl+Shift+R / Cmd+Shift+R)
2. Check browser console - should see:
   ```
   Token server response: {success: true, token: "...", ...}
   Token received successfully
   Logging in to Agora RTM with token
   Agora RTM connected ✅
   ```
3. Try sending a message
4. Open room.html in another browser/tab with a different account
5. Messages should sync between both tabs!

---

## Troubleshooting

### If Token Server Test Fails:

**Check Script Properties**:
1. Apps Script → Project Settings ⚙️
2. Script Properties section
3. Verify both properties exist:
   - `AGORA_APP_ID` = `cd95c07eac04413aa4b458bdab65136d`
   - `AGORA_APP_CERTIFICATE` = your certificate (32 hex characters)

**Common Mistakes**:
- ❌ Property names have typos (they're case-sensitive!)
- ❌ App Certificate not from Agora Console → Settings → Features
- ❌ Copied certificate with extra spaces

### If Agora Still Fails:

**Check Console for Specific Error**:

| Error Message | Solution |
|--------------|----------|
| "Token server error: AGORA_APP_ID not configured" | Add AGORA_APP_ID to Script Properties |
| "Token server error: AGORA_APP_CERTIFICATE not configured" | Add AGORA_APP_CERTIFICATE to Script Properties |
| "Error Code 5: The vendor enabled dynamic key..." | Token is invalid, check certificate is correct |
| "Token request timeout" | Script deployment might be slow, increase timeout or check deployment URL |

### If Firebase Permission Error Persists:

1. **Verify rules are published**:
   - Firebase Console → Firestore → Rules tab
   - Should see the new rules with `match /messages/{messageId}`

2. **Check you're authenticated**:
   - Console: `firebase.auth().currentUser`
   - Should show your user object (not null)

3. **Test with Firebase console**:
   - Firestore → Data tab
   - Try manually adding a document to `rooms/streaming/messages`
   - If it fails, rules aren't published correctly

---

## Quick Start Checklist

- [ ] Replace Google Apps Script with v2 code
- [ ] Run `testTokenGeneration()` function (should pass ✅)
- [ ] Deploy new version (keep same URL)
- [ ] Update Firestore rules
- [ ] Publish Firestore rules
- [ ] Test token URL in browser
- [ ] Refresh room.html
- [ ] Check console for "Agora RTM connected"
- [ ] Send a test message
- [ ] Verify message appears

---

## Expected Final Console Output

```
✅ Firebase authenticated
✅ Room Firebase initialized
✅ Token server response: {success: true, token: "007eJxT...", ...}
✅ Token received successfully
✅ Logging in to Agora RTM with token
✅ RTM Client logging in as 714066***
✅ Agora RTM connected
```

If you see all green checkmarks, everything is working! 🎉

---

## Still Having Issues?

If after following all steps the chat still doesn't work:

1. **Share the console output** - take a screenshot of browser console
2. **Test the token URL** - what does `window.test()` show?
3. **Check Firestore rules** - screenshot of the rules tab
4. **Verify Script Properties** - screenshot (blur the certificate value!)

The Firebase fallback should work regardless, so you can use the chat via Firebase while debugging Agora!
