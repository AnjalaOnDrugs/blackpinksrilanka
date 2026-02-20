import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_COOLDOWN_MS = 3600000; // 1 hour
const PLAYLIST_POINTS = 5;
const NUM_SONGS = 4;

// Start a Run the Playlist event for a specific user.
// Personal event — per-USER cooldown (not per-room).
export const startRunPlaylist = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    username: v.string(),
    songs: v.array(
      v.object({
        name: v.string(),
        artist: v.string(),
      })
    ),
    cooldownMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cooldownMs = Math.max(0, args.cooldownMs ?? DEFAULT_COOLDOWN_MS);

    // Reject if this user already has an active event
    const activeEvent = await ctx.db
      .query("runPlaylistEvents")
      .withIndex("by_room_phone_status", (q) =>
        q
          .eq("roomId", args.roomId)
          .eq("phoneNumber", args.phoneNumber)
          .eq("status", "active")
      )
      .first();

    if (activeEvent) return null;

    // Per-user cooldown check
    const recent = await ctx.db
      .query("runPlaylistEvents")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .order("desc")
      .first();

    if (recent && now - recent.startedAt < cooldownMs) {
      return null;
    }

    if (args.songs.length !== NUM_SONGS) return null;

    // Build song entries — first song is active, rest are pending
    const songs = args.songs.map((s, i) => ({
      name: s.name,
      artist: s.artist,
      status: i === 0 ? "active" : "pending",
      platform: undefined as string | undefined,
      listenedSeconds: 0,
      requiredSeconds: undefined as number | undefined,
      listenStartedAt: undefined as number | undefined,
      completedAt: undefined as number | undefined,
    }));

    const eventId = await ctx.db.insert("runPlaylistEvents", {
      roomId: args.roomId,
      phoneNumber: args.phoneNumber,
      username: args.username,
      songs,
      currentSongIndex: 0,
      startedAt: now,
      status: "active",
    });

    // Personal event — no broadcast via events table
    return eventId;
  },
});

// Advance to the next song after current song's listen requirement is met.
export const advanceSong = mutation({
  args: {
    runPlaylistId: v.id("runPlaylistEvents"),
    phoneNumber: v.string(),
    songIndex: v.number(),
    platform: v.string(),
    listenedSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.runPlaylistId);
    if (!event || event.status !== "active") return null;
    if (event.phoneNumber !== args.phoneNumber) return null;
    if (args.songIndex !== event.currentSongIndex) return null;

    const songs = [...event.songs];
    const currentSong = songs[args.songIndex];
    if (!currentSong || currentSong.status !== "active") return null;

    const requiredSeconds = args.platform === "youtube" ? 60 : 30;
    if (args.listenedSeconds < requiredSeconds) return null;

    // Mark current song as completed
    songs[args.songIndex] = {
      ...currentSong,
      status: "completed",
      platform: args.platform,
      listenedSeconds: args.listenedSeconds,
      requiredSeconds,
      completedAt: Date.now(),
    };

    const nextIndex = args.songIndex + 1;

    // Activate next song if available
    if (nextIndex < songs.length) {
      songs[nextIndex] = {
        ...songs[nextIndex],
        status: "active",
      };
    }

    await ctx.db.patch(args.runPlaylistId, {
      songs,
      currentSongIndex: nextIndex,
    });

    // All songs completed — award points
    if (nextIndex >= songs.length) {
      return await awardPoints(
        ctx,
        event.roomId,
        args.runPlaylistId,
        args.phoneNumber
      );
    }

    return { nextIndex, songsRemaining: songs.length - nextIndex };
  },
});

// Internal helper to award points on full completion
async function awardPoints(
  ctx: any,
  roomId: string,
  runPlaylistId: any,
  phoneNumber: string
) {
  const event = await ctx.db.get(runPlaylistId);
  if (!event || event.pointsAwarded) return null;

  const participant = await ctx.db
    .query("participants")
    .withIndex("by_room_phone", (q) =>
      q.eq("roomId", roomId).eq("phoneNumber", phoneNumber)
    )
    .first();

  if (participant) {
    await ctx.db.patch(participant._id, {
      bonusPoints: (participant.bonusPoints ?? 0) + PLAYLIST_POINTS,
      totalPoints: (participant.totalPoints ?? 0) + PLAYLIST_POINTS,
    });
  }

  await ctx.db.patch(runPlaylistId, {
    status: "completed",
    pointsAwarded: true,
  });

  return { pointsAwarded: PLAYLIST_POINTS };
}

// User manually quits — no points awarded.
export const endRunPlaylist = mutation({
  args: {
    runPlaylistId: v.id("runPlaylistEvents"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.runPlaylistId);
    if (!event || event.status !== "active") return null;
    if (event.phoneNumber !== args.phoneNumber) return null;

    await ctx.db.patch(args.runPlaylistId, {
      status: "quit",
    });

    return { status: "quit" };
  },
});

// Periodic heartbeat to persist listen progress server-side (handles page refresh).
export const updateListenProgress = mutation({
  args: {
    runPlaylistId: v.id("runPlaylistEvents"),
    phoneNumber: v.string(),
    songIndex: v.number(),
    platform: v.string(),
    listenedSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.runPlaylistId);
    if (!event || event.status !== "active") return null;
    if (event.phoneNumber !== args.phoneNumber) return null;
    if (args.songIndex !== event.currentSongIndex) return null;

    const songs = [...event.songs];
    const currentSong = songs[args.songIndex];
    if (!currentSong || currentSong.status !== "active") return null;

    const requiredSeconds = args.platform === "youtube" ? 60 : 30;

    songs[args.songIndex] = {
      ...currentSong,
      platform: args.platform,
      listenedSeconds: args.listenedSeconds,
      requiredSeconds,
      listenStartedAt: currentSong.listenStartedAt || Date.now(),
    };

    await ctx.db.patch(args.runPlaylistId, { songs });
    return true;
  },
});

// Get the user's currently active Run the Playlist event (for page refresh recovery).
export const getActiveRunPlaylist = query({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("runPlaylistEvents")
      .withIndex("by_room_phone_status", (q) =>
        q
          .eq("roomId", args.roomId)
          .eq("phoneNumber", args.phoneNumber)
          .eq("status", "active")
      )
      .first();

    return event;
  },
});
