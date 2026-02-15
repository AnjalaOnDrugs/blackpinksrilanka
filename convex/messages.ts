import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Send a chat message
export const send = mutation({
  args: {
    roomId: v.string(),
    type: v.string(),
    userId: v.string(),
    username: v.string(),
    text: v.optional(v.union(v.string(), v.null())),
    emoji: v.optional(v.union(v.string(), v.null())),
    emojiName: v.optional(v.union(v.string(), v.null())),
    color: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      roomId: args.roomId,
      type: args.type,
      userId: args.userId,
      username: args.username,
      text: args.text ?? null,
      emoji: args.emoji ?? null,
      emojiName: args.emojiName ?? null,
      color: args.color,
      createdAt: Date.now(),
      timestamp: args.timestamp,
    });
  },
});

// Get recent messages (since a given timestamp)
export const listRecent = query({
  args: {
    roomId: v.string(),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_room_time", (q) =>
        q.eq("roomId", args.roomId).gt("createdAt", args.since)
      )
      .order("asc")
      .take(50);
  },
});
