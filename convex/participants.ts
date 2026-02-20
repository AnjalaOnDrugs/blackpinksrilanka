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

    // NOTE: isOnline and lastSeen are no longer returned from this query.
    // Presence is now handled by Firebase Realtime Database (client-side merge).
    // This means heartbeat writes no longer invalidate this subscription.
    return participants.map((p) => ({
      id: p.phoneNumber,
      data: {
        username: p.username,
        joinedAt: p.joinedAt,
        lastfmUsername: p.lastfmUsername,
        totalMinutes: p.totalMinutes,
        totalPoints: p.totalPoints ?? 0,
        currentRank: p.currentRank,
        previousRank: p.previousRank,
        milestones: p.milestones,
        currentTrack: p.currentTrack ?? null,
        avatarColor: p.avatarColor,
        profilePicture: p.profilePicture ?? null,
        streakMinutes: p.streakMinutes,
        offlineTracking: p.offlineTracking ?? false,
        lastCheckIn: p.lastCheckIn ?? null,
        bonusPoints: p.bonusPoints ?? 0,
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
    // Look up user's profile picture from users table
    const userDoc = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();
    const profilePicture = userDoc?.profilePicture ?? undefined;

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
        lastfmUsername: args.lastfmUsername ?? existing.lastfmUsername,
        avatarColor: args.avatarColor,
        profilePicture: profilePicture,
      });
    } else {
      await ctx.db.insert("participants", {
        roomId: args.roomId,
        phoneNumber: args.phoneNumber,
        username: args.username,
        joinedAt: now,
        lastfmUsername: args.lastfmUsername ?? undefined,
        totalMinutes: 0,
        currentRank: 0,
        previousRank: 0,
        milestones: [],
        currentTrack: null,
        avatarColor: args.avatarColor,
        profilePicture: profilePicture,
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
        streakMinutes: keepTracking ? participant.streakMinutes : 0,
      });
    }
  },
});

// Heartbeat REMOVED — presence is now handled by Firebase Realtime Database.
// Firebase RTDB uses onDisconnect() for instant offline detection at the
// connection level. No polling/heartbeat mutations needed.

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
