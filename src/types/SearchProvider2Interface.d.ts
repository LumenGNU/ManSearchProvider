/**
 * @license CC0-1.0
 * The author dedicates this file to the public domain via CC0 1.0 Universal.
 * 
 * To the extent possible under law, the author has waived all copyright
 * and related or neighboring rights to this work.
 * 
 * You can copy, modify, distribute and perform the work, even for commercial
 * purposes, all without asking permission.
 * 
 * Note: This dedication applies to this file as provided. Recipients may
 * incorporate it into projects with different licensing terms.
 * 
 * SPDX-License-Identifier: CC0-1.0
 */

import type Gio from 'gi://Gio';
import type Clutter from 'gi://Clutter';

import type { ResultMeta } from './ResultMetaInterface.js';
export type { ResultMeta } from './ResultMetaInterface.js';

/**  Contract interface between GNOME Shell and Shell extensions that implement
 * a search provider.
 * 
 * This interface defines the required methods and properties that must be 
 * implemented by any Shell extension to provide custom search functionality
 * integrated with GNOME Shell's search system.
 * 
 * [See Search Provider Implementation Example for more information](https://github.com/LumenGNU/ManSearchProvider) */
export interface SearchProvider2 {


    /** Unique string identifier of the search provider in the system. */
    readonly id: string;


    /** The search provider's `GAppInfo`. */
    readonly appInfo: Gio.AppInfo | null;


    /** Controls the visibility of the "Show more results" action. */
    readonly canLaunchSearch: boolean;


    /** Handles Shell's request for an initial search and returns 
     * string identifiers of the found results.
     * 
     * **NOTE**: The implementation **must** abort the search upon signal from the 
     * `cancellable` object.
     * 
     * @param terms Array of search terms
     * @param cancellable Object for cancelling the operation
     * @returns Promise that resolves to an array of result identifiers */
    getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]>;


    /** Handles Shell's request to refine search results when new 
     * search terms are added.
     * 
     * Returns a subset of the original result set or the result of a new 
     * search.
     * 
     * **NOTE**: The implementation **must** abort the search upon signal from the 
     * `cancellable` object.
     * 
     * @param previousIdentifiers Result identifiers from the previous search
     * @param terms Array of new search terms
     * @param cancellable Object for cancelling the operation
     * @returns Promise that resolves to an array of result identifiers */
    getSubsearchResultSet(previousIdentifiers: string[], terms: string[], cancellable: Gio.Cancellable): Promise<string[]>;


    /** Handles Shell's request to reduce the number of displayed results
     * for the current search.
     * 
     * @param identifiers Complete list of current result identifiers
     * @param maxResults Desired maximum number of results to display
     * @returns Truncated array of result identifiers */
    filterResults(identifiers: string[], maxResults: number): string[];


    /** Handles Shell's request to retrieve result metadata for display 
     * in the UI.
     * 
     * **NOTE**: The implementation **must** abort processing upon signal from the 
     * `cancellable` object.
     * 
     * @param identifiers List of identifiers
     * @param cancellable Object for cancelling the operation
     * @returns Promise that resolves to an array of metadata for each 
     *   result from `identifiers` */
    getResultMetas(identifiers: string[], cancellable: Gio.Cancellable): Promise<ResultMeta[]>;


    /** Handles Shell's request to retrieve a custom widget for 
     * displaying the result.
     * 
     * @param meta Result metadata
     * @returns Custom widget or `null` for default rendering */
    createResultObject(meta: ResultMeta): Clutter.Actor | null;


    /** Handles Shell's request to activate a search result.
     *
     * @param identifier Identifier of the activated result
     * @param terms Search terms that led to this result */
    activateResult(identifier: string, terms: string[]): void;


    /** Handles Shell's request to activate the "Show more results" action for 
     * current search terms.
     * 
     * @param terms Current search terms */
    launchSearch(terms: string[]): void;
}




