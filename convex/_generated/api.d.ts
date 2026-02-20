/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as events from "../events.js";
import type * as fillTheMap from "../fillTheMap.js";
import type * as listenAlong from "../listenAlong.js";
import type * as messages from "../messages.js";
import type * as participants from "../participants.js";
import type * as rooms from "../rooms.js";
import type * as runPlaylist from "../runPlaylist.js";
import type * as streams from "../streams.js";
import type * as users from "../users.js";
import type * as voiceMessages from "../voiceMessages.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  events: typeof events;
  fillTheMap: typeof fillTheMap;
  listenAlong: typeof listenAlong;
  messages: typeof messages;
  participants: typeof participants;
  rooms: typeof rooms;
  runPlaylist: typeof runPlaylist;
  streams: typeof streams;
  users: typeof users;
  voiceMessages: typeof voiceMessages;
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
