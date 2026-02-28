import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { assertAdminAccess } from "./adminAuth";

// Helper: check if THE Hour is active for a room.
// Plain async function (NOT a mutation/query) — importable by other mutation files.
export async function getPointMultiplier(
  ctx: MutationCtx | QueryCtx,
  roomId: string
): Promise<number> {
  const activeEvent = await ctx.db
    .query("theHourEvents")
    .withIndex("by_room_active", (q) =>
      q.eq("roomId", roomId).eq("active", true)
    )
    .first();
  return activeEvent ? 2 : 1;
}

// Start THE Hour for a room (admin only)
export const startTheHour = mutation({
  args: {
    roomId: v.string(),
    actorPhone: v.string(),
    adminKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertAdminAccess(args);

    // Check if already active
    const existing = await ctx.db
      .query("theHourEvents")
      .withIndex("by_room_active", (q) =>
        q.eq("roomId", args.roomId).eq("active", true)
      )
      .first();

    if (existing) {
      return { alreadyActive: true, eventId: existing._id };
    }

    const eventId = await ctx.db.insert("theHourEvents", {
      roomId: args.roomId,
      startedAt: Date.now(),
      active: true,
      startedBy: args.actorPhone,
    });

    // Broadcast so room UI can react
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "the_hour_start",
      data: { theHourId: eventId },
      createdAt: Date.now(),
    });

    return { eventId };
  },
});

// End THE Hour for a room (admin only)
export const endTheHour = mutation({
  args: {
    roomId: v.string(),
    actorPhone: v.string(),
    adminKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertAdminAccess(args);

    const existing = await ctx.db
      .query("theHourEvents")
      .withIndex("by_room_active", (q) =>
        q.eq("roomId", args.roomId).eq("active", true)
      )
      .first();

    if (!existing) {
      return { wasActive: false };
    }

    await ctx.db.patch(existing._id, {
      active: false,
      endedAt: Date.now(),
    });

    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "the_hour_end",
      data: { theHourId: existing._id },
      createdAt: Date.now(),
    });

    return { wasActive: true };
  },
});

// Query: current THE Hour status (for UI subscription)
export const getTheHour = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("theHourEvents")
      .withIndex("by_room_active", (q) =>
        q.eq("roomId", args.roomId).eq("active", true)
      )
      .first();

    return event
      ? { active: true, startedAt: event.startedAt }
      : { active: false };
  },
});
