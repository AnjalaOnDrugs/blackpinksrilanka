import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_COOLDOWN_MS = 3600000; // 1 hour
const RED_GREEN_POINTS = 4;
const NUM_STEPS = 4;

// The fixed platform order: YouTube (red), Spotify (green), YouTube, Spotify
const STEP_PLATFORMS = ["youtube", "spotify", "youtube", "spotify"];

// Start a Red Green event for a specific user.
// Personal event — per-USER cooldown (not per-room).
export const startRedGreen = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    username: v.string(),
    songName: v.string(),
    songArtist: v.string(),
    cooldownMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cooldownMs = Math.max(0, args.cooldownMs ?? DEFAULT_COOLDOWN_MS);

    // Reject if this user already has an active event
    const activeEvent = await ctx.db
      .query("redGreenEvents")
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
      .query("redGreenEvents")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .order("desc")
      .first();

    if (recent && now - recent.startedAt < cooldownMs) {
      return null;
    }

    // Build steps — first step is active, rest are pending
    const steps = STEP_PLATFORMS.map((platform, i) => ({
      platform,
      status: i === 0 ? "active" : "pending",
      listenedSeconds: 0,
      requiredSeconds: platform === "youtube" ? 60 : 30,
      completedAt: undefined as number | undefined,
    }));

    const eventId = await ctx.db.insert("redGreenEvents", {
      roomId: args.roomId,
      phoneNumber: args.phoneNumber,
      username: args.username,
      songName: args.songName,
      songArtist: args.songArtist,
      steps,
      currentStepIndex: 0,
      startedAt: now,
      status: "active",
    });

    return eventId;
  },
});

// Advance to the next step after current step's listen requirement is met.
export const advanceStep = mutation({
  args: {
    redGreenId: v.id("redGreenEvents"),
    phoneNumber: v.string(),
    stepIndex: v.number(),
    listenedSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.redGreenId);
    if (!event || event.status !== "active") return null;
    if (event.phoneNumber !== args.phoneNumber) return null;
    if (args.stepIndex !== event.currentStepIndex) return null;

    const steps = [...event.steps];
    const currentStep = steps[args.stepIndex];
    if (!currentStep || currentStep.status !== "active") return null;

    const requiredSeconds = currentStep.platform === "youtube" ? 60 : 30;
    if (args.listenedSeconds < requiredSeconds) return null;

    // Mark current step as completed
    steps[args.stepIndex] = {
      ...currentStep,
      status: "completed",
      listenedSeconds: args.listenedSeconds,
      requiredSeconds,
      completedAt: Date.now(),
    };

    const nextIndex = args.stepIndex + 1;

    // Activate next step if available
    if (nextIndex < steps.length) {
      steps[nextIndex] = {
        ...steps[nextIndex],
        status: "active",
      };
    }

    await ctx.db.patch(args.redGreenId, {
      steps,
      currentStepIndex: nextIndex,
    });

    // All steps completed — award points
    if (nextIndex >= steps.length) {
      return await awardPoints(
        ctx,
        event.roomId,
        args.redGreenId,
        args.phoneNumber
      );
    }

    return { nextIndex, stepsRemaining: steps.length - nextIndex };
  },
});

// Internal helper to award points on full completion
async function awardPoints(
  ctx: any,
  roomId: string,
  redGreenId: any,
  phoneNumber: string
) {
  const event = await ctx.db.get(redGreenId);
  if (!event || event.pointsAwarded) return null;

  const participant = await ctx.db
    .query("participants")
    .withIndex("by_room_phone", (q) =>
      q.eq("roomId", roomId).eq("phoneNumber", phoneNumber)
    )
    .first();

  if (participant) {
    await ctx.db.patch(participant._id, {
      bonusPoints: (participant.bonusPoints ?? 0) + RED_GREEN_POINTS,
      totalPoints: (participant.totalPoints ?? 0) + RED_GREEN_POINTS,
    });
  }

  await ctx.db.patch(redGreenId, {
    status: "completed",
    pointsAwarded: true,
  });

  return { pointsAwarded: RED_GREEN_POINTS };
}

// User manually quits — no points awarded.
export const endRedGreen = mutation({
  args: {
    redGreenId: v.id("redGreenEvents"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.redGreenId);
    if (!event || event.status !== "active") return null;
    if (event.phoneNumber !== args.phoneNumber) return null;

    await ctx.db.patch(args.redGreenId, {
      status: "quit",
    });

    return { status: "quit" };
  },
});

// Periodic heartbeat to persist listen progress server-side (handles page refresh).
export const updateListenProgress = mutation({
  args: {
    redGreenId: v.id("redGreenEvents"),
    phoneNumber: v.string(),
    stepIndex: v.number(),
    listenedSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.redGreenId);
    if (!event || event.status !== "active") return null;
    if (event.phoneNumber !== args.phoneNumber) return null;
    if (args.stepIndex !== event.currentStepIndex) return null;

    const steps = [...event.steps];
    const currentStep = steps[args.stepIndex];
    if (!currentStep || currentStep.status !== "active") return null;

    steps[args.stepIndex] = {
      ...currentStep,
      listenedSeconds: args.listenedSeconds,
    };

    await ctx.db.patch(args.redGreenId, { steps });
    return true;
  },
});

// Get the user's currently active Red Green event (for page refresh recovery).
export const getActiveRedGreen = query({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("redGreenEvents")
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
