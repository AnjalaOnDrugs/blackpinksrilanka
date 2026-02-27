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

// Get profile pictures for a set of phone numbers.
// Returned as a flat array to keep client-side merge simple.
export const getProfilePictures = query({
  args: {
    phoneNumbers: v.array(v.string()),
    roomId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const unique = [...new Set(args.phoneNumbers)].slice(0, 300);
    const out: Array<{ phoneNumber: string; profilePicture: string | null }> = [];

    for (const phoneNumber of unique) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phoneNumber", phoneNumber))
        .first();
      out.push({
        phoneNumber,
        profilePicture: user?.profilePicture ?? null,
      });
    }

    return out;
  },
});

// One-time migration utility:
// copy legacy participants.profilePicture into users.profilePicture.
export const migrateProfilePicturesFromParticipants = mutation({
  args: {
    roomId: v.optional(v.string()),
    overwriteExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const overwrite = args.overwriteExisting === true;
    const participants = args.roomId
      ? await ctx.db
        .query("participants")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId as string))
        .collect()
      : await ctx.db.query("participants").collect();

    const phoneToPicture: Record<string, string> = {};
    for (const p of participants) {
      if (p.profilePicture) {
        // Keep first seen per phone number.
        if (!phoneToPicture[p.phoneNumber]) {
          phoneToPicture[p.phoneNumber] = p.profilePicture;
        }
      }
    }

    let patched = 0;
    let inserted = 0;
    let skipped = 0;

    for (const phoneNumber of Object.keys(phoneToPicture)) {
      const profilePicture = phoneToPicture[phoneNumber];
      const user = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phoneNumber", phoneNumber))
        .first();

      if (!user) {
        await ctx.db.insert("users", {
          phoneNumber,
          profilePicture,
        });
        inserted++;
        continue;
      }

      if (user.profilePicture && !overwrite) {
        skipped++;
        continue;
      }

      if (user.profilePicture !== profilePicture) {
        await ctx.db.patch(user._id, { profilePicture });
        patched++;
      } else {
        skipped++;
      }
    }

    return {
      roomId: args.roomId ?? null,
      participantsScanned: participants.length,
      usersWithLegacyPictures: Object.keys(phoneToPicture).length,
      patched,
      inserted,
      skipped,
      overwriteExisting: overwrite,
    };
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
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
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
        ...(args.lat != null ? { lat: args.lat } : {}),
        ...(args.lng != null ? { lng: args.lng } : {}),
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

// Update precise coordinates (opt-in for Deck.gl heat map)
export const updateCoordinates = mutation({
  args: {
    phoneNumber: v.string(),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        lat: args.lat,
        lng: args.lng,
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

// Update username
export const updateUsername = mutation({
  args: {
    phoneNumber: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if the new username is already taken by another user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (!currentUser) {
      return { success: false, message: "User not found" };
    }

    if (existingUser && existingUser._id !== currentUser._id) {
      return { success: false, message: "Username is already taken" };
    }

    await ctx.db.patch(currentUser._id, {
      username: args.username,
    });
    return { success: true, message: "Username updated successfully" };
  },
});

// Update bias (BLACKPINK member)
export const updateBias = mutation({
  args: {
    phoneNumber: v.string(),
    bias: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        bias: args.bias,
      });
    }
  },
});

// Update profile picture (base64 data URL)
export const updateProfilePicture = mutation({
  args: {
    phoneNumber: v.string(),
    profilePicture: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        profilePicture: args.profilePicture,
      });
    }
  },
});

// Update district (with monthly restriction)
export const updateDistrictMonthly = mutation({
  args: {
    phoneNumber: v.string(),
    district: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Check if district was changed in the last 30 days
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (user.districtLastChanged && (Date.now() - user.districtLastChanged) < thirtyDaysMs) {
      const nextChangeDate = new Date(user.districtLastChanged + thirtyDaysMs);
      return {
        success: false,
        message: `You can change your district again after ${nextChangeDate.toLocaleDateString()}`,
      };
    }

    await ctx.db.patch(user._id, {
      district: args.district,
      districtLastChanged: Date.now(),
    });
    return { success: true, message: "District updated successfully" };
  },
});
