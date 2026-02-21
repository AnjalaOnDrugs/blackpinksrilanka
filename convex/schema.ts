import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    phoneNumber: v.string(),
    username: v.optional(v.string()),
    otpCode: v.optional(v.string()),
    otpGeneratedAt: v.optional(v.number()),
    otpAttempts: v.optional(v.number()),
    authStage: v.optional(v.number()),
    lastfmUsername: v.optional(v.string()),
    registeredAt: v.optional(v.number()),
    avatarColor: v.optional(v.string()),
    district: v.optional(v.string()),
    districtLastChanged: v.optional(v.number()),
    bias: v.optional(v.string()),
    profilePicture: v.optional(v.string()),
    // Precise coordinates for Deck.gl heat map (stored only if user grants permission)
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  }).index("by_phone", ["phoneNumber"])
    .index("by_username", ["username"]),

  participants: defineTable({
    roomId: v.string(),
    phoneNumber: v.string(),
    username: v.string(),
    joinedAt: v.number(),
    lastfmUsername: v.optional(v.string()),
    totalMinutes: v.number(),
    totalPoints: v.optional(v.number()),
    currentRank: v.number(),
    previousRank: v.number(),
    milestones: v.array(v.number()),
    currentTrack: v.optional(
      v.union(
        v.null(),
        v.object({
          name: v.string(),
          artist: v.string(),
          albumArt: v.optional(v.string()),
          nowPlaying: v.boolean(),
          timestamp: v.optional(v.union(v.number(), v.null())),
        })
      )
    ),
    avatarColor: v.string(),
    profilePicture: v.optional(v.string()),
    streakMinutes: v.number(),
    offlineTracking: v.optional(v.boolean()),
    lastCheckIn: v.optional(v.number()),
    bonusPoints: v.optional(v.number()),
  }).index("by_room", ["roomId"])
    .index("by_room_phone", ["roomId", "phoneNumber"])
    .index("by_room_minutes", ["roomId", "totalMinutes"]),

  events: defineTable({
    roomId: v.string(),
    type: v.string(),
    data: v.any(),
    createdAt: v.number(),
  }).index("by_room", ["roomId"])
    .index("by_room_time", ["roomId", "createdAt"])
    .index("by_room_type", ["roomId", "type"]),

  messages: defineTable({
    roomId: v.string(),
    type: v.string(),
    userId: v.string(),
    username: v.string(),
    text: v.optional(v.union(v.string(), v.null())),
    emoji: v.optional(v.union(v.string(), v.null())),
    emojiName: v.optional(v.union(v.string(), v.null())),
    color: v.string(),
    createdAt: v.number(),
    timestamp: v.number(),
  }).index("by_room", ["roomId"])
    .index("by_room_time", ["roomId", "createdAt"]),

  // Stream counts: tracks validated streams per user per track
  // Platform-specific rules: YouTube (30s/60s, caps, interleave) vs Spotify (30s, interleave after 10)
  streamCounts: defineTable({
    roomId: v.string(),
    phoneNumber: v.string(),
    trackName: v.string(),
    trackArtist: v.string(),
    // Normalized key for matching (lowercase, stripped of tags)
    trackKey: v.string(),
    // "youtube", "spotify", or "other" - detected from album art + title markers
    platform: v.optional(v.string()),
    // Whether this is the main event song (e.g. "Kill This Love")
    isMainSong: v.optional(v.boolean()),
    // Timestamp when this stream was counted
    countedAt: v.number(),
    // How long they actually listened (in seconds) before we counted it
    listenDuration: v.number(),
  }).index("by_room", ["roomId"])
    .index("by_room_phone", ["roomId", "phoneNumber"])
    .index("by_room_track", ["roomId", "trackKey"])
    .index("by_room_phone_track", ["roomId", "phoneNumber", "trackKey"]),

  // Active listening sessions: tracks when a user started listening to a song
  // Used to validate the minimum listen time before counting a stream
  listeningSessions: defineTable({
    roomId: v.string(),
    phoneNumber: v.string(),
    trackName: v.string(),
    trackArtist: v.string(),
    trackKey: v.string(),
    // "youtube", "spotify", or "other"
    platform: v.optional(v.string()),
    // Last N track keys played by this user (for interleave validation)
    recentTrackKeys: v.optional(v.array(v.string())),
    // When the user started listening to this track
    startedAt: v.number(),
    // Whether this session has already been counted as a stream
    counted: v.boolean(),
  }).index("by_room_phone", ["roomId", "phoneNumber"]),

  listenAlongEvents: defineTable({
    roomId: v.string(),
    member: v.string(),
    songName: v.optional(v.string()),
    songArtist: v.optional(v.string()),
    participants: v.array(
      v.object({
        phoneNumber: v.string(),
        username: v.string(),
        avatarColor: v.string(),
        trackName: v.optional(v.string()),
        trackArtist: v.optional(v.string()),
        albumArt: v.optional(v.string()),
      })
    ),
    startedAt: v.number(),
    endsAt: v.number(),
    status: v.string(),
    pointsAwarded: v.optional(v.boolean()),
  })
    .index("by_room", ["roomId"])
    .index("by_room_status", ["roomId", "status"]),

  fillTheMapEvents: defineTable({
    roomId: v.string(),
    // The main song users must listen to
    songName: v.string(),
    songArtist: v.string(),
    // 3 chosen districts (from districts that have registered users)
    chosenDistricts: v.array(v.string()),
    // Filled districts: district → { phoneNumber, username, profilePicture, filledAt }
    filledDistricts: v.any(),
    startedAt: v.number(),
    endsAt: v.number(),
    status: v.string(), // "active" | "completed" | "failed" | "ended"
    pointsAwarded: v.optional(v.boolean()),
  })
    .index("by_room", ["roomId"])
    .index("by_room_status", ["roomId", "status"]),

  runPlaylistEvents: defineTable({
    roomId: v.string(),
    phoneNumber: v.string(),
    username: v.string(),
    songs: v.array(
      v.object({
        name: v.string(),
        artist: v.string(),
        status: v.string(), // "pending" | "active" | "completed"
        platform: v.optional(v.string()), // "spotify" | "youtube" | "other"
        listenedSeconds: v.optional(v.number()),
        requiredSeconds: v.optional(v.number()),
        listenStartedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
      })
    ),
    currentSongIndex: v.number(),
    startedAt: v.number(),
    status: v.string(), // "active" | "completed" | "quit"
    pointsAwarded: v.optional(v.boolean()),
  })
    .index("by_room_phone", ["roomId", "phoneNumber"])
    .index("by_room_phone_status", ["roomId", "phoneNumber", "status"]),

  rooms: defineTable({
    roomId: v.string(),
    name: v.string(),
    type: v.string(),
    createdAt: v.number(),
    currentMostPlayed: v.optional(
      v.object({
        track: v.string(),
        artist: v.string(),
        albumArt: v.optional(v.string()),
      })
    ),
  }).index("by_roomId", ["roomId"]),

  // Voice messages from top 5 players
  // Each user can have one active voice message at a time (replaced on new send)
  voiceMessages: defineTable({
    roomId: v.string(),
    phoneNumber: v.string(),
    username: v.string(),
    avatarColor: v.string(),
    // Base64-encoded audio data (WebM/Opus)
    audioData: v.string(),
    // Duration in seconds
    duration: v.number(),
    // When the message was sent
    createdAt: v.number(),
    // Rank at time of sending (1-5)
    rank: v.number(),
  }).index("by_room", ["roomId"])
    .index("by_room_phone", ["roomId", "phoneNumber"]),

  // Daily check-ins for calendar page
  checkins: defineTable({
    phoneNumber: v.string(),
    dateKey: v.string(),        // "YYYY-MM-DD" (Sri Lanka time)
    checkedInAt: v.number(),
  }).index("by_phone", ["phoneNumber"])
    .index("by_phone_date", ["phoneNumber", "dateKey"]),
});

