import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Sri Lanka UTC+5:30 offset in milliseconds
const SL_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getSriLankaDateKey(nowMs?: number): string {
  const ts = (nowMs ?? Date.now()) + SL_OFFSET_MS;
  return new Date(ts).toISOString().split("T")[0];
}

// Daily check-in (idempotent — one per day per user)
export const checkIn = mutation({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const dateKey = getSriLankaDateKey();

    // Check if already checked in today
    const existing = await ctx.db
      .query("checkins")
      .withIndex("by_phone_date", (q) =>
        q.eq("phoneNumber", args.phoneNumber).eq("dateKey", dateKey)
      )
      .first();

    if (existing) {
      return { alreadyCheckedIn: true, dateKey };
    }

    await ctx.db.insert("checkins", {
      phoneNumber: args.phoneNumber,
      dateKey,
      checkedInAt: Date.now(),
    });

    return { alreadyCheckedIn: false, dateKey };
  },
});

// Get all check-ins for a user in a given month
export const getMonthCheckins = query({
  args: {
    phoneNumber: v.string(),
    monthPrefix: v.string(), // e.g. "2026-02"
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("checkins")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .collect();

    return all
      .filter((c) => c.dateKey.startsWith(args.monthPrefix))
      .map((c) => ({ dateKey: c.dateKey, checkedInAt: c.checkedInAt }));
  },
});

// Get current consecutive-day streak for a user
export const getStreak = query({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("checkins")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .collect();

    if (all.length === 0) return { streak: 0 };

    const dateSet = new Set(all.map((c) => c.dateKey));
    const today = getSriLankaDateKey();

    let streak = 0;
    // Start from today; if not checked in today, start from yesterday
    const checkDate = new Date(today + "T00:00:00Z");
    if (!dateSet.has(today)) {
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    }

    while (true) {
      const key = checkDate.toISOString().split("T")[0];
      if (dateSet.has(key)) {
        streak++;
        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
      } else {
        break;
      }
    }

    return { streak };
  },
});
