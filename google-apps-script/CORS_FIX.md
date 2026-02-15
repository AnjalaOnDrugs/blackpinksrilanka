# CORS Fix for Agora Token Server

## The Problem

Google Apps Script Web Apps don't support CORS (Cross-Origin Resource Sharing) properly, which caused the error:
```
Failed to fetch: No 'Access-Control-Allow-Origin' header is present
```

## The Solution: JSONP

We switched from `fetch()` API to **JSONP** (JSON with Padding), which bypasses CORS entirely by using `<script>` tags instead of XMLHttpRequest.

### How JSONP Works

1. **Client creates a callback function**:
   ```javascript
   window.agoraTokenCallback_123456 = function(data) {
     // Handle response
   }
   ```

2. **Client creates a script tag**:
   ```html
   <script src="https://your-script.com/exec?userId=123&callback=agoraTokenCallback_123456"></script>
   ```

3. **Server responds with JavaScript** (not JSON):
   ```javascript
   agoraTokenCallback_123456({"token": "abc123", "userId": "123"})
   ```

4. **Browser executes the script**, which calls the callback function with the data.

5. **No CORS needed** because `<script>` tags can load from any domain!

## Changes Made

### 1. Updated `agora-token-server.gs`
- Added `callback` parameter support in `doGet()`
- Modified `createResponse()` to return JSONP when callback is provided
- Response format changes based on callback:
  - **Without callback**: `{"token": "...", "userId": "..."}`
  - **With callback**: `callbackName({"token": "...", "userId": "..."})`

### 2. Updated `room-agora.js`
- Replaced `fetch()` with JSONP implementation
- Creates dynamic script tags to load tokens
- Includes timeout handling (10 seconds)
- Automatic cleanup after response

## Testing

### Test in Browser Console
```javascript
// This should work now (no CORS error)
var script = document.createElement('script');
script.src = 'YOUR_SCRIPT_URL?userId=94771234567&callback=test';
window.test = function(data) { console.log('Token:', data); };
document.body.appendChild(script);
```

### Test with the Tester Page
Open `test-token-locally.html` and it should work now without CORS errors!

## Important Notes

✅ **Advantages of JSONP**:
- No CORS issues
- Works with Google Apps Script out of the box
- Simple to implement
- Widely supported

⚠️ **Limitations of JSONP**:
- Only supports GET requests (not POST)
- Less secure than CORS (can't restrict domains)
- Callback function is exposed globally (briefly)

🔒 **Security**:
Since this is a token server, JSONP is acceptable because:
- Tokens are tied to specific user IDs
- Tokens expire after 24 hours
- App Certificate never leaves the server
- Anyone can request a token but needs a valid userId

## Deployment Steps

1. **Update your Google Apps Script** with the new `agora-token-server.gs` code
2. **Redeploy**:
   - Deploy > Manage deployments
   - Click ✏️ Edit on your existing deployment
   - Version: New version
   - Click Deploy
3. **No changes needed** to your config.js (same URL)
4. **Test**: Refresh room.html and check console

You should now see:
```
Logging in to Agora RTM with token
Agora RTM connected
```

## Alternative: Using a CORS Proxy (Not Recommended)

If you prefer to keep using `fetch()`, you could use a CORS proxy:
```javascript
var proxyUrl = 'https://cors-anywhere.herokuapp.com/';
fetch(proxyUrl + CONFIG.agoraTokenServerUrl + '?userId=' + userId)
```

**But this is NOT recommended** because:
- ❌ Adds dependency on third-party service
- ❌ Less reliable
- ❌ Privacy concerns (proxy sees all requests)
- ❌ Rate limiting issues

JSONP is the better solution for Google Apps Script! 🎉
