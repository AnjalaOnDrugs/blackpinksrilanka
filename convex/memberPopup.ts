import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertAdminAccess } from "./adminAuth";

// Show a BLACKPINK member popup on all participants' screens
export const showMember = mutation({
  args: {
    roomId: v.string(),
    member: v.string(), // "lisa" | "jennie" | "rose" | "jisoo"
    actorPhone: v.string(),
    adminKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertAdminAccess(args);

    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "member_popup_show",
      data: { member: args.member },
      createdAt: Date.now(),
    });
  },
});

// Update or show a dialog bubble on the current member popup
export const updateDialog = mutation({
  args: {
    roomId: v.string(),
    dialog: v.string(),
    actorPhone: v.string(),
    adminKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertAdminAccess(args);

    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "member_popup_dialog",
      data: { dialog: args.dialog },
      createdAt: Date.now(),
    });
  },
});

// Hide the member popup on all participants' screens
export const hideMember = mutation({
  args: {
    roomId: v.string(),
    actorPhone: v.string(),
    adminKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertAdminAccess(args);

    await ctx.db.insert("events", {
      roomId: args.roomId,
      type: "member_popup_hide",
      data: {},
      createdAt: Date.now(),
    });
  },
});
