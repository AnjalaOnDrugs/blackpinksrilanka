import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ALWAYS_ALLOWED_PHONES } from "./adminAuth";

// Ensure room exists (idempotent)
export const ensureRoom = mutation({
  args: {
    roomId: v.string(),
    name: v.optional(v.string()),
    restricted: v.optional(v.boolean()),
    allowedUsers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!existing) {
      await ctx.db.insert("rooms", {
        roomId: args.roomId,
        name: args.name || "Streaming Party",
        type: "streaming",
        createdAt: Date.now(),
        restricted: args.restricted,
        allowedUsers: args.allowedUsers,
      });
    } else if (args.allowedUsers !== undefined) {
      await ctx.db.patch(existing._id, {
        allowedUsers: args.allowedUsers,
        ...(args.restricted !== undefined ? { restricted: args.restricted } : {}),
      });
    }
  },
});

// List rooms visible to a user (public + restricted rooms user has access to)
export const listVisibleRooms = query({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const allRooms = await ctx.db.query("rooms").collect();
    const isAdmin = ALWAYS_ALLOWED_PHONES.includes(args.phoneNumber);

    return allRooms
      .filter((room) => {
        if (!room.restricted) return true;
        if (isAdmin) return true;
        return room.allowedUsers?.includes(args.phoneNumber) ?? false;
      })
      .map((room) => ({
        roomId: room.roomId,
        name: room.name,
        type: room.type,
        restricted: room.restricted ?? false,
      }));
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
