import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_DURATION_MS = 180000; // 3 minutes
const DEFAULT_COOLDOWN_MS = 3600000; // 1 hour

// Start a listen-along event (server-side dedup + online check)
export const startListenAlong = mutation({
  args: {
    roomId: v.string(),
    songName: v.string(),
    songArtist: v.string(),
    cooldownMs: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cooldownMs = Math.max(0, args.cooldownMs ?? DEFAULT_COOLDOWN_MS);
    const durationMs = Math.max(1000, args.durationMs ?? DEFAULT_DURATION_MS);

    // Dedup: reject if last event was less than cooldown ago
    const recent = await ctx.db
      .query("listenAlongEvents")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (recent && now - recent.startedAt < cooldownMs) {
      return null;
    }

    // Check 2+ active users (presence is handled by Firebase RTDB on the client;
    // server-side we use nowPlaying tracks as a proxy for active engagement).
    // The client already verifies 2+ online users before calling this mutation.
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    const activeCount = participants.filter(
      (p) => p.currentTrack && (p.currentTrack as any).nowPlaying
    ).length;

    if (activeCount < 2) return null;

    // Pick random BLACKPINK member
    const members = ["Jisoo", "Jennie", "Rosé", "Lisa"];
    const member = members[Math.floor(Math.random() * members.length)];

    const endsAt = now + durationMs;

    // Create the listen-along event record
    const eventId = await ctx.db.insert("listenAlongEvents", {
      roomId: args.roomId,
      member,
      songName: args.songName,
      songArtist: args.songArtist,
      participants: [],
      startedAt: now,
      endsAt,
      status: "active",
    });

    // Broadcast start via events table
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "listen_along_start",
      data: {
        listenAlongId: eventId,
        member,
        songName: args.songName,
        songArtist: args.songArtist,
        endsAt,
        duration: durationMs,
      },
      createdAt: now,
    });

    return eventId;
  },
});

// Join a listen-along event
export const joinListenAlong = mutation({
  args: {
    roomId: v.string(),
    listenAlongId: v.id("listenAlongEvents"),
    phoneNumber: v.string(),
    username: v.string(),
    avatarColor: v.string(),
    trackName: v.optional(v.string()),
    trackArtist: v.optional(v.string()),
    albumArt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.listenAlongId);
    if (!event || event.status !== "active") return null;
    if (Date.now() > event.endsAt) return null;

    // Prevent duplicate joins
    const alreadyJoined = event.participants.some(
      (p) => p.phoneNumber === args.phoneNumber
    );
    if (alreadyJoined) return null;

    // Append participant with track info
    await ctx.db.patch(args.listenAlongId, {
      participants: [
        ...event.participants,
        {
          phoneNumber: args.phoneNumber,
          username: args.username,
          avatarColor: args.avatarColor,
          trackName: args.trackName,
          trackArtist: args.trackArtist,
          albumArt: args.albumArt,
        },
      ],
    });

    // Broadcast join
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "listen_along_join",
      data: {
        listenAlongId: args.listenAlongId,
        phoneNumber: args.phoneNumber,
        username: args.username,
        avatarColor: args.avatarColor,
        trackName: args.trackName,
        trackArtist: args.trackArtist,
        albumArt: args.albumArt,
      },
      createdAt: Date.now(),
    });

    return true;
  },
});

// End a listen-along event and award points
export const endListenAlong = mutation({
  args: {
    roomId: v.string(),
    listenAlongId: v.id("listenAlongEvents"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.listenAlongId);
    if (!event || event.status !== "active") return null;
    if (event.pointsAwarded) return null;

    const participantCount = event.participants.length;
    const pointsEach = participantCount;

    // Award points to each participant
    for (const p of event.participants) {
      const participant = await ctx.db
        .query("participants")
        .withIndex("by_room_phone", (q) =>
          q.eq("roomId", args.roomId).eq("phoneNumber", p.phoneNumber)
        )
        .first();

      if (participant) {
        await ctx.db.patch(participant._id, {
          bonusPoints: (participant.bonusPoints ?? 0) + pointsEach,
          totalPoints: (participant.totalPoints ?? 0) + pointsEach,
        });
      }
    }

    // Mark as ended
    await ctx.db.patch(args.listenAlongId, {
      status: "ended",
      pointsAwarded: true,
    });

    // Broadcast end
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "listen_along_end",
      data: {
        listenAlongId: args.listenAlongId,
        participants: event.participants,
        pointsEach: participantCount,
      },
      createdAt: Date.now(),
    });

    return { pointsEach: participantCount, participantCount };
  },
});

// Get the currently active listen-along for a room (for late joiners)
export const getActiveListenAlong = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("listenAlongEvents")
      .withIndex("by_room_status", (q) =>
        q.eq("roomId", args.roomId).eq("status", "active")
      )
      .first();

    // Also check if it hasn't expired (in case end wasn't called yet)
    if (event && Date.now() > event.endsAt + 30000) {
      // 30s grace — don't return stale events
      return null;
    }

    return event;
  },
});
