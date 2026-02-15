/**
 * Agora RTM Token Server - Vercel Serverless Function
 * 
 * Generates Agora RTM tokens using the official agora-token package.
 * Deploy on Vercel as a serverless function at /api/agora-token
 * 
 * Environment variables required:
 *   AGORA_APP_ID - Your Agora App ID
 *   AGORA_APP_CERTIFICATE - Your Agora App Certificate (Primary Certificate)
 */

const { RtmTokenBuilder } = require('agora-token');

module.exports = (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow GET and POST
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get parameters from query string (GET) or body (POST)
    const userId = req.query.userId || (req.body && req.body.userId);
    const channelName = req.query.channelName || (req.body && req.body.channelName);

    // Validate userId
    if (!userId) {
        return res.status(400).json({
            success: false,
            error: 'userId parameter is required'
        });
    }

    // Get Agora credentials from environment variables
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
        console.error('Missing Agora credentials in environment variables');
        return res.status(500).json({
            success: false,
            error: 'Server configuration error: Missing Agora credentials'
        });
    }

    try {
        // Token expiration: 24 hours (in seconds)
        const expirationTimeInSeconds = 86400;

        // Build RTM token using the official Agora SDK
        // agora-token v2.x API: buildToken(appId, appCertificate, userId, expire)
        const token = RtmTokenBuilder.buildToken(
            appId,
            appCertificate,
            String(userId),
            expirationTimeInSeconds
        );

        console.log(`Token generated for userId: ${userId}, channel: ${channelName || 'N/A'}`);

        return res.status(200).json({
            success: true,
            token: token,
            userId: String(userId),
            expiresIn: expirationTimeInSeconds
        });

    } catch (error) {
        console.error('Token generation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate token: ' + error.message
        });
    }
};
