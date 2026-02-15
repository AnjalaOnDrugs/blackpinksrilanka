/**
 * Export Firestore data to JSONL files for Convex import
 *
 * Prerequisites:
 * 1. Download your Firebase service account key:
 *    - Go to Firebase Console > Project Settings > Service Accounts
 *    - Click "Generate new private key"
 *    - Save the JSON file as "serviceAccountKey.json" in the project root
 *
 * Usage:
 *   node scripts/export-firestore-to-convex.js
 *
 * This will create:
 *   - data/users.jsonl
 *   - data/rooms.jsonl
 *   - data/participants.jsonl
 *   - data/events.jsonl
 *   - data/messages.jsonl
 *
 * Then import into Convex:
 *   npx convex import --table users data/users.jsonl
 *   npx convex import --table rooms data/rooms.jsonl
 *   npx convex import --table participants data/participants.jsonl
 *   npx convex import --table events data/events.jsonl
 *   npx convex import --table messages data/messages.jsonl
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load service account key
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('\n ERROR: serviceAccountKey.json not found!\n');
  console.error(' To get it:');
  console.error(' 1. Go to Firebase Console > Project Settings > Service Accounts');
  console.error(' 2. Click "Generate new private key"');
  console.error(' 3. Save the file as "serviceAccountKey.json" in the project root\n');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const outputDir = path.join(__dirname, '..', 'data');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Helper: Convert Firestore Timestamp to milliseconds
function timestampToMs(val) {
  if (!val) return null;
  if (val._seconds !== undefined) return val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1000000);
  if (val.seconds !== undefined) return val.seconds * 1000;
  if (val.toMillis) return val.toMillis();
  if (typeof val === 'number') return val;
  return null;
}

// Helper: Write array of objects to JSONL file
function writeJsonl(filename, records) {
  const filePath = path.join(outputDir, filename);
  const lines = records.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(filePath, lines + '\n');
  console.log(`  Written ${records.length} records to data/${filename}`);
}

async function exportUsers() {
  console.log('\n Exporting users...');
  const snapshot = await db.collection('users').get();
  const records = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    records.push({
      phoneNumber: doc.id,
      username: data.username || undefined,
      otpCode: data.otpCode || undefined,
      otpGeneratedAt: timestampToMs(data.otpGeneratedAt) || undefined,
      otpAttempts: data.otpAttempts || undefined,
      authStage: data.authStage || undefined,
      lastfmUsername: data.lastfmUsername || undefined,
      registeredAt: timestampToMs(data.registeredAt) || undefined,
      avatarColor: data.avatarColor || undefined,
    });
  });

  writeJsonl('users.jsonl', records);
  return records.length;
}

async function exportRooms() {
  console.log('\n Exporting rooms...');
  const snapshot = await db.collection('rooms').get();
  const records = [];
  const roomIds = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    roomIds.push(doc.id);
    records.push({
      roomId: doc.id,
      name: data.name || 'Streaming Party',
      type: data.type || 'streaming',
      createdAt: timestampToMs(data.createdAt) || Date.now(),
      currentMostPlayed: data.currentMostPlayed || undefined,
    });
  });

  writeJsonl('rooms.jsonl', records);
  return roomIds;
}

async function exportParticipants(roomIds) {
  console.log('\n Exporting participants...');
  const records = [];

  for (const roomId of roomIds) {
    const snapshot = await db.collection('rooms').doc(roomId).collection('participants').get();

    snapshot.forEach(doc => {
      const data = doc.data();
      records.push({
        roomId: roomId,
        phoneNumber: doc.id,
        username: data.username || 'BLINK',
        joinedAt: timestampToMs(data.joinedAt) || Date.now(),
        lastSeen: timestampToMs(data.lastSeen) || Date.now(),
        isOnline: data.isOnline || false,
        lastfmUsername: data.lastfmUsername || undefined,
        totalMinutes: data.totalMinutes || 0,
        currentRank: data.currentRank || 0,
        previousRank: data.previousRank || 0,
        milestones: data.milestones || [],
        currentTrack: data.currentTrack || null,
        avatarColor: data.avatarColor || 'linear-gradient(135deg, #f7a6b9, #e8758a)',
        streakMinutes: data.streakMinutes || 0,
      });
    });
  }

  writeJsonl('participants.jsonl', records);
  return records.length;
}

async function exportEvents(roomIds) {
  console.log('\n Exporting events...');
  const records = [];

  for (const roomId of roomIds) {
    const snapshot = await db.collection('rooms').doc(roomId).collection('events')
      .orderBy('createdAt', 'desc')
      .limit(500)  // Only recent events
      .get();

    snapshot.forEach(doc => {
      const data = doc.data();
      records.push({
        roomId: roomId,
        type: data.type || 'unknown',
        data: data.data || {},
        createdAt: timestampToMs(data.createdAt) || Date.now(),
      });
    });
  }

  writeJsonl('events.jsonl', records);
  return records.length;
}

async function exportMessages(roomIds) {
  console.log('\n Exporting messages...');
  const records = [];

  for (const roomId of roomIds) {
    const snapshot = await db.collection('rooms').doc(roomId).collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(500)  // Only recent messages
      .get();

    snapshot.forEach(doc => {
      const data = doc.data();
      records.push({
        roomId: roomId,
        type: data.type || 'message',
        userId: data.userId || '',
        username: data.username || 'Anon',
        text: data.text || null,
        emoji: data.emoji || null,
        emojiName: data.emojiName || null,
        color: data.color || 'linear-gradient(135deg, #f7a6b9, #e8758a)',
        createdAt: timestampToMs(data.createdAt) || Date.now(),
        timestamp: data.timestamp || Date.now(),
      });
    });
  }

  writeJsonl('messages.jsonl', records);
  return records.length;
}

// Main
async function main() {
  console.log('========================================');
  console.log(' Firestore -> Convex Data Export');
  console.log('========================================');

  try {
    const userCount = await exportUsers();
    const roomIds = await exportRooms();
    const participantCount = await exportParticipants(roomIds);
    const eventCount = await exportEvents(roomIds);
    const messageCount = await exportMessages(roomIds);

    console.log('\n========================================');
    console.log(' Export Complete!');
    console.log('========================================');
    console.log(`  Users:        ${userCount}`);
    console.log(`  Rooms:        ${roomIds.length}`);
    console.log(`  Participants: ${participantCount}`);
    console.log(`  Events:       ${eventCount}`);
    console.log(`  Messages:     ${messageCount}`);
    console.log('\n Now run these commands to import into Convex:\n');
    console.log('  npx convex import --table users data/users.jsonl');
    console.log('  npx convex import --table rooms data/rooms.jsonl');
    console.log('  npx convex import --table participants data/participants.jsonl');
    console.log('  npx convex import --table events data/events.jsonl');
    console.log('  npx convex import --table messages data/messages.jsonl');
    console.log('');

  } catch (error) {
    console.error('\n Export failed:', error.message);
    console.error(error);
  }

  process.exit(0);
}

main();
