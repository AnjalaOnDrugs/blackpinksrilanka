import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Set a room lock until a specific timestamp
export const setRoomLock = mutation({
    args: {
        roomId: v.string(),
        lockedUntil: v.optional(v.number()), // Time when lock expires (or null/undefined to unlock)
    },
    handler: async (ctx, args) => {
        const room = await ctx.db
            .query("rooms")
            .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
            .first();

        if (!room) {
            throw new Error("Room not found");
        }

        await ctx.db.patch(room._id, {
            lockedUntil: args.lockedUntil,
        });
    },
});

// Kick a specific user
export const kickUser = mutation({
    args: {
        roomId: v.string(),
        phoneNumber: v.string(),
    },
    handler: async (ctx, args) => {
        const participant = await ctx.db
            .query("participants")
            .withIndex("by_room_phone", (q) =>
                q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
            )
            .first();

        if (participant) {
            await ctx.db.delete(participant._id);
        }
    },
});

// Kick all users from the room
export const kickAllUsers = mutation({
    args: {
        roomId: v.string(),
    },
    handler: async (ctx, args) => {
        const participants = await ctx.db
            .query("participants")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .collect();

        for (const participant of participants) {
            await ctx.db.delete(participant._id);
        }
    },
});

// Delete all voice messages
export const deleteVoiceMessages = mutation({
    args: {
        roomId: v.string(),
    },
    handler: async (ctx, args) => {
        const messages = await ctx.db
            .query("voiceMessages")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .collect();

        for (const msg of messages) {
            await ctx.db.delete(msg._id);
        }
    },
});

// Delete a specific voice message
export const deleteVoiceMessage = mutation({
    args: {
        messageId: v.id("voiceMessages"),
    },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.messageId);
    },
});

// Send a global admin message event
export const sendAdminMessage = mutation({
    args: {
        roomId: v.string(),
        title: v.string(),
        message: v.string(),
        bgImage: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("events", {
            roomId: args.roomId,
            type: "admin_message",
            data: {
                title: args.title,
                message: args.message,
                bgImage: args.bgImage,
            },
            createdAt: Date.now(),
        });
    },
});
