import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_COOLDOWN_MS = 7200000; // 2 hours

const MEMBERS = ["jisoo", "jennie", "rose", "lisa"] as const;

// Helper: create an empty lane
function emptyLane() {
  return { streams: 0, participants: [] };
}

// Start a vroom race event (server-side dedup)
export const startVroom = mutation({
  args: {
    roomId: v.string(),
    onlineCount: v.number(),
    cooldownMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cooldownMs = Math.max(0, args.cooldownMs ?? DEFAULT_COOLDOWN_MS);

    // Dedup: reject if last event was less than cooldown ago
    const recent = await ctx.db
      .query("vroomEvents")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (recent && now - recent.startedAt < cooldownMs) {
      return null;
    }

    // Must have 2+ online users
    if (args.onlineCount < 2) return null;

    // Target = onlineUsers × 3
    const target = Math.max(3, args.onlineCount * 3);

    // Create vroom event with empty lanes
    const eventId = await ctx.db.insert("vroomEvents", {
      roomId: args.roomId,
      target,
      lanes: {
        jisoo: emptyLane(),
        jennie: emptyLane(),
        rose: emptyLane(),
        lisa: emptyLane(),
      },
      startedAt: now,
      status: "active",
    });

    // Broadcast start via events table
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "vroom_start",
      data: {
        vroomId: eventId,
        target,
        startedAt: now,
      },
      createdAt: now,
    });

    return eventId;
  },
});

// Join a vroom lane
export const joinVroom = mutation({
  args: {
    roomId: v.string(),
    vroomId: v.id("vroomEvents"),
    phoneNumber: v.string(),
    username: v.string(),
    avatarColor: v.string(),
    profilePicture: v.optional(v.string()),
    member: v.string(), // "jisoo" | "jennie" | "rose" | "lisa"
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.vroomId);
    if (!event || event.status !== "active") return null;

    // Validate member
    if (!MEMBERS.includes(args.member as any)) return null;

    // Prevent duplicate joins across ALL lanes
    const lanes = event.lanes as any;
    for (const m of MEMBERS) {
      if (lanes[m].participants.some((p: any) => p.phoneNumber === args.phoneNumber)) {
        return null; // Already joined
      }
    }

    // Add to the correct lane
    const updatedLane = {
      ...lanes[args.member],
      participants: [
        ...lanes[args.member].participants,
        {
          phoneNumber: args.phoneNumber,
          username: args.username,
          avatarColor: args.avatarColor,
          profilePicture: args.profilePicture,
        },
      ],
    };

    await ctx.db.patch(args.vroomId, {
      lanes: {
        ...lanes,
        [args.member]: updatedLane,
      },
    });

    // Broadcast join
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "vroom_join",
      data: {
        vroomId: args.vroomId,
        member: args.member,
        phoneNumber: args.phoneNumber,
        username: args.username,
        avatarColor: args.avatarColor,
        profilePicture: args.profilePicture,
      },
      createdAt: Date.now(),
    });

    return true;
  },
});

// Add a validated stream to a member's lane
export const addVroomStream = mutation({
  args: {
    roomId: v.string(),
    vroomId: v.id("vroomEvents"),
    member: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.vroomId);
    if (!event || event.status !== "active") return null;

    // Validate member
    if (!MEMBERS.includes(args.member as any)) return null;

    const lanes = event.lanes as any;

    // User must be a participant in this lane
    const isParticipant = lanes[args.member].participants.some(
      (p: any) => p.phoneNumber === args.phoneNumber
    );
    if (!isParticipant) return null;

    // Increment stream count
    const newStreams = lanes[args.member].streams + 1;
    const updatedLane = {
      ...lanes[args.member],
      streams: newStreams,
    };

    const updatedLanes = {
      ...lanes,
      [args.member]: updatedLane,
    };

    // Check win condition
    if (newStreams >= event.target) {
      // This member wins!
      await ctx.db.patch(args.vroomId, {
        lanes: updatedLanes,
        status: "finished",
        winner: args.member,
      });

      // Award points
      await awardVroomPoints(ctx, args.roomId, args.vroomId, updatedLanes, args.member);

      // Broadcast finish
      await ctx.db.insert("events", {
        roomId: args.roomId,
        type: "vroom_finish",
        data: {
          vroomId: args.vroomId,
          winner: args.member,
          lanes: updatedLanes,
          target: event.target,
        },
        createdAt: Date.now(),
      });

      return { finished: true, winner: args.member };
    }

    // Not finished yet — update and broadcast progress
    await ctx.db.patch(args.vroomId, {
      lanes: updatedLanes,
    });

    // Broadcast progress
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "vroom_progress",
      data: {
        vroomId: args.vroomId,
        member: args.member,
        streams: {
          jisoo: updatedLanes.jisoo.streams,
          jennie: updatedLanes.jennie.streams,
          rose: updatedLanes.rose.streams,
          lisa: updatedLanes.lisa.streams,
        },
        target: event.target,
      },
      createdAt: Date.now(),
    });

    return { finished: false, streams: newStreams };
  },
});

// Helper: award points to all participants
async function awardVroomPoints(
  ctx: any,
  roomId: string,
  vroomId: any,
  lanes: any,
  winner: string
) {
  const BASE_POINTS = 3;
  const BONUS_POINTS = 5;

  for (const member of MEMBERS) {
    const isWinner = member === winner;
    const points = isWinner ? BASE_POINTS + BONUS_POINTS : BASE_POINTS;

    for (const p of lanes[member].participants) {
      const participant = await ctx.db
        .query("participants")
        .withIndex("by_room_phone", (q: any) =>
          q.eq("roomId", roomId).eq("phoneNumber", p.phoneNumber)
        )
        .first();

      if (participant) {
        await ctx.db.patch(participant._id, {
          bonusPoints: (participant.bonusPoints ?? 0) + points,
          totalPoints: (participant.totalPoints ?? 0) + points,
        });
      }
    }
  }

  // Mark as awarded
  await ctx.db.patch(vroomId, {
    pointsAwarded: true,
  });
}

// Get the currently active vroom event for a room (late joiners)
export const getActiveVroom = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vroomEvents")
      .withIndex("by_room_status", (q) =>
        q.eq("roomId", args.roomId).eq("status", "active")
      )
      .first();
  },
});
