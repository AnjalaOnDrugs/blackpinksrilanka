# Google Apps Script Files

This folder contains serverless backend functions for the BLACKPINK Sri Lanka website.

## Files

### `agora-token-server.gs`
**Purpose**: Generate Agora RTM authentication tokens for secure chat access.

**Features**:
- Generates Agora RTM tokens using HMAC-SHA256 signing
- 24-hour token expiration
- Supports both GET and POST requests
- CORS-friendly JSON responses

**Setup**: See [AGORA_TOKEN_SETUP.md](./AGORA_TOKEN_SETUP.md)

**API Endpoints**:
```
GET  /exec?userId=<phone_number>
POST /exec
  Body: { "userId": "<phone_number>" }
```

**Response**:
```json
{
  "token": "007eJxT...",
  "userId": "1234567890",
  "expiresIn": 86400
}
```

---

### Existing Scripts

Your other Google Apps Scripts are deployed elsewhere:
- **OTP & Member Verification**: `https://script.google.com/macros/s/AKfycbxgDmwP423ZUe42lavvOMOBthAgzQHXh0QFjXbQ6t8Q-CFPkvetxeb6K1Uxg5TDqvgr/exec`

## Deployment Notes

Each `.gs` file should be deployed as a **separate** Google Apps Script project:

1. Go to https://script.google.com
2. Create a **New project** for each script
3. Copy the `.gs` file contents
4. Configure script properties as needed
5. Deploy as Web App
6. Copy the deployment URL to your `config.js`

## Security Best Practices

✅ **DO**:
- Keep App Certificates in Script Properties (never in code)
- Set "Execute as: Me" in deployment settings
- Use "Anyone" access only for public-facing endpoints
- Validate input parameters
- Return proper error messages

❌ **DON'T**:
- Hardcode sensitive credentials in scripts
- Commit deployment URLs with write access to public repos
- Use GET requests for sensitive operations (prefer POST)
- Expose internal error details to clients

## Testing

Each script includes a `test*` function you can run directly in the Apps Script editor to verify configuration before deployment.

Example:
```javascript
function testTokenGeneration() {
  // Run this in Apps Script editor to verify setup
}
```

## Support

For issues with Google Apps Script deployment or configuration, check:
- [Apps Script Documentation](https://developers.google.com/apps-script)
- [Agora Token Server Guide](https://docs.agora.io/en/video-calling/develop/authentication-workflow)
