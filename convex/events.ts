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

// Get recent events (since a given timestamp)
export const listRecent = query({
  args: {
    roomId: v.string(),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      .withIndex("by_room_time", (q) =>
        q.eq("roomId", args.roomId).gt("createdAt", args.since)
      )
      .order("asc")
      .collect();
  },
});
