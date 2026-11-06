/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as auth from "../auth.js";
import type * as automations from "../automations.js";
import type * as composioActions from "../composioActions.js";
import type * as composioTools from "../composioTools.js";
import type * as crm from "../crm.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_media from "../lib/media.js";
import type * as lib_parts from "../lib/parts.js";
import type * as lib_vin from "../lib/vin.js";
import type * as lib_whapi from "../lib/whapi.js";
import type * as logs from "../logs.js";
import type * as parts from "../parts.js";
import type * as teammates from "../teammates.js";
import type * as whapi from "../whapi.js";
import type * as whapiWebhook from "../whapiWebhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  auth: typeof auth;
  automations: typeof automations;
  composioActions: typeof composioActions;
  composioTools: typeof composioTools;
  crm: typeof crm;
  crons: typeof crons;
  dashboard: typeof dashboard;
  http: typeof http;
  "lib/ai": typeof lib_ai;
  "lib/auth": typeof lib_auth;
  "lib/media": typeof lib_media;
  "lib/parts": typeof lib_parts;
  "lib/vin": typeof lib_vin;
  "lib/whapi": typeof lib_whapi;
  logs: typeof logs;
  parts: typeof parts;
  teammates: typeof teammates;
  whapi: typeof whapi;
  whapiWebhook: typeof whapiWebhook;
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

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
