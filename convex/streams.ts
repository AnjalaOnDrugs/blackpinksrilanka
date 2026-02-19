import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Stream Counting System — Platform-Specific Rules + Points System
 *
 * Platform detection:
 *   - Spotify: album art present on the scrobble
 *   - YouTube: no album art + title contains MV/video markers
 *   - Other: anything else
 *
 * YouTube:
 *   - Daily cap: 50 streams per user
 *   - First 5 streams: 30s listen time, 2-minute same-song cooldown
 *   - After 5 streams: 60s listen time, 15-minute cooldown, 2 different songs in between
 *
 * Spotify:
 *   - Unlimited daily streams
 *   - 30s listen time always, 2-minute same-song cooldown always
 *   - After 10 total streams: must have at least 1 different song in between
 *
 * Points System:
 *   - 1 YT stream of main track = 5 points
 *   - 1 YT stream of other tracks = 1 point
 *   - 1 Spotify stream of main track = 2 points
 *   - 1 Spotify stream of other tracks = 1 point
 *   - Checking in = 2 points
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
const MAIN_EVENT_SONG = {
  title: "kill this love",
  artist: "blackpink",
};

// ── Points constants ──
const POINTS_YT_MAIN = 5;
const POINTS_YT_OTHER = 1;
const POINTS_SP_MAIN = 2;
const POINTS_SP_OTHER = 1;
const POINTS_CHECK_IN = 2;

// ── BLACKPINK member solo artists ──
const BLACKPINK_SOLO_ARTISTS = [
  "lisa",
  "lalisa",
  "jisoo",
  "jennie",
  "rose",
  "rosé",
  "blackpink",
];

// ── Helpers ──

/** Clean text for consistent matching */
function cleanForMatch(value: string): string {
  let s = (value || "").toLowerCase();
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
  return s;
}

/** Extract core song title and strip artist prefixes like "BLACKPINK - Kill This Love" */
function extractCoreSongTitle(name: string, artist: string): string {
  let cleanName = cleanForMatch(name);
  const cleanArtist = cleanForMatch(artist);

  if (cleanArtist && cleanName.indexOf(cleanArtist + " ") === 0) {
    cleanName = cleanName.substring(cleanArtist.length).trim();
  }

  const rawLower = (name || "").toLowerCase();
  const dashIdx = rawLower.indexOf(" - ");
  if (dashIdx > 0) {
    const beforeDash = cleanForMatch(rawLower.substring(0, dashIdx));
    if (beforeDash === cleanArtist || cleanArtist.indexOf(beforeDash) === 0) {
      cleanName = cleanForMatch(rawLower.substring(dashIdx + 3));
    }
  }

  return cleanName;
}

/** Normalize track key for consistent matching */
function normalizeTrackKey(name: string, artist: string): string {
  const a = cleanForMatch(artist);
  const s = extractCoreSongTitle(name, artist);
  return a + "|" + s;
}

/** Check if this is the main event song */
function isMainEventSong(trackName: string, trackArtist: string): boolean {
  return (
    cleanForMatch(trackArtist) === cleanForMatch(MAIN_EVENT_SONG.artist) &&
    extractCoreSongTitle(trackName, trackArtist) ===
      cleanForMatch(MAIN_EVENT_SONG.title)
  );
}

/** Check if this is a BLACKPINK or solo member song */
function isBlackpinkOrSolo(trackArtist: string): boolean {
  const cleaned = cleanForMatch(trackArtist);
  return BLACKPINK_SOLO_ARTISTS.some((a) => cleaned === a || cleaned.indexOf(a) === 0);
}

/** Detect platform from album art + raw track name */
function detectPlatform(
  trackName: string,
  albumArt?: string
): "youtube" | "spotify" | "other" {
  // Primary signal: scrobbles with album art are treated as Spotify.
  if ((albumArt || "").trim().length > 0) {
    return "spotify";
  }

  const n = (trackName || "").toLowerCase();
  if (
    /\b(music\s*video|official\s*video|official\s*audio)\b/i.test(n) ||
    /[\(\[]\s*(music\s*video|official\s*video|official\s*audio|m\/?v)\s*[\)\]]/i.test(n) ||
    /\b(m\/v|mv)\b/i.test(n)
  ) {
    return "youtube";
  }
  return "other";
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

/** Calculate points for a single stream */
function calculateStreamPoints(platform: string, isMain: boolean): number {
  if (platform === "youtube") {
    return isMain ? POINTS_YT_MAIN : POINTS_YT_OTHER;
  }
  // Spotify and "other" both use Spotify points
  return isMain ? POINTS_SP_MAIN : POINTS_SP_OTHER;
}

// ── Mutations ──

/**
 * Start or update a listening session.
 * Auto-detects platform from album art + track name.
 * Carries forward recent track history for interleave validation.
 */
export const startListening = mutation({
  args: {
    roomId: v.string(),
    phoneNumber: v.string(),
    trackName: v.string(),
    trackArtist: v.string(),
    trackAlbumArt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trackKey = normalizeTrackKey(args.trackName, args.trackArtist);
    const platform = detectPlatform(args.trackName, args.trackAlbumArt);

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
 * Now counts ALL songs (not just main) — non-main songs don't affect
 * the room's cumulative/verified tracking but do earn points.
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

    const isMain = isMainEventSong(session.trackName, session.trackArtist);
    const platform = (session.platform as "youtube" | "spotify" | "other") || "other";
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
      (s) =>
        s.countedAt >= dayStartMs &&
        (s.platform || "other") === platform
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
    const points = calculateStreamPoints(platform, isMain);

    await ctx.db.insert("streamCounts", {
      roomId: args.roomId,
      phoneNumber: args.phoneNumber,
      trackName: session.trackName,
      trackArtist: session.trackArtist,
      trackKey: session.trackKey,
      platform,
      isMainSong: isMain,
      countedAt: now,
      listenDuration: listenedSeconds,
    });

    // Mark session as counted
    await ctx.db.patch(session._id, { counted: true });

    // 5b. Update user's totalPoints
    const userStreams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .collect();

    let totalPoints = 0;
    for (const s of userStreams) {
      const sIsMain = s.isMainSong ?? isMainEventSong(s.trackName, s.trackArtist);
      totalPoints += calculateStreamPoints((s.platform as string) || "other", sIsMain);
    }

    // Add check-in points
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant) {
      // Count check-in points: each check-in = 2 points
      // We track this based on offlineTracking being true (they checked in at least once)
      const checkInPoints = participant.offlineTracking ? POINTS_CHECK_IN : 0;
      await ctx.db.patch(participant._id, {
        totalPoints: totalPoints + checkInPoints,
      });
    }

    // 6. Check if we crossed a 100-stream milestone (main song streams only for room milestones)
    if (isMain) {
      const totalRoomStreams = await ctx.db
        .query("streamCounts")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .collect();

      const totalMainCount = totalRoomStreams.filter((s) =>
        s.isMainSong ?? isMainEventSong(s.trackName, s.trackArtist)
      ).length;

      if (totalMainCount > 0 && totalMainCount % 100 === 0) {
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
            data: { totalStreams: totalMainCount },
            createdAt: now,
          });
        }
      }
    }

    return {
      counted: true,
      platform,
      isMainSong: isMain,
      points,
      trackName: session.trackName,
      trackArtist: session.trackArtist,
      listenDuration: listenedSeconds,
    };
  },
});

// ── Queries ──

/**
 * Get stream counts for a room split by platform.
 * Only main song streams count toward room cumulative tracking.
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
    let other = 0;
    let totalBlackpink = 0;
    let totalOther = 0;
    for (const s of streams) {
      const isBpOrSolo = isBlackpinkOrSolo(s.trackArtist);
      if (isBpOrSolo) {
        totalBlackpink++;
      } else {
        totalOther++;
      }
      // Only main song for room cumulative counts
      const isMain = s.isMainSong ?? isMainEventSong(s.trackName, s.trackArtist);
      if (!isMain) continue;
      if ((s.platform || "other") === "youtube") {
        youtube++;
      } else if ((s.platform || "other") === "spotify") {
        spotify++;
      } else {
        other++;
      }
    }

    return {
      youtube,
      spotify,
      other,
      total: youtube + spotify + other,
      totalBlackpink,
      totalOther,
      totalAll: streams.length,
    };
  },
});

/**
 * Get stream counts for a room, grouped by track.
 */
export const getRoomStreamCounts = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const allStreams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const streams = allStreams.filter((s) =>
      s.isMainSong ?? isMainEventSong(s.trackName, s.trackArtist)
    );

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
          platform: (s.platform as string) || "other",
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
    const allStreams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .collect();
    const mainStreams = allStreams.filter((s) =>
      s.isMainSong ?? isMainEventSong(s.trackName, s.trackArtist)
    );

    let mainYoutube = 0;
    let mainSpotify = 0;
    let mainOther = 0;
    let totalBlackpink = 0;
    let totalOther = 0;
    let totalPoints = 0;

    for (const s of allStreams) {
      const isBpOrSolo = isBlackpinkOrSolo(s.trackArtist);
      if (isBpOrSolo) {
        totalBlackpink++;
      } else {
        totalOther++;
      }
      const sIsMain = s.isMainSong ?? isMainEventSong(s.trackName, s.trackArtist);
      totalPoints += calculateStreamPoints((s.platform as string) || "other", sIsMain);
    }

    for (const s of mainStreams) {
      const p = (s.platform as string) || "other";
      if (p === "youtube") {
        mainYoutube++;
      } else if (p === "spotify") {
        mainSpotify++;
      } else {
        mainOther++;
      }
    }

    return {
      totalStreams: mainStreams.length,
      mainYoutube,
      mainSpotify,
      mainOther,
      totalBlackpink,
      totalOther,
      totalPoints,
      streams: mainStreams.map((s) => ({
        trackName: s.trackName,
        trackArtist: s.trackArtist,
        platform: (s.platform as string) || "other",
        countedAt: s.countedAt,
        listenDuration: s.listenDuration,
      })),
    };
  },
});

/**
 * Get user points for all participants in a room.
 * Used by the leaderboard to rank by points.
 */
export const getUserPoints = query({
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

    let points = 0;
    for (const s of streams) {
      const sIsMain = s.isMainSong ?? isMainEventSong(s.trackName, s.trackArtist);
      points += calculateStreamPoints((s.platform as string) || "other", sIsMain);
    }

    return { points };
  },
});

/**
 * Recalculate and update points for a user (called on check-in).
 */
export const recalculatePoints = mutation({
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

    let streamPoints = 0;
    for (const s of streams) {
      const sIsMain = s.isMainSong ?? isMainEventSong(s.trackName, s.trackArtist);
      streamPoints += calculateStreamPoints((s.platform as string) || "other", sIsMain);
    }

    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_phone", (q) =>
        q.eq("roomId", args.roomId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (participant) {
      const checkInPoints = participant.offlineTracking ? POINTS_CHECK_IN : 0;
      const bonusPoints = participant.bonusPoints ?? 0;
      await ctx.db.patch(participant._id, {
        totalPoints: streamPoints + checkInPoints + bonusPoints,
      });
    }

    const bonusPoints = participant?.bonusPoints ?? 0;
    return { totalPoints: streamPoints + (participant?.offlineTracking ? POINTS_CHECK_IN : 0) + bonusPoints };
  },
});

/**
 * Get stream counts aggregated by district for the heat map.
 * Joins streamCounts → users (via phoneNumber) to get district,
 * then groups by district.
 */
export const getStreamsByDistrict = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const streams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Get unique phone numbers from streams
    const phoneNumbers = [...new Set(streams.map((s) => s.phoneNumber))];

    // Look up district for each phone number
    const phoneToDistrict: Record<string, string> = {};
    for (const phone of phoneNumbers) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phoneNumber", phone))
        .first();
      if (user?.district) {
        phoneToDistrict[phone] = user.district;
      }
    }

    // Aggregate streams by district
    const districtCounts: Record<string, { totalStreams: number; uniqueUsers: Set<string> }> = {};
    for (const s of streams) {
      const district = phoneToDistrict[s.phoneNumber];
      if (!district) continue;
      if (!districtCounts[district]) {
        districtCounts[district] = { totalStreams: 0, uniqueUsers: new Set() };
      }
      districtCounts[district].totalStreams++;
      districtCounts[district].uniqueUsers.add(s.phoneNumber);
    }

    // Return as serializable array (Sets aren't serializable)
    return Object.entries(districtCounts).map(([district, data]) => ({
      district,
      totalStreams: data.totalStreams,
      uniqueUsers: data.uniqueUsers.size,
    }));
  },
});

/**
 * Get per-user stream counts with precise lat/lng for the Deck.gl heat map.
 * Only returns entries for users who have granted location permission (lat/lng stored).
 * Weight = total stream count for that user in the room.
 */
export const getPreciseHeatmapData = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const streams = await ctx.db
      .query("streamCounts")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Aggregate stream count per user
    const userStreamCounts: Record<string, number> = {};
    for (const s of streams) {
      userStreamCounts[s.phoneNumber] = (userStreamCounts[s.phoneNumber] || 0) + 1;
    }

    // Look up lat/lng for each user; skip those without coordinates
    const result: Array<{ lat: number; lng: number; weight: number; phoneNumber: string }> = [];

    for (const phoneNumber of Object.keys(userStreamCounts)) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phoneNumber", phoneNumber))
        .first();

      if (user?.lat != null && user?.lng != null) {
        result.push({
          lat: user.lat,
          lng: user.lng,
          weight: userStreamCounts[phoneNumber],
          phoneNumber,
        });
      }
    }

    return result;
  },
});
