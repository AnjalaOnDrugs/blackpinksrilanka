import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// 10 minute cooldown between voice messages
const VOICE_COOLDOWN_MS = 10 * 60 * 1000;
// Max audio size: ~500KB base64 (covers ~30s of compressed audio)
const MAX_AUDIO_SIZE = 700000;
// Max recording duration in seconds
const MAX_DURATION = 30;

/**
 * Send a voice message (top 5 only).
 * Replaces the user's previous message if one exists.
 */
export const send = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    username: v.string(),
    avatarColor: v.string(),
    audioData: v.string(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate audio size
    if (args.audioData.length > MAX_AUDIO_SIZE) {
      throw new Error("Audio data too large");
    }

    // Validate duration
    if (args.duration > MAX_DURATION || args.duration <= 0) {
      throw new Error("Invalid audio duration");
    }

    // Check if user is in top 5
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    participants.sort((a, b) => b.totalMinutes - a.totalMinutes);

    const userIndex = participants.findIndex(
      (p) => p.phoneNumber === args.phoneNumber
    );

    if (userIndex === -1 || userIndex >= 5) {
      throw new Error("Only top 5 players can send voice messages");
    }

    const rank = userIndex + 1;

    // Check cooldown — find user's existing voice message
    const existing = await ctx.db
      .query("voiceMessages")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (existing) {
      const timeSince = now - existing.createdAt;
      if (timeSince < VOICE_COOLDOWN_MS) {
        const remainingSec = Math.ceil(
          (VOICE_COOLDOWN_MS - timeSince) / 1000
        );
        throw new Error(
          `Cooldown active. Wait ${Math.ceil(remainingSec / 60)} more minute(s).`
        );
      }
      // Delete old message (will be replaced)
      await ctx.db.delete(existing._id);
    }

    // Insert new voice message
    await ctx.db.insert("voiceMessages", {
      roomId: args.roomId,
      phoneNumber: args.phoneNumber,
      username: args.username,
      avatarColor: args.avatarColor,
      audioData: args.audioData,
      duration: args.duration,
      createdAt: now,
      rank: rank,
    });
  },
});

/**
 * List active voice messages for a room.
 * Decoupled from participants table to avoid reactive cascades.
 * Rank is validated at send time; at most 5 messages exist at once.
 */
export const listByRoom = query({
  args: {
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    // Only reads voiceMessages table — no participants dependency.
    // This prevents heartbeat/track-update writes from invalidating this query.
    const messages = await ctx.db
      .query("voiceMessages")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Return without audioData to keep the subscription lightweight
    return messages
      .map((m) => ({
        _id: m._id,
        phoneNumber: m.phoneNumber,
        username: m.username,
        avatarColor: m.avatarColor,
        duration: m.duration,
        createdAt: m.createdAt,
        rank: m.rank,
      }))
      .sort((a, b) => a.rank - b.rank);
  },
});

/**
 * Get the audio data for a specific voice message.
 * Called on-demand when a user clicks to play.
 */
export const getAudio = query({
  args: {
    messageId: v.id("voiceMessages"),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return null;
    return { audioData: msg.audioData };
  },
});

/**
 * @deprecated No longer subscribed to by clients — cooldown is computed client-side
 * from listByRoom data (message.createdAt + VOICE_COOLDOWN_MS).
 * Kept for backward compatibility only. Safe to remove once all clients are updated.
 *
 * Previous issue: This query used Date.now() which prevented Convex from caching
 * results deterministically, causing excessive re-evaluations and ~1.2 GB bandwidth.
 */
export const canSend = query({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("voiceMessages")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    let cooldownRemaining = 0;
    if (existing) {
      const timeSince = now - existing.createdAt;
      if (timeSince < VOICE_COOLDOWN_MS) {
        cooldownRemaining = VOICE_COOLDOWN_MS - timeSince;
      }
    }

    return {
      canSend: cooldownRemaining === 0,
      cooldownRemaining: cooldownRemaining,
    };
  },
});
