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

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';

import {
    SearchProvider2,
    ResultMeta
} from '@girs/gnome-shell/extensions/global';

import {
    SearchEngine
} from './SearchEngine.js';


/** Adapts SearchEngine for integration with GNOME Shell.
 * Implements the SearchProvider2 interface, serving as a bridge between 
 * GNOME Shell's search system and the search business logic. */
export class SearchProvider extends SearchEngine implements SearchProvider2 {

    private extensionId;


    /** Creates a new SearchProvider instance.
     * @param extensionId - The UUID of the extension */
    constructor(extensionId: string) {
        super();

        this.extensionId = extensionId;
    }


    /** Unique identifier of the provider in the system.
     * Used by GNOME Shell to distinguish between different search providers. */
    get id(): string {
        return this.extensionId;
    }


    /** AppInfo of the provider.
     * Determines how search results are grouped and displayed in GNOME Shell. */
    get appInfo(): Gio.AppInfo | null {

        // If we return null, the provider will be GNOME Shell itself,
        // and results will be displayed as icons rather than as a list
        // return null;

        // We can return a fake AppInfo, for example, yelp
        // return Gio.AppInfo.get_default_for_type('x-scheme-handler/help', false);

        // In this example, the search will be conducted "on behalf of" gnome-terminal,
        // which means results will be grouped in a block with the terminal icon
        // and the "Terminal" heading (considering localization)
        const app = Shell.AppSystem.get_default().lookup_app("org.gnome.Terminal.desktop");
        return app.appInfo;
    }


    /** Controls the visibility of the "Show more results" label.
     * @returns true if the label should be shown when there are many results */
    get canLaunchSearch(): boolean {

        // Will always be displayed if there are many results or if `filterResults`
        // has discarded some results
        return true;
    }


    /** Initiates a new search.
     * 
     * This method is called to start a new search and returns a list
     * of unique result identifiers.
     * 
     * If cancellable is triggered, this method should return an empty result
     * and stop the search immediately.
     * 
     * @param terms - Search terms entered by the user
     * @param cancellable - Cancellable action for the operation
     * @returns Array of result identifiers */
    async getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {

        // console.debug(`\nSearchProvider: getInitialResultSet(terms: ${JSON.stringify(terms, null, 2)}), cancellable: ${cancellable.constructor.name}`);

        // In all exceptional situations, we will return an empty result array

        // Check if the request has been cancelled before starting
        if (cancellable.is_cancelled()) return [];

        // Start search only if there's at least one term with minimum 2 characters
        if ((terms[0]?.length ?? 0) < 2) return [];

        console.debug(`SearchProvider: getInitialResultSet> start 'searchManPages' ...`);

        /** Launch our search using SearchEngine::searchManPages */
        const resultIdentifiers = await this.searchManPages(terms, cancellable);

        console.debug(`SearchProvider: getInitialResultSet> found '${resultIdentifiers.length}' results`);

        // **IMPORTANT**: cancellable can be interrupted at any moment from 
        // **another thread**, and this is not a synchronous JavaScript event. 
        // GNOME Shell may cancel the search asynchronously, so we must check 
        // cancellation status even after seemingly completed async operations.

        // One last check - GNOME Shell may cancel the operation asynchronously
        if (cancellable.is_cancelled()) return [];

        // Return the list of results
        // This array will be passed to other methods as `identifiers`
        return (resultIdentifiers);

    }


    /** Refines the current search.
     * 
     * Called when the user modifies the search query while results are already displayed.
     * Can optimize by filtering existing results instead of starting a new search.
     * 
     * @async
     * @param _previousIdentifiers - Original set of results from the previous search
     * @param terms - Updated search terms
     * @param cancellable - Cancellable action for the operation
     * @returns Subset of the original result set or new search results */
    async getSubsearchResultSet(_previousIdentifiers: string[], terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {

        // console.debug(`\nSearchProvider: getSubsearchResultSet(results: ${JSON.stringify(_previousResults, null, 2)}, ${JSON.stringify(terms, null, 2)}), cancellable: ${cancellable.constructor.name}`);

        if (cancellable.is_cancelled()) return [];

        // Simply launch a new search with updated terms
        // Note: Could be optimized to filter previousIdentifiers instead
        return this.getInitialResultSet(terms, cancellable);
    }


    /** Filters the current search results.
     *
     * This method is called to reduce the number of search results displayed.
     * GNOME Shell calls this when it needs to limit the number of visible results.
     *
     * @param identifiers - Original set of results
     * @param _maxResults - Desired maximum number of results (suggested by GNOME Shell)
     * @returns Filtered results array */
    filterResults(identifiers: string[], _maxResults: number): string[] {

        // console.debug(`\nSearchProvider: filterResults(results: ${results.length}, maxResults: ${_maxResults})`);

        // Ignore Shell's limitation and show slightly more results
        // (typically you would respect maxResults)
        const ourMax = 7;

        if (identifiers.length <= ourMax) return identifiers;

        return identifiers.slice(0, ourMax);
    }


    /** Get metadata for results.
     *
     * This method is called to obtain `ResultMeta` for each identifier.
     * GNOME Shell uses this metadata to display search results with icons,
     * titles, and descriptions.
     *
     * If cancellable is triggered, this method should abort work and return empty result.
     *
     * @async
     * @param identifiers - Result identifiers to get metadata for
     * @param cancellable - Cancellable action for the operation
     * @returns Array of result metadata objects */
    async getResultMetas(identifiers: string[], cancellable: Gio.Cancellable): Promise<ResultMeta[]> {

        // console.debug(`\nSearchProvider: getResultMetas(results: ${JSON.stringify(results, null, 2)}, cancellable: ${cancellable.constructor.name})`);

        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);

        // Check if the request has been cancelled before starting
        if (cancellable.is_cancelled()) return [];

        const resultMetas = [] as ResultMeta[];

        // Iterate through identifiers
        for (const identifier of identifiers) {

            if (cancellable.is_cancelled()) return [];

            // Call SearchEngine::getPageInfo
            const pageInfo = await this.getPageInfo(identifier, cancellable);

            // If result is null - either the process was interrupted or
            // an error occurred - in any case, there's no point in continuing
            if (!pageInfo) return [];

            const [name, description] = pageInfo;

            // Create and populate `ResultMeta` object for each result
            const meta: ResultMeta = {
                id: identifier,
                name: name,
                description: description,

                // Icon can be borrowed from an application
                // createIcon: (size) => Shell.AppSystem.get_default().lookup_app('org.gnome.Terminal.desktop').create_icon_texture(size),
                // Or,
                // if we specify a custom icon, we need to account for scaleFactor for its size
                createIcon: (size) => {
                    return new St.Icon({
                        // System Or custom icon - another way to do it:
                        // gicon: new Gio.FileIcon({
                        //   file: Gio.File.new_for_path(`${path}/my_awesome_icon.svg`),
                        // }),
                        icon_name: 'system-help',
                        width: size * scaleFactor,
                        height: size * scaleFactor,
                    });
                },
            };

            resultMetas.push(meta);
        }

        if (cancellable.is_cancelled()) return [];

        return resultMetas;

    }


    /** Create a result object.
     * 
     * This method is called to create a widget representing a search result.
     * Allows custom result rendering instead of default GNOME Shell appearance.
     *
     * @param _resultMeta - Result metadata object
     * @returns Actor for the result, or null to use default rendering  */
    createResultObject(_resultMeta: ResultMeta): Clutter.Actor | null {

        // console.debug(`SearchProvider: createResultObject(meta: ${JSON.stringify(resultMeta, null, 2)})`);

        // Could return a custom widget here:
        // return new St.Icon({ icon_name: 'face-smile-big' });

        // Return null to use GNOME Shell's default result rendering
        return null;
    }


    /** This method is called when a search result is activated.
     * 
     * If `ResultMeta` provides `clipboardText`, the corresponding text
     * will be placed in the clipboard in parallel.
     *
     * @param identifier - Result identifier (what is displayed as the activated result row)
     * @param _terms - Search terms (current content of the search bar) */
    activateResult(identifier: string, _terms: string[]): void {

        // console.debug(`\nSearchProvider: activateResult(result: ${result}, terms: ${JSON.stringify(terms, null, 2)})`);

        // This method is not required to do anything - it's optional

        const [section, name] = identifier.split('|');

        // Open man page in terminal
        // Using gnome-terminal to display the selected result
        // **NOTE: gnome-terminal won't be able to start inside a nested shell**
        try {
            console.debug(`SearchProvider: activateResult> spawn gnome-terminal for 'man ${section} ${name}' ...`);

            const [success, argv] = GLib.shell_parse_argv(
                `gnome-terminal -- man ${section} ${name}`
            );

            if (success && argv) {
                Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            }

        } catch (error) {
            console.error('SearchProvider: activateResult> Error activating result:', error);
        }
    }


    /** Launch the search provider application.
     * 
     * Called when user clicks "Show more results".
     * Shows all found man pages in the terminal.
     *
     * @param terms - Search terms */
    launchSearch(terms: string[]): void {

        // console.debug(`\nSearchProvider: launchSearch(terms: ${JSON.stringify(terms, null, 2)}])`);

        // This method is not required to do anything - it's optional

        // In this example we're using a subprocess, but it would be better to use
        // something more reliable and secure - like activation via D-Bus, for instance
        // **NOTE: gnome-terminal won't be able to start inside a nested shell**
        try {
            console.debug('SearchProvider: launchSearch> spawn gnome-terminal for show more results for terms ...');

            // Open terminal with apropos (same as man -k)
            // Shows all manual pages matching the search terms
            // **NOTE: gnome-terminal won't be able to start inside a nested shell**
            const [success, argv] = GLib.shell_parse_argv(
                `gnome-terminal -- bash -c "apropos ${terms.join(' ')}; read -p '\n\nPress Enter to close...'"`
            );

            if (success && argv) {
                Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            }

        } catch (error) {
            console.error('SearchProvider: launchSearch> Error launching search:', error);
        }
    }
}