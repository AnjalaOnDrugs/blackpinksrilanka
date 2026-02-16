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
  }).index("by_phone", ["phoneNumber"])
    .index("by_username", ["username"]),

  participants: defineTable({
    roomId: v.string(),
    phoneNumber: v.string(),
    username: v.string(),
    joinedAt: v.number(),
    lastSeen: v.number(),
    isOnline: v.boolean(),
    lastfmUsername: v.optional(v.string()),
    totalMinutes: v.number(),
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
    streakMinutes: v.number(),
    offlineTracking: v.optional(v.boolean()),
    lastCheckIn: v.optional(v.number()),
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
});
