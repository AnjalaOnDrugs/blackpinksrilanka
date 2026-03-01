import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertAdminAccess } from "./adminAuth";

// Set a room lock until a specific timestamp
export const setRoomLock = mutation({
    args: {
        roomId: v.string(),
        lockedUntil: v.optional(v.number()), // Time when lock expires (or null/undefined to unlock)
        allowedUsers: v.optional(v.array(v.string())),
        actorPhone: v.string(),
        adminKey: v.string(),
    },
    handler: async (ctx, args) => {
        assertAdminAccess(args);

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

            // Capture a standings snapshot before kicking everyone so the
            // victory screen can still be shown after the room is locked.
            const participants = await ctx.db
                .query("participants")
                .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
                .collect();

            const standings = participants
                .map((p) => ({
                    phoneNumber: p.phoneNumber,
                    username: p.username,
                    totalPoints: p.totalPoints ?? 0,
                    totalMinutes: p.totalMinutes ?? 0,
                    avatarColor: p.avatarColor,
                }))
                .sort(
                    (a, b) =>
                        (b.totalPoints ?? 0) - (a.totalPoints ?? 0) ||
                        (b.totalMinutes ?? 0) - (a.totalMinutes ?? 0)
                );

            if (standings.length > 0) {
                await ctx.db.insert("events", {
                    roomId: args.roomId,
                    type: "room_lock_snapshot",
                    data: {
                        standings,
                        capturedAt: now,
                    },
                    createdAt: now,
                });
            }

            // Kick all users currently in the room.
            for (const participant of participants) {
                await ctx.db.delete(participant._id);
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

            return { locked: true, kickedCount: participants.length };
        }

        return { locked: false, kickedCount: 0 };
    },
});

// Kick a specific user
export const kickUser = mutation({
    args: {
        roomId: v.string(),
        phoneNumber: v.string(),
        actorPhone: v.string(),
        adminKey: v.string(),
    },
    handler: async (ctx, args) => {
        assertAdminAccess(args);

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
        actorPhone: v.string(),
        adminKey: v.string(),
    },
    handler: async (ctx, args) => {
        assertAdminAccess(args);

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
        actorPhone: v.string(),
        adminKey: v.string(),
    },
    handler: async (ctx, args) => {
        assertAdminAccess(args);

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
        actorPhone: v.string(),
        adminKey: v.string(),
    },
    handler: async (ctx, args) => {
        assertAdminAccess(args);
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
        gifUrl: v.optional(v.string()),
        gifIsVideo: v.optional(v.boolean()),
        actorPhone: v.string(),
        adminKey: v.string(),
    },
    handler: async (ctx, args) => {
        assertAdminAccess(args);

        await ctx.db.insert("events", {
            roomId: args.roomId,
            type: "admin_message",
            data: {
                title: args.title,
                message: args.message,
                bgImage: args.bgImage,
                gifUrl: args.gifUrl,
                gifIsVideo: args.gifIsVideo,
            },
            createdAt: Date.now(),
        });
    },
});

// Trigger the victory screen for all users in the room
export const triggerVictoryScreen = mutation({
    args: {
        roomId: v.string(),
        actorPhone: v.string(),
        adminKey: v.string(),
    },
    handler: async (ctx, args) => {
        assertAdminAccess(args);

        const now = Date.now();

        const participants = await ctx.db
            .query("participants")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .collect();

        type Standing = {
            phoneNumber: string;
            username: string;
            totalPoints: number;
            totalMinutes: number;
            avatarColor?: string;
        };

        let standings: Standing[] = participants.map((p) => ({
            phoneNumber: p.phoneNumber,
            username: p.username,
            totalPoints: p.totalPoints ?? 0,
            totalMinutes: p.totalMinutes ?? 0,
            avatarColor: p.avatarColor,
        }));

        // If everyone was already kicked (e.g., room was locked first),
        // fall back to the latest pre-lock standings snapshot.
        if (standings.length === 0) {
            const snapshotEvent = await ctx.db
                .query("events")
                .withIndex("by_room_type", (q) =>
                    q.eq("roomId", args.roomId).eq("type", "room_lock_snapshot")
                )
                .order("desc")
                .first();

            if (snapshotEvent && Array.isArray(snapshotEvent.data?.standings)) {
                standings = snapshotEvent.data.standings.map((p: any) => ({
                    phoneNumber: String(p?.phoneNumber || ""),
                    username: String(p?.username || "BLINK"),
                    totalPoints: Number(p?.totalPoints || 0),
                    totalMinutes: Number(p?.totalMinutes || 0),
                    avatarColor: p?.avatarColor ? String(p.avatarColor) : undefined,
                })).filter((p: Standing) => !!p.phoneNumber);
            }
        }

        standings.sort(
            (a, b) =>
                (b.totalPoints ?? 0) - (a.totalPoints ?? 0) ||
                (b.totalMinutes ?? 0) - (a.totalMinutes ?? 0)
        );

        const top10 = standings.slice(0, 10).map((p, i) => ({
            rank: i + 1,
            username: p.username,
            totalPoints: p.totalPoints ?? 0,
            totalMinutes: p.totalMinutes ?? 0,
            avatarColor: p.avatarColor,
            phoneNumber: p.phoneNumber,
        }));

        if (top10.length === 0) {
            // Provide fallback dummy data so the admin can always preview the screen!
            const dummies: Standing[] = [
                { username: "ROSÉ", totalPoints: 50000, totalMinutes: 120, phoneNumber: "0001", avatarColor: "" },
                { username: "JENNIE", totalPoints: 45000, totalMinutes: 110, phoneNumber: "0002", avatarColor: "" },
                { username: "LISA", totalPoints: 40000, totalMinutes: 100, phoneNumber: "0003", avatarColor: "" },
                { username: "JISOO", totalPoints: 35000, totalMinutes: 90, phoneNumber: "0004", avatarColor: "" }
            ];
            dummies.forEach((p, i) => {
                standings.push(p);
                top10.push({
                    rank: i + 1,
                    username: p.username,
                    totalPoints: p.totalPoints,
                    totalMinutes: p.totalMinutes,
                    phoneNumber: p.phoneNumber,
                    avatarColor: p.avatarColor
                });
            });
        }

        const placementByPhone: Record<string, number> = {};
        for (let i = 0; i < standings.length; i++) {
            placementByPhone[standings[i].phoneNumber] = i + 1;
        }

        await ctx.db.insert("events", {
            roomId: args.roomId,
            type: "victory_screen",
            data: {
                top10,
                totalParticipants: standings.length,
                placementByPhone,
                triggeredAt: now,
            },
            createdAt: now,
        });

        return {
            success: true,
            participantCount: top10.length,
            totalParticipants: standings.length,
        };
    },
});

// Send a global admin GIF message
export const sendAdminGifMessage = mutation({
    args: {
        roomId: v.string(),
        title: v.optional(v.string()),
        message: v.string(),
        gifUrl: v.string(),
        gifIsVideo: v.boolean(),
        bgImage: v.optional(v.string()),
        actorPhone: v.string(),
        adminKey: v.string(),
    },
    handler: async (ctx, args) => {
        assertAdminAccess(args);

        await ctx.db.insert("events", {
            roomId: args.roomId,
            type: "admin_message",
            data: {
                title: args.title || "Admin Message",
                message: args.message,
                bgImage: args.bgImage || "",
                gifUrl: args.gifUrl,
                gifIsVideo: args.gifIsVideo,
            },
            createdAt: Date.now(),
        });
    },
});
