import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Fire an event (with optional dedup for same_song)
export const fireEvent = mutation({
  args: {
    roomId: v.string(),
    type: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Dedup same_song events (30s cooldown)
    if (args.type === "same_song") {
      const recent = await ctx.db
        .query("events")
        .withIndex("by_room_type", (q) =>
          q.eq("roomId", args.roomId).eq("type", "same_song")
        )
        .order("desc")
        .first();

      if (recent && now - recent.createdAt < 30000) {
        return null;
      }
    }

    return await ctx.db.insert("events", {
      roomId: args.roomId,
      type: args.type,
      data: args.data,
      createdAt: now,
    });
  },
});

// Send a bong (poke) to another user with rate limiting
export const sendBong = mutation({
  args: {
    roomId: v.string(),
    senderPhoneNumber: v.string(),
    senderUsername: v.string(),
    senderAvatarColor: v.string(),
    targetPhoneNumber: v.string(),
    targetUsername: v.string(),
    targetAvatarColor: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Rate limit: 30s cooldown per sender→target pair
    const recent = await ctx.db
      .query("events")
      .withIndex("by_room_type", (q) =>
        q.eq("roomId", args.roomId).eq("type", "bong")
      )
      .order("desc")
      .first();

    if (
      recent &&
      now - recent.createdAt < 30000 &&
      recent.data?.senderPhoneNumber === args.senderPhoneNumber &&
      recent.data?.targetPhoneNumber === args.targetPhoneNumber
    ) {
      return null;
    }

    return await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "bong",
      data: {
        senderPhoneNumber: args.senderPhoneNumber,
        senderUsername: args.senderUsername,
        senderAvatarColor: args.senderAvatarColor,
        targetPhoneNumber: args.targetPhoneNumber,
        targetUsername: args.targetUsername,
        targetAvatarColor: args.targetAvatarColor,
      },
      createdAt: now,
    });
  },
});

// Send a bong-back (counter poke) with rate limiting
export const sendBongBack = mutation({
  args: {
    roomId: v.string(),
    senderPhoneNumber: v.string(),
    senderUsername: v.string(),
    senderAvatarColor: v.string(),
    targetPhoneNumber: v.string(),
    targetUsername: v.string(),
    targetAvatarColor: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Rate limit: 30s cooldown per sender→target pair for bong-back
    const recent = await ctx.db
      .query("events")
      .withIndex("by_room_type", (q) =>
        q.eq("roomId", args.roomId).eq("type", "bong_back")
      )
      .order("desc")
      .first();

    if (
      recent &&
      now - recent.createdAt < 30000 &&
      recent.data?.senderPhoneNumber === args.senderPhoneNumber &&
      recent.data?.targetPhoneNumber === args.targetPhoneNumber
    ) {
      return null;
    }

    return await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "bong_back",
      data: {
        senderPhoneNumber: args.senderPhoneNumber,
        senderUsername: args.senderUsername,
        senderAvatarColor: args.senderAvatarColor,
        targetPhoneNumber: args.targetPhoneNumber,
        targetUsername: args.targetUsername,
        targetAvatarColor: args.targetAvatarColor,
      },
      createdAt: now,
    });
  },
});

// Get recent events (latest 25)
export const listRecent = query({
  args: {
    roomId: v.string(),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const events = args.since != null
      ? await ctx.db
        .query("events")
        .withIndex("by_room_time", (q) =>
          q.eq("roomId", args.roomId).gt("createdAt", args.since as number)
        )
        // IMPORTANT: use latest-window semantics so watch subscriptions
        // continue to include newly arriving events after the first 25.
        .order("desc")
        .take(25)
      : await ctx.db
        .query("events")
        .withIndex("by_room_time", (q) => q.eq("roomId", args.roomId))
        .order("desc")
        .take(25);

    // Return in ascending order for the client animation queue.
    return events.reverse();
  },
});

// Get the latest victory_screen event for a room (used for locked-room replay)
// Enriches with fresh profile pictures from the users table.
export const getLatestVictory = query({
  args: {
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_room_type", (q) =>
        q.eq("roomId", args.roomId).eq("type", "victory_screen")
      )
      .order("desc")
      .first();
    if (!event?.data) return null;

    const data = event.data as any;
    const top10 = Array.isArray(data.top10) ? data.top10 : [];

    // Fetch current profile pictures for top10 users.
    // Unlike the stored event, we can include data URLs here since this is
    // a query result (not persisted), so size limits don't apply.
    const profilePicByPhone: Record<string, string> = {};
    for (const entry of top10) {
      if (!entry.phoneNumber) continue;
      const user = await ctx.db
        .query("users")
        .withIndex("by_phone", (q: any) => q.eq("phoneNumber", entry.phoneNumber))
        .first();
      const pic = user?.profilePicture;
      if (typeof pic === "string" && pic.trim()) {
        profilePicByPhone[entry.phoneNumber] = pic.trim();
      }
    }

    // Enrich top10 entries with fresh profile pictures
    const enrichedTop10 = top10.map((entry: any) => ({
      ...entry,
      profilePicture: profilePicByPhone[entry.phoneNumber] || entry.profilePicture || null,
    }));

    return {
      ...data,
      top10: enrichedTop10,
      profilePicByPhone,
    };
  },
});
