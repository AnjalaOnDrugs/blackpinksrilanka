/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminAuth from "../adminAuth.js";
import type * as checkins from "../checkins.js";
import type * as djEvent from "../djEvent.js";
import type * as events from "../events.js";
import type * as fillTheMap from "../fillTheMap.js";
import type * as gifMessages from "../gifMessages.js";
import type * as listenAlong from "../listenAlong.js";
import type * as messages from "../messages.js";
import type * as participants from "../participants.js";
import type * as redGreen from "../redGreen.js";
import type * as rooms from "../rooms.js";
import type * as runPlaylist from "../runPlaylist.js";
import type * as streams from "../streams.js";
import type * as theHour from "../theHour.js";
import type * as users from "../users.js";
import type * as voiceMessages from "../voiceMessages.js";
import type * as vroom from "../vroom.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminAuth: typeof adminAuth;
  checkins: typeof checkins;
  djEvent: typeof djEvent;
  events: typeof events;
  fillTheMap: typeof fillTheMap;
  gifMessages: typeof gifMessages;
  listenAlong: typeof listenAlong;
  messages: typeof messages;
  participants: typeof participants;
  redGreen: typeof redGreen;
  rooms: typeof rooms;
  runPlaylist: typeof runPlaylist;
  streams: typeof streams;
  theHour: typeof theHour;
  users: typeof users;
  voiceMessages: typeof voiceMessages;
  vroom: typeof vroom;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
