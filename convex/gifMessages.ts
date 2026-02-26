import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const GIF_COST = 10;

// Send a GIF message to another user (costs 10 points)
export const send = mutation({
  args: {
    roomId: v.string(),
    senderPhoneNumber: v.string(),
    senderUsername: v.string(),
    senderAvatarColor: v.string(),
    recipientPhoneNumber: v.string(),
    recipientUsername: v.string(),
    gifUrl: v.string(),
    gifIsVideo: v.boolean(),
    member: v.string(),
    action: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Rate limit: 30s cooldown per sender→recipient pair
    const recentGifMsg = await ctx.db
      .query("gifMessages")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (
      recentGifMsg &&
      now - recentGifMsg.createdAt < 30000 &&
      recentGifMsg.senderPhoneNumber === args.senderPhoneNumber &&
      recentGifMsg.recipientPhoneNumber === args.recipientPhoneNumber
    ) {
      return { success: false, reason: "cooldown" };
    }

    // Validate sender has enough points
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.senderPhoneNumber)
      )
      .first();

    if (!participant) {
      return { success: false, reason: "not_found" };
    }

    const currentTotal = participant.totalPoints ?? 0;
    if (currentTotal < GIF_COST) {
      return { success: false, reason: "insufficient_points" };
    }

    // Deduct points via bonusPoints (can go negative — recalculatePoints handles it)
    const newBonusPoints = (participant.bonusPoints ?? 0) - GIF_COST;
    const newTotalPoints = currentTotal - GIF_COST;

    await ctx.db.patch(participant._id, {
      bonusPoints: newBonusPoints,
      totalPoints: newTotalPoints,
    });

    // Truncate message to 100 chars
    const message = args.message ? args.message.slice(0, 100) : undefined;

    // Insert persistent GIF message
    await ctx.db.insert("gifMessages", {
      roomId: args.roomId,
      senderPhoneNumber: args.senderPhoneNumber,
      senderUsername: args.senderUsername,
      senderAvatarColor: args.senderAvatarColor,
      recipientPhoneNumber: args.recipientPhoneNumber,
      recipientUsername: args.recipientUsername,
      gifUrl: args.gifUrl,
      gifIsVideo: args.gifIsVideo,
      member: args.member,
      action: args.action,
      message,
      createdAt: now,
      isRead: false,
    });

    // Also fire a real-time event so online recipients see it immediately
    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "gif_send",
      data: {
        senderPhoneNumber: args.senderPhoneNumber,
        senderUsername: args.senderUsername,
        senderAvatarColor: args.senderAvatarColor,
        recipientPhoneNumber: args.recipientPhoneNumber,
        recipientUsername: args.recipientUsername,
        gifUrl: args.gifUrl,
        gifIsVideo: args.gifIsVideo,
        member: args.member,
        action: args.action,
        message,
      },
      createdAt: now,
    });

    return { success: true, newTotalPoints };
  },
});

// List unread GIF messages for a user
export const listUnread = query({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gifMessages")
      .withIndex("by_recipient_unread", (q) =>
        q
          .eq("roomId", args.roomId)
          .eq("recipientPhoneNumber", args.phoneNumber)
          .eq("isRead", false)
      )
      .order("desc")
      .take(50);
  },
});

// Mark a single GIF message as read
export const markAsRead = mutation({
  args: {
    messageId: v.id("gifMessages"),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return;
    await ctx.db.patch(args.messageId, {
      isRead: true,
      readAt: Date.now(),
    });
  },
});

// Mark all unread GIF messages as read for a user
export const markAllRead = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("gifMessages")
      .withIndex("by_recipient_unread", (q) =>
        q
          .eq("roomId", args.roomId)
          .eq("recipientPhoneNumber", args.phoneNumber)
          .eq("isRead", false)
      )
      .collect();

    const now = Date.now();
    for (const msg of unread) {
      await ctx.db.patch(msg._id, { isRead: true, readAt: now });
    }

    return { marked: unread.length };
  },
});
