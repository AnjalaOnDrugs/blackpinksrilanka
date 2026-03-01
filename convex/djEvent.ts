import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertAdminAccess } from "./adminAuth";
import { getPointMultiplier } from "./theHour";

const SONGS_PER_DJ = 2;

// Helper: pick a random DJ from the pool who hasn't DJ'd yet
function pickNextDj(
  onlinePool: string[],
  djHistory: string[]
): string | null {
  const remaining = onlinePool.filter((p) => !djHistory.includes(p));
  if (remaining.length === 0) return null;
  return remaining[Math.floor(Math.random() * remaining.length)];
}

// Start a DJ event (admin only)
export const startDjEvent = mutation({
  args: {
    roomId: v.string(),
    onlinePhoneNumbers: v.array(v.string()),
    actorPhone: v.string(),
    adminKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertAdminAccess(args);

    // Check if already active
    const existing = await ctx.db
      .query("djEvents")
      .withIndex("by_room_status", (q) =>
        q.eq("roomId", args.roomId).eq("status", "active")
      )
      .first();

    if (existing) {
      return { alreadyActive: true, eventId: existing._id };
    }

    if (args.onlinePhoneNumbers.length === 0) {
      return { error: "No online users" };
    }

    const now = Date.now();

    // Look up user info for the first DJ
    const firstDjPhone = pickNextDj(args.onlinePhoneNumbers, []);
    if (!firstDjPhone) return { error: "No users available" };

    const djParticipant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", firstDjPhone)
      )
      .first();

    const djUsername = djParticipant?.username ?? "BLINK";
    const djAvatarColor =
      djParticipant?.avatarColor ?? "linear-gradient(135deg, #f7a6b9, #e8758a)";
    const djProfilePicture = djParticipant?.profilePicture;

    const eventId = await ctx.db.insert("djEvents", {
      roomId: args.roomId,
      currentDj: {
        phoneNumber: firstDjPhone,
        username: djUsername,
        avatarColor: djAvatarColor,
        profilePicture: djProfilePicture,
        selectedAt: now,
        roundNumber: 1,
      },
      djHistory: [firstDjPhone],
      votes: [],
      listeners: [],
      onlinePool: args.onlinePhoneNumbers,
      startedAt: now,
      status: "active",
    });

    // Broadcast start
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "dj_event_start",
      data: {
        djEventId: eventId,
        djPhoneNumber: firstDjPhone,
        djUsername,
        djAvatarColor,
        djProfilePicture,
        selectedAt: now,
        onlinePool: args.onlinePhoneNumbers,
        roundNumber: 1,
        songsPerDj: SONGS_PER_DJ,
      },
      createdAt: now,
    });

    return { eventId };
  },
});

// DJ's song detected — set the song for the current round
export const chooseSong = mutation({
  args: {
    roomId: v.string(),
    djEventId: v.id("djEvents"),
    phoneNumber: v.string(),
    songName: v.string(),
    songArtist: v.string(),
    albumArt: v.optional(v.string()),
    roundDurationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.djEventId);
    if (!event || event.status !== "active") return null;
    if (!event.currentDj) return null;
    if (event.currentDj.phoneNumber !== args.phoneNumber) return null;
    if (event.currentDj.songChosenAt) return null; // Already chosen

    const now = Date.now();
    const roundDuration = args.roundDurationMs ?? 120000; // 2 minutes
    const roundEndsAt = now + roundDuration;

    await ctx.db.patch(args.djEventId, {
      currentDj: {
        ...event.currentDj,
        song: {
          name: args.songName,
          artist: args.songArtist,
          albumArt: args.albumArt,
        },
        songChosenAt: now,
        roundEndsAt,
      },
    });

    // Broadcast song chosen
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "dj_song_chosen",
      data: {
        djEventId: args.djEventId,
        djPhoneNumber: event.currentDj.phoneNumber,
        djUsername: event.currentDj.username,
        songName: args.songName,
        songArtist: args.songArtist,
        albumArt: args.albumArt,
        roundEndsAt,
      },
      createdAt: now,
    });

    return { roundEndsAt };
  },
});

// Non-DJ user detected playing the song — award listener points
export const joinAsListener = mutation({
  args: {
    roomId: v.string(),
    djEventId: v.id("djEvents"),
    phoneNumber: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.djEventId);
    if (!event || event.status !== "active") return null;
    if (!event.currentDj || !event.currentDj.song) return null;

    // Don't let the DJ join as listener
    if (event.currentDj.phoneNumber === args.phoneNumber) return null;

    // Prevent duplicate joins
    const alreadyListening = event.listeners.some(
      (l) => l.phoneNumber === args.phoneNumber
    );
    if (alreadyListening) return null;

    // Award 2 points × multiplier
    const multiplier = await getPointMultiplier(ctx, args.roomId);
    const points = 2 * multiplier;

    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant) {
      await ctx.db.patch(participant._id, {
        bonusPoints: (participant.bonusPoints ?? 0) + points,
        totalPoints: (participant.totalPoints ?? 0) + points,
      });
    }

    // Add to listeners
    await ctx.db.patch(args.djEventId, {
      listeners: [
        ...event.listeners,
        { phoneNumber: args.phoneNumber, username: args.username },
      ],
    });

    // Broadcast
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "dj_listener_join",
      data: {
        djEventId: args.djEventId,
        phoneNumber: args.phoneNumber,
        username: args.username,
        points,
      },
      createdAt: Date.now(),
    });

    return { points };
  },
});

// Vote thumbs up/down for the current DJ (one per user per round)
export const voteDj = mutation({
  args: {
    roomId: v.string(),
    djEventId: v.id("djEvents"),
    phoneNumber: v.string(),
    vote: v.string(), // "up" | "down"
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.djEventId);
    if (!event || event.status !== "active") return null;
    if (!event.currentDj) return null;

    // DJ can't vote for themselves
    if (event.currentDj.phoneNumber === args.phoneNumber) return null;

    // One vote per user per round
    const alreadyVoted = event.votes.some(
      (v) => v.phoneNumber === args.phoneNumber
    );
    if (alreadyVoted) return null;

    await ctx.db.patch(args.djEventId, {
      votes: [
        ...event.votes,
        { phoneNumber: args.phoneNumber, vote: args.vote },
      ],
    });

    // Broadcast
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "dj_vote",
      data: {
        djEventId: args.djEventId,
        voterPhoneNumber: args.phoneNumber,
        vote: args.vote,
        totalUp: event.votes.filter((v) => v.vote === "up").length +
          (args.vote === "up" ? 1 : 0),
        totalDown: event.votes.filter((v) => v.vote === "down").length +
          (args.vote === "down" ? 1 : 0),
      },
      createdAt: Date.now(),
    });

    return true;
  },
});

// End the current DJ's round — award DJ points, pick next DJ or end event
export const endRound = mutation({
  args: {
    roomId: v.string(),
    djEventId: v.id("djEvents"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.djEventId);
    if (!event || event.status !== "active") return null;
    if (!event.currentDj) return null;

    const now = Date.now();
    const multiplier = await getPointMultiplier(ctx, args.roomId);

    // Award DJ points from thumbs-up votes
    const thumbsUp = event.votes.filter((v) => v.vote === "up").length;
    const djPoints = thumbsUp * 1 * multiplier;

    if (djPoints > 0) {
      const djParticipant = await ctx.db
        .query("participants")
        .withIndex("by_room_phone", (q) =>
          q
            .eq("roomId", args.roomId)
            .eq("phoneNumber", event.currentDj!.phoneNumber)
        )
        .first();

      if (djParticipant) {
        await ctx.db.patch(djParticipant._id, {
          bonusPoints: (djParticipant.bonusPoints ?? 0) + djPoints,
          totalPoints: (djParticipant.totalPoints ?? 0) + djPoints,
        });
      }
    }

    const roundSummary = {
      djPhoneNumber: event.currentDj.phoneNumber,
      djUsername: event.currentDj.username,
      song: event.currentDj.song,
      thumbsUp,
      thumbsDown: event.votes.filter((v) => v.vote === "down").length,
      djPoints,
      listenerCount: event.listeners.length,
    };

    // Broadcast round end
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "dj_round_end",
      data: { djEventId: args.djEventId, ...roundSummary },
      createdAt: now,
    });

    // Check if current DJ has more songs to play
    const currentRound = event.currentDj.roundNumber ?? 1;

    if (currentRound < SONGS_PER_DJ) {
      // Same DJ, next song — reset round state but keep the DJ
      const nextRound = currentRound + 1;

      await ctx.db.patch(args.djEventId, {
        currentDj: {
          ...event.currentDj,
          song: undefined,
          songChosenAt: undefined,
          roundEndsAt: undefined,
          selectedAt: now,
          roundNumber: nextRound,
        },
        votes: [],
        listeners: [],
      });

      // Broadcast as new round for the same DJ
      await ctx.db.insert("events", {
        roomId: args.roomId,
        type: "dj_new_dj",
        data: {
          djEventId: args.djEventId,
          djPhoneNumber: event.currentDj.phoneNumber,
          djUsername: event.currentDj.username,
          djAvatarColor: event.currentDj.avatarColor,
          djProfilePicture: event.currentDj.profilePicture,
          selectedAt: now,
          remaining:
            event.onlinePool.length - event.djHistory.length,
          roundNumber: nextRound,
          songsPerDj: SONGS_PER_DJ,
        },
        createdAt: now,
      });

      return { ended: false, nextDj: event.currentDj.username, roundSummary };
    }

    // DJ finished all songs — pick next DJ
    const nextDjPhone = pickNextDj(event.onlinePool, event.djHistory);

    if (!nextDjPhone) {
      // All DJs exhausted — end the event
      await ctx.db.patch(args.djEventId, {
        currentDj: undefined,
        votes: [],
        listeners: [],
        status: "ended",
      });

      await ctx.db.insert("events", {
        roomId: args.roomId,
        type: "dj_event_end",
        data: { djEventId: args.djEventId, reason: "all_done" },
        createdAt: now,
      });

      return { ended: true, roundSummary };
    }

    // Look up next DJ info
    const nextParticipant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", nextDjPhone)
      )
      .first();

    const nextDj = {
      phoneNumber: nextDjPhone,
      username: nextParticipant?.username ?? "BLINK",
      avatarColor:
        nextParticipant?.avatarColor ??
        "linear-gradient(135deg, #f7a6b9, #e8758a)",
      profilePicture: nextParticipant?.profilePicture,
      selectedAt: now,
      roundNumber: 1,
    };

    await ctx.db.patch(args.djEventId, {
      currentDj: nextDj,
      djHistory: [...event.djHistory, nextDjPhone],
      votes: [],
      listeners: [],
    });

    // Broadcast new DJ
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "dj_new_dj",
      data: {
        djEventId: args.djEventId,
        djPhoneNumber: nextDj.phoneNumber,
        djUsername: nextDj.username,
        djAvatarColor: nextDj.avatarColor,
        djProfilePicture: nextDj.profilePicture,
        selectedAt: now,
        remaining:
          event.onlinePool.length - event.djHistory.length - 1,
        roundNumber: 1,
        songsPerDj: SONGS_PER_DJ,
      },
      createdAt: now,
    });

    return { ended: false, nextDj: nextDj.username, roundSummary };
  },
});

// Skip current DJ (1-min timeout expired without song)
export const skipDj = mutation({
  args: {
    roomId: v.string(),
    djEventId: v.id("djEvents"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.djEventId);
    if (!event || event.status !== "active") return null;
    if (!event.currentDj) return null;
    // Only skip if no song was chosen
    if (event.currentDj.songChosenAt) return null;

    const now = Date.now();

    // Broadcast skip
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "dj_skip",
      data: {
        djEventId: args.djEventId,
        djPhoneNumber: event.currentDj.phoneNumber,
        djUsername: event.currentDj.username,
      },
      createdAt: now,
    });

    // Pick next DJ
    const nextDjPhone = pickNextDj(event.onlinePool, event.djHistory);

    if (!nextDjPhone) {
      await ctx.db.patch(args.djEventId, {
        currentDj: undefined,
        votes: [],
        listeners: [],
        status: "ended",
      });

      await ctx.db.insert("events", {
        roomId: args.roomId,
        type: "dj_event_end",
        data: { djEventId: args.djEventId, reason: "all_done" },
        createdAt: now,
      });

      return { ended: true };
    }

    const nextParticipant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", nextDjPhone)
      )
      .first();

    const nextDj = {
      phoneNumber: nextDjPhone,
      username: nextParticipant?.username ?? "BLINK",
      avatarColor:
        nextParticipant?.avatarColor ??
        "linear-gradient(135deg, #f7a6b9, #e8758a)",
      profilePicture: nextParticipant?.profilePicture,
      selectedAt: now,
      roundNumber: 1,
    };

    await ctx.db.patch(args.djEventId, {
      currentDj: nextDj,
      djHistory: [...event.djHistory, nextDjPhone],
      votes: [],
      listeners: [],
    });

    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "dj_new_dj",
      data: {
        djEventId: args.djEventId,
        djPhoneNumber: nextDj.phoneNumber,
        djUsername: nextDj.username,
        djAvatarColor: nextDj.avatarColor,
        djProfilePicture: nextDj.profilePicture,
        selectedAt: now,
        remaining:
          event.onlinePool.length - event.djHistory.length - 1,
        roundNumber: 1,
        songsPerDj: SONGS_PER_DJ,
      },
      createdAt: now,
    });

    return { ended: false, nextDj: nextDj.username };
  },
});

// Admin force-end the DJ event
export const endDjEvent = mutation({
  args: {
    roomId: v.string(),
    actorPhone: v.string(),
    adminKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertAdminAccess(args);

    const event = await ctx.db
      .query("djEvents")
      .withIndex("by_room_status", (q) =>
        q.eq("roomId", args.roomId).eq("status", "active")
      )
      .first();

    if (!event) return { wasActive: false };

    await ctx.db.patch(event._id, {
      currentDj: undefined,
      status: "ended",
    });

    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "dj_event_end",
      data: { djEventId: event._id, reason: "admin" },
      createdAt: Date.now(),
    });

    return { wasActive: true };
  },
});

// Query: active DJ event for a room (for subscription / late joiners)
export const getActiveDjEvent = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("djEvents")
      .withIndex("by_room_status", (q) =>
        q.eq("roomId", args.roomId).eq("status", "active")
      )
      .first();
  },
});
