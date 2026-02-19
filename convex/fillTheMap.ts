import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_DURATION_MS = 180000; // 3 minutes
const DEFAULT_COOLDOWN_MS = 3600000; // 1 hour
const STALE_THRESHOLD_MS = 45000; // 45s heartbeat grace
const FILL_POINTS = 8; // Points awarded to all participants on success
const NUM_DISTRICTS = 3; // Number of districts chosen per event

// Start a Fill the Map event
// Picks 3 districts that have registered users, picks a random song
export const startFillTheMap = mutation({
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
      .query("fillTheMapEvents")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (recent && now - recent.startedAt < cooldownMs) {
      return null;
    }

    // Check 2+ online users (don't need to be from different districts)
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    const onlineCount = participants.filter(
      (p) => p.isOnline && now - p.lastSeen < STALE_THRESHOLD_MS
    ).length;

    if (onlineCount < 2) return null;

    // Get all unique districts from ALL participants (online + offline)
    // Offline users' districts are eligible to encourage online users to
    // call them back to the app to fill their district
    const districtSet = new Set<string>();
    for (const p of participants) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phoneNumber", p.phoneNumber))
        .first();
      if (user?.district) {
        districtSet.add(user.district);
      }
    }

    const availableDistricts = Array.from(districtSet);
    if (availableDistricts.length < NUM_DISTRICTS) return null; // Not enough districts represented

    // Randomly pick 3 districts
    const shuffled = availableDistricts.sort(() => Math.random() - 0.5);
    const chosenDistricts = shuffled.slice(0, NUM_DISTRICTS);

    const endsAt = now + durationMs;

    const eventId = await ctx.db.insert("fillTheMapEvents", {
      roomId: args.roomId,
      songName: args.songName,
      songArtist: args.songArtist,
      chosenDistricts,
      filledDistricts: {},
      startedAt: now,
      endsAt,
      status: "active",
    });

    // Broadcast start via events table
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "fill_map_start",
      data: {
        fillMapId: eventId,
        songName: args.songName,
        songArtist: args.songArtist,
        chosenDistricts,
        endsAt,
        duration: durationMs,
      },
      createdAt: now,
    });

    return eventId;
  },
});

// A user fills their district by listening to the main song
export const fillDistrict = mutation({
  args: {
    roomId: v.string(),
    fillMapId: v.id("fillTheMapEvents"),
    phoneNumber: v.string(),
    username: v.string(),
    profilePicture: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.fillMapId);
    if (!event || event.status !== "active") return null;
    if (Date.now() > event.endsAt) return null;

    // Look up the user's district
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (!user?.district) return null;

    // Check if this district is one of the chosen districts
    if (!event.chosenDistricts.includes(user.district)) return null;

    // Check if this district is already filled
    const filledDistricts = (event.filledDistricts || {}) as Record<
      string,
      { phoneNumber: string; username: string; profilePicture?: string; filledAt: number }
    >;
    if (filledDistricts[user.district]) return null; // Already filled

    // Fill the district
    filledDistricts[user.district] = {
      phoneNumber: args.phoneNumber,
      username: args.username,
      profilePicture: args.profilePicture,
      filledAt: Date.now(),
    };

    await ctx.db.patch(args.fillMapId, {
      filledDistricts,
    });

    // Broadcast fill event
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "fill_map_fill",
      data: {
        fillMapId: args.fillMapId,
        district: user.district,
        phoneNumber: args.phoneNumber,
        username: args.username,
        profilePicture: args.profilePicture,
      },
      createdAt: Date.now(),
    });

    // Check if all districts are now filled
    const filledCount = Object.keys(filledDistricts).length;
    if (filledCount >= event.chosenDistricts.length) {
      // All districts filled — trigger success!
      await completeFillTheMap(ctx, args.roomId, args.fillMapId);
    }

    return { district: user.district, filledCount, total: event.chosenDistricts.length };
  },
});

// Complete a Fill the Map event (all districts filled) — award points
async function completeFillTheMap(
  ctx: any,
  roomId: string,
  fillMapId: any
) {
  const event = await ctx.db.get(fillMapId);
  if (!event || event.pointsAwarded) return null;

  const filledDistricts = (event.filledDistricts || {}) as Record<
    string,
    { phoneNumber: string; username: string; profilePicture?: string; filledAt: number }
  >;

  // Collect all participants who filled a district
  const fillers = Object.values(filledDistricts);

  // Award points to each filler
  for (const filler of fillers) {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", roomId).eq("phoneNumber", filler.phoneNumber)
      )
      .first();

    if (participant) {
      await ctx.db.patch(participant._id, {
        bonusPoints: (participant.bonusPoints ?? 0) + FILL_POINTS,
        totalPoints: (participant.totalPoints ?? 0) + FILL_POINTS,
      });
    }
  }

  // Mark as completed
  await ctx.db.patch(fillMapId, {
    status: "completed",
    pointsAwarded: true,
  });

  // Broadcast completion
  await ctx.db.insert("events", {
    roomId,
    type: "fill_map_complete",
    data: {
      fillMapId,
      filledDistricts,
      pointsEach: FILL_POINTS,
      fillers: fillers.map((f) => ({
        phoneNumber: f.phoneNumber,
        username: f.username,
        profilePicture: f.profilePicture,
      })),
    },
    createdAt: Date.now(),
  });

  return { pointsEach: FILL_POINTS };
}

// End a Fill the Map event (time expired, not all districts filled)
export const endFillTheMap = mutation({
  args: {
    roomId: v.string(),
    fillMapId: v.id("fillTheMapEvents"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.fillMapId);
    if (!event || event.status !== "active") return null;

    const filledDistricts = (event.filledDistricts || {}) as Record<
      string,
      { phoneNumber: string; username: string; profilePicture?: string; filledAt: number }
    >;
    const filledCount = Object.keys(filledDistricts).length;

    // If all filled, complete with points instead
    if (filledCount >= event.chosenDistricts.length) {
      await completeFillTheMap(ctx, args.roomId, args.fillMapId);
      return { status: "completed" };
    }

    // Otherwise mark as failed (time ran out)
    await ctx.db.patch(args.fillMapId, {
      status: "failed",
    });

    // Broadcast failure
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "fill_map_failed",
      data: {
        fillMapId: args.fillMapId,
        filledDistricts,
        filledCount,
        total: event.chosenDistricts.length,
      },
      createdAt: Date.now(),
    });

    return { status: "failed", filledCount, total: event.chosenDistricts.length };
  },
});

// Get the currently active Fill the Map event (for late joiners)
export const getActiveFillTheMap = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("fillTheMapEvents")
      .withIndex("by_room_status", (q) =>
        q.eq("roomId", args.roomId).eq("status", "active")
      )
      .first();

    // Don't return stale events (30s grace after expiration)
    if (event && Date.now() > event.endsAt + 30000) {
      return null;
    }

    return event;
  },
});
