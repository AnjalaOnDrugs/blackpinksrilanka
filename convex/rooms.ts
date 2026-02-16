import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Ensure room exists (idempotent)
export const ensureRoom = mutation({
  args: {
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!existing) {
      await ctx.db.insert("rooms", {
        roomId: args.roomId,
        name: "Streaming Party",
        type: "streaming",
        createdAt: Date.now(),
      });
    }
  },
});

// Get room document
export const getRoom = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();
  },
});
