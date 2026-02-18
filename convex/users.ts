import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get user by phone number
export const getByPhone = query({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();
  },
});

// Get user by username
export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
  },
});

// Create or update user with OTP
export const upsertWithOTP = mutation({
  args: {
    phoneNumber: v.string(),
    otpCode: v.string(),
    authStage: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        otpCode: args.otpCode,
        otpGeneratedAt: Date.now(),
        otpAttempts: 0,
        authStage: args.authStage,
      });
    } else {
      await ctx.db.insert("users", {
        phoneNumber: args.phoneNumber,
        otpCode: args.otpCode,
        otpGeneratedAt: Date.now(),
        otpAttempts: 0,
        authStage: args.authStage,
      });
    }
  },
});

// Verify OTP
export const verifyOTP = mutation({
  args: {
    phoneNumber: v.string(),
    enteredOTP: v.string(),
    maxAttempts: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (!user) {
      return {
        valid: false,
        attemptsRemaining: 0,
        message: "Session expired. Please start over.",
      };
    }

    const attempts = user.otpAttempts ?? 0;

    if (attempts >= args.maxAttempts) {
      return {
        valid: false,
        attemptsRemaining: 0,
        message: "Maximum attempts exceeded. Please request a new code.",
      };
    }

    if (args.enteredOTP === user.otpCode) {
      await ctx.db.patch(user._id, { authStage: 2 });
      return {
        valid: true,
        attemptsRemaining: args.maxAttempts - attempts,
        message: "OTP verified successfully",
      };
    } else {
      const newAttempts = attempts + 1;
      await ctx.db.patch(user._id, { otpAttempts: newAttempts });
      const remaining = args.maxAttempts - newAttempts;
      return {
        valid: false,
        attemptsRemaining: remaining,
        message:
          remaining > 0
            ? `Invalid verification code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
            : "Maximum attempts exceeded. Please request a new code.",
      };
    }
  },
});

// Complete registration
export const completeRegistration = mutation({
  args: {
    phoneNumber: v.string(),
    username: v.string(),
    district: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        username: args.username,
        registeredAt: Date.now(),
        authStage: 3,
        ...(args.district ? { district: args.district } : {}),
      });
    }
  },
});

// Update user district
export const updateDistrict = mutation({
  args: {
    phoneNumber: v.string(),
    district: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        district: args.district,
      });
    }
  },
});

// Update Last.fm username
export const updateLastfmUsername = mutation({
  args: {
    phoneNumber: v.string(),
    lastfmUsername: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        lastfmUsername: args.lastfmUsername,
      });
    }
  },
});
