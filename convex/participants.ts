import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all participants for a room (sorted by totalMinutes desc)
export const listByRoom = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Sort by totalPoints descending (fallback to totalMinutes for legacy)
    participants.sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0) || b.totalMinutes - a.totalMinutes);

    return participants.map((p) => ({
      id: p.phoneNumber,
      data: {
        username: p.username,
        joinedAt: p.joinedAt,
        lastSeen: p.lastSeen,
        isOnline: p.isOnline,
        lastfmUsername: p.lastfmUsername,
        totalMinutes: p.totalMinutes,
        totalPoints: p.totalPoints ?? 0,
        currentRank: p.currentRank,
        previousRank: p.previousRank,
        milestones: p.milestones,
        currentTrack: p.currentTrack ?? null,
        avatarColor: p.avatarColor,
        streakMinutes: p.streakMinutes,
        offlineTracking: p.offlineTracking ?? false,
        lastCheckIn: p.lastCheckIn ?? null,
      },
    }));
  },
});

// Join room (upsert participant)
export const joinRoom = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    username: v.string(),
    lastfmUsername: v.optional(v.string()),
    avatarColor: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        username: args.username,
        lastSeen: now,
        isOnline: true,
        lastfmUsername: args.lastfmUsername ?? existing.lastfmUsername,
        avatarColor: args.avatarColor,
      });
    } else {
      await ctx.db.insert("participants", {
        roomId: args.roomId,
        phoneNumber: args.phoneNumber,
        username: args.username,
        joinedAt: now,
        lastSeen: now,
        isOnline: true,
        lastfmUsername: args.lastfmUsername ?? undefined,
        totalMinutes: 0,
        currentRank: 0,
        previousRank: 0,
        milestones: [],
        currentTrack: null,
        avatarColor: args.avatarColor,
        streakMinutes: 0,
      });
    }
  },
});

// Leave room
export const leaveRoom = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant) {
      // If offline tracking is enabled (checked in), keep tracking but mark offline
      // If not, behave as before — stop tracking entirely
      const keepTracking = participant.offlineTracking === true;
      await ctx.db.patch(participant._id, {
        isOnline: false,
        lastSeen: Date.now(),
        streakMinutes: keepTracking ? participant.streakMinutes : 0,
      });
    }
  },
});

// Heartbeat + optional track update (combined to reduce writes)
export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant) {
      await ctx.db.patch(participant._id, {
        lastSeen: Date.now(),
      });
    }
  },
});

// Update track with change detection (only writes if track actually changed)
export const updateTrack = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    trackData: v.union(
      v.null(),
      v.object({
        name: v.string(),
        artist: v.string(),
        albumArt: v.optional(v.string()),
        nowPlaying: v.boolean(),
        timestamp: v.optional(v.union(v.number(), v.null())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (!participant) return { changed: false, wasIdle: false };

    const prevTrack = participant.currentTrack;

    // Check if track actually changed
    if (args.trackData === null && prevTrack === null) {
      return { changed: false, wasIdle: true };
    }

    if (args.trackData === null) {
      await ctx.db.patch(participant._id, {
        currentTrack: null,
        lastSeen: Date.now(),
      });
      return { changed: true, wasIdle: true };
    }

    const trackChanged =
      !prevTrack ||
      prevTrack.name !== args.trackData.name ||
      prevTrack.artist !== args.trackData.artist ||
      prevTrack.nowPlaying !== args.trackData.nowPlaying;

    if (trackChanged) {
      await ctx.db.patch(participant._id, {
        currentTrack: args.trackData,
        lastSeen: Date.now(),
      });
    }

    const wasIdle = !prevTrack || !prevTrack.nowPlaying;

    return { changed: trackChanged, wasIdle };
  },
});

// Update total minutes
export const updateMinutes = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    totalMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant) {
      await ctx.db.patch(participant._id, {
        totalMinutes: args.totalMinutes,
      });
    }
  },
});

// Update Last.fm username
export const updateLastfmUsername = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    lastfmUsername: v.string(),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant) {
      await ctx.db.patch(participant._id, {
        lastfmUsername: args.lastfmUsername,
      });
    }
  },
});

// Check in for offline tracking (resets the hourly timer)
export const checkIn = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant) {
      await ctx.db.patch(participant._id, {
        offlineTracking: true,
        lastCheckIn: Date.now(),
        lastSeen: Date.now(),
      });
    }

    return { success: !!participant };
  },
});

// Disable offline tracking (check-in expired or user opted out)
export const disableOfflineTracking = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant) {
      await ctx.db.patch(participant._id, {
        offlineTracking: false,
      });
    }
  },
});

// Add milestone with dedup
export const addMilestone = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    milestone: v.number(),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant && !participant.milestones.includes(args.milestone)) {
      await ctx.db.patch(participant._id, {
        milestones: [...participant.milestones, args.milestone],
      });
    }
  },
});
