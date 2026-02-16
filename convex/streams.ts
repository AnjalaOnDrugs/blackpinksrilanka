import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Stream Counting System — Platform-Specific Rules
 *
 * YouTube (detected by "Music Video", "Official Video", "MV", "M/V", "Official Audio" in track name):
 *   - Daily cap: 50 streams per user
 *   - First 5 streams: 30s listen time, 2-minute same-song cooldown
 *   - After 5 streams: 60s listen time, 15-minute cooldown, 2 different songs in between
 *
 * Spotify (everything else):
 *   - Unlimited daily streams
 *   - 30s listen time always, 2-minute same-song cooldown always
 *   - After 10 total streams: must have at least 1 different song in between
 *
 * Server-side validation prevents client-side manipulation.
 */

// ── YouTube constants ──
const YT_DAILY_CAP = 50;
const YT_EARLY_LISTEN_SECONDS = 30;
const YT_EARLY_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const YT_EARLY_THRESHOLD = 5; // first 5 streams use early rules
const YT_LATE_LISTEN_SECONDS = 60;
const YT_LATE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const YT_INTERLEAVE_REQUIRED = 2; // 2 different songs in between

// ── Spotify constants ──
const SP_LISTEN_SECONDS = 30;
const SP_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const SP_INTERLEAVE_THRESHOLD = 10; // after 10 total streams
const SP_INTERLEAVE_REQUIRED = 1; // 1 different song in between

// ── Shared ──
const MAX_RECENT_TRACKS = 5; // how many track keys to keep in history

// ── Helpers ──

/** Normalize track key for consistent matching */
function normalizeTrackKey(name: string, artist: string): string {
  let s = (name || "").toLowerCase();
  s = s.replace(
    /[\(\[](?:official\s*(?:music\s*)?(?:video|audio)|lyrics?|visuali[sz]er|(?:feat|ft)\.?\s*[^\)\]]*)\s*[\)\]]/gi,
    ""
  );
  s = s.replace(
    /\b(?:official\s*(?:music\s*)?video|official\s*audio|m\/?v|live)\b/gi,
    ""
  );
  s = s.replace(/vevo$/gi, "");
  s = s.replace(/\s+(?:feat|ft)\.?\s+.*/gi, "");
  s = s.replace(/[^\w\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  const a = (artist || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return a + "|" + s;
}

/** Detect platform from raw track name */
function detectPlatform(trackName: string): "youtube" | "spotify" {
  const n = (trackName || "").toLowerCase();
  if (
    /\b(music\s*video|official\s*video|official\s*audio)\b/i.test(n) ||
    /[\(\[]\s*(music\s*video|official\s*video|official\s*audio|m\/?v)\s*[\)\]]/i.test(n) ||
    /\b(m\/v|mv)\b/i.test(n)
  ) {
    return "youtube";
  }
  return "spotify";
}

/**
 * Check interleave requirement: enough different songs played between re-listens.
 * Returns true if requirement is met or history is too short to enforce.
 */
function checkInterleave(
  recentTrackKeys: string[],
  currentTrackKey: string,
  requiredDifferent: number
): boolean {
  if (!recentTrackKeys || recentTrackKeys.length === 0) return true;

  let differentCount = 0;
  for (let i = recentTrackKeys.length - 1; i >= 0; i--) {
    if (recentTrackKeys[i] !== currentTrackKey) {
      differentCount++;
      if (differentCount >= requiredDifferent) return true;
    }
  }
  // If history is shorter than required, don't block (new users)
  if (recentTrackKeys.length < requiredDifferent) return true;
  return false;
}

// ── Mutations ──

/**
 * Start or update a listening session.
 * Auto-detects platform from track name.
 * Carries forward recent track history for interleave validation.
 */
export const startListening = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    trackName: v.string(),
    trackArtist: v.string(),
  },
  handler: async (ctx, args) => {
    const trackKey = normalizeTrackKey(args.trackName, args.trackArtist);
    const platform = detectPlatform(args.trackName);

    // Find existing session for this user in this room
    const existing = await ctx.db
      .query("listeningSessions")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (existing) {
      // If same track, keep the existing session (don't reset timer)
      if (existing.trackKey === trackKey) {
        return { action: "continued", trackKey, platform };
      }

      // Different track — carry forward history, then delete old session
      const prevHistory = existing.recentTrackKeys || [];
      const updatedHistory = [...prevHistory, existing.trackKey].slice(
        -MAX_RECENT_TRACKS
      );

      await ctx.db.delete(existing._id);

      // Create new session with carried-forward history
      await ctx.db.insert("listeningSessions", {
        roomId: args.roomId,
        phoneNumber: args.phoneNumber,
        trackName: args.trackName,
        trackArtist: args.trackArtist,
        trackKey,
        platform,
        recentTrackKeys: updatedHistory,
        startedAt: Date.now(),
        counted: false,
      });

      return { action: "started", trackKey, platform };
    }

    // No existing session — create fresh
    await ctx.db.insert("listeningSessions", {
      roomId: args.roomId,
      phoneNumber: args.phoneNumber,
      trackName: args.trackName,
      trackArtist: args.trackArtist,
      trackKey,
      platform,
      recentTrackKeys: [],
      startedAt: Date.now(),
      counted: false,
    });

    return { action: "started", trackKey, platform };
  },
});

/**
 * Stop a listening session (user stopped playing or switched to idle).
 */
export const stopListening = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("listeningSessions")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/**
 * Try to count a stream. Server validates all platform-specific rules.
 * Also triggers stream milestone event (every 100 streams).
 */
export const tryCountStream = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Find active listening session
    const session = await ctx.db
      .query("listeningSessions")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (!session) {
      return { counted: false, reason: "no_session" };
    }

    if (session.counted) {
      return { counted: false, reason: "already_counted" };
    }

    const platform = (session.platform as "youtube" | "spotify") || "spotify";
    const listenedMs = now - session.startedAt;
    const listenedSeconds = Math.floor(listenedMs / 1000);

    // 2. Get today's stream count for this user on this platform
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();

    const todayAllStreams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .collect();

    const todayPlatformCount = todayAllStreams.filter(
      (s) => s.countedAt >= dayStartMs && (s.platform || "spotify") === platform
    ).length;

    // 3. Get most recent stream of this exact track (for cooldown)
    const recentSameTrack = await ctx.db
      .query("streamCounts")
      .withIndex("by_room_phone_track", (q) =>
        q
          .eq("roomId", args.roomId)
          .eq("phoneNumber", args.phoneNumber)
          .eq("trackKey", session.trackKey)
      )
      .order("desc")
      .first();

    // 4. Platform-specific validation
    if (platform === "youtube") {
      // ── YouTube Rules ──

      // Daily cap
      if (todayPlatformCount >= YT_DAILY_CAP) {
        return { counted: false, reason: "daily_cap" };
      }

      if (todayPlatformCount < YT_EARLY_THRESHOLD) {
        // First 5 streams: 30s listen, 2-min cooldown
        if (listenedSeconds < YT_EARLY_LISTEN_SECONDS) {
          return {
            counted: false,
            reason: "too_short",
            secondsRemaining: YT_EARLY_LISTEN_SECONDS - listenedSeconds,
          };
        }
        if (
          recentSameTrack &&
          now - recentSameTrack.countedAt < YT_EARLY_COOLDOWN_MS
        ) {
          return {
            counted: false,
            reason: "cooldown",
            secondsRemaining: Math.ceil(
              (YT_EARLY_COOLDOWN_MS - (now - recentSameTrack.countedAt)) / 1000
            ),
          };
        }
      } else {
        // After 5 streams: 60s listen, 15-min cooldown, 2 songs in between
        if (listenedSeconds < YT_LATE_LISTEN_SECONDS) {
          return {
            counted: false,
            reason: "too_short",
            secondsRemaining: YT_LATE_LISTEN_SECONDS - listenedSeconds,
          };
        }
        if (
          recentSameTrack &&
          now - recentSameTrack.countedAt < YT_LATE_COOLDOWN_MS
        ) {
          return {
            counted: false,
            reason: "cooldown",
            secondsRemaining: Math.ceil(
              (YT_LATE_COOLDOWN_MS - (now - recentSameTrack.countedAt)) / 1000
            ),
          };
        }
        // Interleave: 2 different songs in between
        if (
          !checkInterleave(
            session.recentTrackKeys || [],
            session.trackKey,
            YT_INTERLEAVE_REQUIRED
          )
        ) {
          return { counted: false, reason: "interleave" };
        }
      }
    } else {
      // ── Spotify Rules ──

      // 30s listen time always
      if (listenedSeconds < SP_LISTEN_SECONDS) {
        return {
          counted: false,
          reason: "too_short",
          secondsRemaining: SP_LISTEN_SECONDS - listenedSeconds,
        };
      }

      // 2-min same-song cooldown always
      if (
        recentSameTrack &&
        now - recentSameTrack.countedAt < SP_COOLDOWN_MS
      ) {
        return {
          counted: false,
          reason: "cooldown",
          secondsRemaining: Math.ceil(
            (SP_COOLDOWN_MS - (now - recentSameTrack.countedAt)) / 1000
          ),
        };
      }

      // After 10 total Spotify streams today: 1 song in between
      if (todayPlatformCount >= SP_INTERLEAVE_THRESHOLD) {
        if (
          !checkInterleave(
            session.recentTrackKeys || [],
            session.trackKey,
            SP_INTERLEAVE_REQUIRED
          )
        ) {
          return { counted: false, reason: "interleave" };
        }
      }
    }

    // 5. All checks passed — count the stream!
    await ctx.db.insert("streamCounts", {
      roomId: args.roomId,
      phoneNumber: args.phoneNumber,
      trackName: session.trackName,
      trackArtist: session.trackArtist,
      trackKey: session.trackKey,
      platform,
      countedAt: now,
      listenDuration: listenedSeconds,
    });

    // Mark session as counted
    await ctx.db.patch(session._id, { counted: true });

    // 6. Check if we crossed a 100-stream milestone
    const totalStreams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    const totalCount = totalStreams.length;
    if (totalCount > 0 && totalCount % 100 === 0) {
      // Dedup: don't fire if a stream_milestone event was fired in the last 30s
      const recentMilestone = await ctx.db
        .query("events")
        .withIndex("by_room_type", (q) =>
          q.eq("roomId", args.roomId).eq("type", "stream_milestone")
        )
        .order("desc")
        .first();

      if (!recentMilestone || now - recentMilestone.createdAt > 30000) {
        await ctx.db.insert("events", {
          roomId: args.roomId,
          type: "stream_milestone",
          data: { totalStreams: totalCount },
          createdAt: now,
        });
      }
    }

    return {
      counted: true,
      platform,
      trackName: session.trackName,
      trackArtist: session.trackArtist,
      listenDuration: listenedSeconds,
    };
  },
});

// ── Queries ──

/**
 * Get stream counts for a room split by platform.
 */
export const getRoomStreamsByPlatform = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const streams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    let youtube = 0;
    let spotify = 0;
    for (const s of streams) {
      if ((s.platform || "spotify") === "youtube") {
        youtube++;
      } else {
        spotify++;
      }
    }

    return { youtube, spotify, total: streams.length };
  },
});

/**
 * Get stream counts for a room, grouped by track.
 */
export const getRoomStreamCounts = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const streams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    const trackMap: Record<
      string,
      {
        trackName: string;
        trackArtist: string;
        trackKey: string;
        platform: string;
        totalStreams: number;
        uniqueListeners: Set<string>;
      }
    > = {};

    for (const s of streams) {
      if (!trackMap[s.trackKey]) {
        trackMap[s.trackKey] = {
          trackName: s.trackName,
          trackArtist: s.trackArtist,
          trackKey: s.trackKey,
          platform: (s.platform as string) || "spotify",
          totalStreams: 0,
          uniqueListeners: new Set(),
        };
      }
      trackMap[s.trackKey].totalStreams++;
      trackMap[s.trackKey].uniqueListeners.add(s.phoneNumber);
    }

    return Object.values(trackMap)
      .map((t) => ({
        trackName: t.trackName,
        trackArtist: t.trackArtist,
        trackKey: t.trackKey,
        platform: t.platform,
        totalStreams: t.totalStreams,
        uniqueListeners: t.uniqueListeners.size,
      }))
      .sort((a, b) => b.totalStreams - a.totalStreams);
  },
});

/**
 * Get a specific user's stream counts in a room.
 */
export const getUserStreamCounts = query({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const streams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .collect();

    return {
      totalStreams: streams.length,
      streams: streams.map((s) => ({
        trackName: s.trackName,
        trackArtist: s.trackArtist,
        platform: (s.platform as string) || "spotify",
        countedAt: s.countedAt,
        listenDuration: s.listenDuration,
      })),
    };
  },
});
