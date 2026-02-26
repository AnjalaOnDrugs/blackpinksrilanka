import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Users who can always enter locked rooms (admins)
const ALWAYS_ALLOWED = ["714066514", "714545776"]; // Modinee, Anjala

// Set a room lock until a specific timestamp
export const setRoomLock = mutation({
    args: {
        roomId: v.string(),
        lockedUntil: v.optional(v.number()), // Time when lock expires (or null/undefined to unlock)
        allowedUsers: v.optional(v.array(v.string())),
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
            allowedUsers: args.allowedUsers,
        });

        if (args.lockedUntil && args.lockedUntil > Date.now()) {
            const now = Date.now();
            const allowed = args.allowedUsers || [];

            // Kick unauthorized users
            const participants = await ctx.db
                .query("participants")
                .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
                .collect();

            for (const participant of participants) {
                if (!allowed.includes(participant.phoneNumber) && !ALWAYS_ALLOWED.includes(participant.phoneNumber)) {
                    await ctx.db.delete(participant._id);
                }
            }

            // End active events
            const listenAlong = await ctx.db.query("listenAlongEvents")
                .withIndex("by_room_status", q => q.eq("roomId", args.roomId).eq("status", "active")).collect();
            for (const ev of listenAlong) await ctx.db.patch(ev._id, { status: "ended", endsAt: now });

            const fillMap = await ctx.db.query("fillTheMapEvents")
                .withIndex("by_room_status", q => q.eq("roomId", args.roomId).eq("status", "active")).collect();
            for (const ev of fillMap) await ctx.db.patch(ev._id, { status: "ended", endsAt: now });

            const vroomEvents = await ctx.db.query("vroomEvents")
                .withIndex("by_room_status", q => q.eq("roomId", args.roomId).eq("status", "active")).collect();
            for (const ev of vroomEvents) await ctx.db.patch(ev._id, { status: "failed" });

            // Send an event so clients refresh/kick themselves
            await ctx.db.insert("events", {
                roomId: args.roomId,
                type: "admin_message",
                data: {
                    title: "Room Closed",
                    message: "The room has been closed. Please wait until it opens.",
                    bgImage: ""
                },
                createdAt: now,
            });
        }
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
