/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alphabet from "../alphabet.js";
import type * as alphabetDomain from "../alphabetDomain.js";
import type * as alphabetValidators from "../alphabetValidators.js";
import type * as examDomain from "../examDomain.js";
import type * as examValidators from "../examValidators.js";
import type * as exams from "../exams.js";
import type * as grammar from "../grammar.js";
import type * as grammarDomain from "../grammarDomain.js";
import type * as grammarValidators from "../grammarValidators.js";
import type * as http from "../http.js";
import type * as jlpt from "../jlpt.js";
import type * as jlptAuthorship from "../jlptAuthorship.js";
import type * as jlptDevSeed from "../jlptDevSeed.js";
import type * as jlptDomain from "../jlptDomain.js";
import type * as jlptValidators from "../jlptValidators.js";
import type * as libraryOrder from "../libraryOrder.js";
import type * as mcpAuth from "../mcpAuth.js";
import type * as mcpGateway from "../mcpGateway.js";
import type * as mcpHttp from "../mcpHttp.js";
import type * as mcpPlanning from "../mcpPlanning.js";
import type * as mcpPlanningSchemas from "../mcpPlanningSchemas.js";
import type * as mcpSchemas from "../mcpSchemas.js";
import type * as mcpServer from "../mcpServer.js";
import type * as mcpShikenSchemas from "../mcpShikenSchemas.js";
import type * as mcpStoriesSchemas from "../mcpStoriesSchemas.js";
import type * as offline from "../offline.js";
import type * as offlineValidators from "../offlineValidators.js";
import type * as quests from "../quests.js";
import type * as questsDomain from "../questsDomain.js";
import type * as questsStart from "../questsStart.js";
import type * as questsValidators from "../questsValidators.js";
import type * as readBudget from "../readBudget.js";
import type * as shikenMedia from "../shikenMedia.js";
import type * as shikenMediaHttp from "../shikenMediaHttp.js";
import type * as shikenMediaValidators from "../shikenMediaValidators.js";
import type * as stories from "../stories.js";
import type * as storiesDomain from "../storiesDomain.js";
import type * as storiesValidators from "../storiesValidators.js";
import type * as streak from "../streak.js";
import type * as study from "../study.js";
import type * as studyCards from "../studyCards.js";
import type * as studyProgress from "../studyProgress.js";
import type * as studyValidators from "../studyValidators.js";
import type * as users from "../users.js";
import type * as vocabulary from "../vocabulary.js";
import type * as vocabularyDomain from "../vocabularyDomain.js";
import type * as vocabularyValidators from "../vocabularyValidators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alphabet: typeof alphabet;
  alphabetDomain: typeof alphabetDomain;
  alphabetValidators: typeof alphabetValidators;
  examDomain: typeof examDomain;
  examValidators: typeof examValidators;
  exams: typeof exams;
  grammar: typeof grammar;
  grammarDomain: typeof grammarDomain;
  grammarValidators: typeof grammarValidators;
  http: typeof http;
  jlpt: typeof jlpt;
  jlptAuthorship: typeof jlptAuthorship;
  jlptDevSeed: typeof jlptDevSeed;
  jlptDomain: typeof jlptDomain;
  jlptValidators: typeof jlptValidators;
  libraryOrder: typeof libraryOrder;
  mcpAuth: typeof mcpAuth;
  mcpGateway: typeof mcpGateway;
  mcpHttp: typeof mcpHttp;
  mcpPlanning: typeof mcpPlanning;
  mcpPlanningSchemas: typeof mcpPlanningSchemas;
  mcpSchemas: typeof mcpSchemas;
  mcpServer: typeof mcpServer;
  mcpShikenSchemas: typeof mcpShikenSchemas;
  mcpStoriesSchemas: typeof mcpStoriesSchemas;
  offline: typeof offline;
  offlineValidators: typeof offlineValidators;
  quests: typeof quests;
  questsDomain: typeof questsDomain;
  questsStart: typeof questsStart;
  questsValidators: typeof questsValidators;
  readBudget: typeof readBudget;
  shikenMedia: typeof shikenMedia;
  shikenMediaHttp: typeof shikenMediaHttp;
  shikenMediaValidators: typeof shikenMediaValidators;
  stories: typeof stories;
  storiesDomain: typeof storiesDomain;
  storiesValidators: typeof storiesValidators;
  streak: typeof streak;
  study: typeof study;
  studyCards: typeof studyCards;
  studyProgress: typeof studyProgress;
  studyValidators: typeof studyValidators;
  users: typeof users;
  vocabulary: typeof vocabulary;
  vocabularyDomain: typeof vocabularyDomain;
  vocabularyValidators: typeof vocabularyValidators;
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
