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

// Promisify Gio async methods to use with async/await
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
Gio._promisify(Gio.Subprocess.prototype, 'wait_async');

// Tuple type for man page metadata: [name, section, description]
type ManPageMetaInfo = [pageName: string, section: string, description: string];

// Custom error class for operation cancellation
export class CancelledError extends Error {
    constructor() {
        super('Operation cancelled');
        this.name = 'CancelledError';
    }
}

/** Search engine for system manual pages.
 * 
 * This class is part of an example implementation of a search provider for 
 * GNOME Shell.
 *
 * ## Architecture Notes
 * 
 * This class is designed as a **base search engine** that implements the core 
 * search logic. The architectural intent is:
 * 
 * - **Inheritance approach** (primary design): A subclass extending this engine 
 *   should implement the `SearchProvider2` interface from GNOME Shell, integrating 
 *   this search engine into the Shell's search system. This is why methods are 
 *   marked as `protected` rather than `public` - they form an internal API for 
 *   the inheriting search provider class.
 * 
 * - **Alternative approaches**: This is just one way to structure a search provider.
 *   Your implementation might use composition, functional programming, services, 
 *   or any other pattern that fits your project's needs. Don't follow this example 
 *   blindly - analyze your requirements and choose an architecture that makes sense 
 *   for your specific use case.
 * 
 * The `protected` visibility reflects my design choice for this particular example.
 * Evaluate what works best for your extension rather than copying patterns without 
 * understanding their trade-offs.
 * 
 * ## Core Methods
 * 
 * It provides two main methods used by the search provider:
 * 
 * - `searchManPages()` - Searches for and builds a list of identifiers for 
 *   found manual pages.  
 *   Used in `getInitialResultSet()` to populate search results.
 * 
 * - `getPageInfo()` - Returns metadata for a page by its identifier.  
 *   Used in `getResultMetas()` to build `ResultMeta` objects for display in 
 *   the Shell.
 * 
 * Both methods are asynchronous and implement cancellation support via 
 * `Gio.Cancellable`, which is crucial for search provider implementation. This 
 * allows GNOME Shell to cancel ongoing searches when the user types new queries, 
 * ensuring responsive search behavior. */
export class SearchEngine {

    /** Searches for manual pages matching the given terms.
     *
     * This method is designed to be called from `getInitialResultSet()` in the 
     * search provider implementation. It queries the system man database using the 
     * `apropos` command with all specified search terms.
     * 
     * **NOTE:** The search uses the `apropos --and` flag, meaning all provided
     * search terms must be present in a manual page's description for it to be 
     * considered a match. This provides a more specific and narrow set of results.
     * 
     * For each match, a unique identifier is produced in the form `section|pageName`,
     * which can later be used with `getPageInfo()` to retrieve full metadata.
     *
     * This method never throws - it returns an empty array `[]` on cancellation or 
     * any error, allowing the search provider to gracefully handle interrupted 
     * searches.
     * 
     * See:
     * - {@link runSubprocess | runSubprocess Method}
     * - {@link ManPageMetaInfo | ManPageMetaInfo Type}
     *
     * @param terms - List of search terms from the user's query
     * @param cancellable - Optional `Gio.Cancellable` to support early termination
     * @returns an array of identifiers in the form `section|pageName` */
    protected async searchManPages(terms: string[], cancellable?: Gio.Cancellable): Promise<string[]> {

        // console.debug('\n' +
        //     `SearchEngine: searchManPages(terms: ${JSON.stringify(terms)}), ` +
        //     `cancellable: ${cancellable?.constructor.name}`
        // );

        // Abort early if already cancelled
        if (cancellable?.is_cancelled()) return [];

        // Run `apropos` to search the man database for all provided terms.
        // Returns an array of `ManPageMetaInfo` tuples for matching pages.
        // Debugging tip: Replace with `sleep infinity` to emulate an infinitely long 
        // search and observe when and under what conditions the GNOME Shell runtime 
        // cancels this operation.
        const parsedResults = await this.runSubprocess(`apropos --and ${terms.join(' ')}`, cancellable);

        // Handle cancellation, errors, or empty results
        if (
            parsedResults === null ||
            parsedResults.length === 0 ||
            cancellable?.is_cancelled()
        ) {
            console.debug("SearchEngine: searchManPages> 'apropos' cancelled or returned empty results");
            return [];
        }

        // Build unique identifiers for search results
        // Format: `section|pageName` - this will be passed back to `getPageInfo()`
        // Note: we discard the description from apropos since it may be truncated.
        // Full descriptions will be fetched later via `getPageInfo()` using `whatis`.
        const identifiers = parsedResults.map(([pageName, section, _]) => {
            return `${section}|${pageName}`;
        });

        // **IMPORTANT**: cancellable can be interrupted at any moment from 
        // **another thread**, and this is not a synchronous JavaScript event. 
        // GNOME Shell may cancel the search asynchronously, so we must check 
        // cancellation status even after seemingly completed async operations.

        // One last check - GNOME Shell may cancel the operation asynchronously
        if (cancellable?.is_cancelled()) return [];

        return identifiers;
    }


    /** Retrieves a detailed description of a manual page as a tuple 
     * `[title, description]` to build a `ResultMeta` object.
     * 
     * This method is designed to be called from `getResultMetas()` in the search 
     * provider implementation. It fetches the full description for a specific 
     * manual page using the `whatis` command, which preserves complete description 
     * text.
     * 
     * The returned tuple contains:
     * - `title`: formatted as `page (section)` for display in search results
     * - `description`: full description text for the result subtitle
     * 
     * This method never throws - it returns `null` on cancellation or any error,
     * allowing the search provider to skip unavailable results gracefully.
     * 
     * See:
     * - {@link runSubprocess | runSubprocess Method}
     * - {@link ManPageMetaInfo | ManPageMetaInfo Type}
     *
     * @param identifier - Unique page identifier in the form `section|page` (from `searchManPages()`)
     * @param cancellable - Optional `Gio.Cancellable` to support early termination
     * @returns a tuple `[title, description]` or `null` if cancelled or failed */
    protected async getPageInfo(
        identifier: string,
        cancellable?: Gio.Cancellable
    ): Promise<[title: string, description: string] | null> {

        // console.debug('\n' +
        //     `SearchEngine: getPageInfo(terms: ${identifier}, ` +
        //     `cancellable: ${cancellable?.constructor.name}`
        // );

        // Abort early if already cancelled
        if (cancellable?.is_cancelled()) return null;

        // Run `whatis` to obtain the full page description.
        // Split identifier "section|page" for whatis arguments.
        // Returns an array with a single `ManPageMetaInfo` tuple.
        // Debugging tip: Replace with `sleep infinity` to emulate an infinitely long 
        // search and observe when and under what conditions the GNOME Shell runtime 
        // cancels this operation.
        const parsedResults = await this.runSubprocess(`whatis -l -s ${identifier.split('|').join(' ')}`, cancellable);

        // Handle cancellation, errors, or empty results
        if (
            parsedResults === null ||
            parsedResults.length === 0 ||
            cancellable?.is_cancelled()
        ) {
            console.debug("SearchEngine: getPageInfo> 'whatis' cancelled or returned empty results");
            return null;
        }

        // Extract the single result: [page, section, description]
        const pageInfoTuple = parsedResults[0];

        // One last check - GNOME Shell may cancel the operation asynchronously
        if (cancellable?.is_cancelled()) return null;

        // Format result for ResultMeta: title as "page (section)" and full description
        return [`${pageInfoTuple[0]} (${pageInfoTuple[1]})`, pageInfoTuple[2]];

    }


    /** Runs a command and returns parsed output as an array of `ManPageMetaInfo` 
     * tuples.
     * 
     * Core utility method for executing `whatis` or `apropos` commands with proper
     * cancellation support. This ensures the search provider can interrupt long-running
     * operations.
     * 
     * Returns `null` on cancellation or any error (never throws), maintaining
     * the robustness required for GNOME Shell integration.
     * 
     * See:
     * - {@link parseOutput | parseOutput method}
     * - {@link ManPageMetaInfo | ManPageMetaInfo Type}
     *
     * @param command - Full command line to execute
     * @param cancellable - Optional `Gio.Cancellable` for cooperative cancellation */
    private async runSubprocess(command: string, cancellable?: Gio.Cancellable): Promise<ReturnType<SearchEngine['parseOutput']> | null> {

        // console.debug('\n' +
        //     `SearchEngine: runSubprocess(command: '${command}', ` +
        //     `cancellable: ${cancellable?.constructor.name}`
        // );

        // Abort early if the operation was already cancelled by Shell
        if (cancellable?.is_cancelled()) return null;

        // Parse command string into argv array.
        // `shell_parse_argv` does not perform shell expansions, thereby reducing 
        // the risk of additional commands being executed (command injection).
        const [success, argv] = GLib.shell_parse_argv(command);

        // Stop if the command line could not be parsed
        if (!success || argv === null) {
            console.error(`SearchEngine: runSubprocess> Failed to parse command: '${command}'`);
            return null;
        }

        console.debug(`SearchEngine: runSubprocess> Run subprocess: '${argv.join(' ')}'`);

        // Create subprocess capturing both stdout and stderr
        const subprocess = Gio.Subprocess.new(
            argv,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        try {

            // Read process output asynchronously with cancellable
            const [stdout, stderr] = await subprocess.communicate_utf8_async(null, cancellable ?? null);

            // Log stderr output (useful for debugging)
            if (stderr?.trim() !== '') console.warn(`SearchEngine: runSubprocess> Subprocess error message: ${stderr}`);

            // Delegate to the actual parsing method; may throw `CancelledError` internally
            return this.parseOutput(stdout, cancellable);


        } catch (error) {

            // Handle both Gio and custom cancellation errors
            if (
                (error instanceof GLib.Error && error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)) ||
                error instanceof CancelledError
            ) {
                console.debug('SearchEngine: runSubprocess> Process cancelled by Shell');
            }
            else {
                console.error('SearchEngine: runSubprocess> Unexpected error:', error);
            }

            return null;

        }
        finally {

            // Always ensure subprocess termination to prevent resource leaks
            // in the search provider. force_exit() is idempotent and safe on Unix
            console.debug('SearchEngine: runSubprocess> Subprocess force exit');
            subprocess?.force_exit();
        }
    }


    /** Parses output from 'whatis' or 'apropos' commands into structured data.
     * 
     * Converts raw command output into typed tuples that can be used to build
     * search results and metadata for the GNOME Shell search provider.
     * 
     * Supports cancellation even during parsing to ensure responsive search behavior.
     * 
     * See:
     * - {@link ManPageMetaInfo ManPageMetaInfo Type}
     * 
     * @param output - Raw output string from the command
     * @param cancellable - Optional `Gio.Cancellable` for cooperative cancellation
     * @returns Array of tuples containing `[pageName, section, description]`.
     * 
     * @throws {CancelledError} If operation is cancelled via cancellable */
    private parseOutput(output: string, cancellable?: Gio.Cancellable | null): ManPageMetaInfo[] {

        // console.debug('\n' +
        //     `SearchEngine: parseOutput(stdout: '\n${stdout}\n', ` +
        //     `cancellable: ${cancellable?.constructor.name ?? 'no'}`
        // );

        // Abort early if the operation was already cancelled
        if (cancellable?.is_cancelled()) throw new CancelledError();

        // Initialize result array for parsed man page entries
        const results: [
            pageName: string,
            section: string,
            description: string
        ][] = [];

        // Split by newlines or null chars, filter out empty lines
        const lines = output.trim().split(/[\n\0]/).filter(line => line.trim());

        for (const line of lines) {

            // Parse man page format: "page (section) - description"
            // Example: "ls (1) - list directory contents"
            const match = line.match(/^([^\s]+)\s*\(([^)]+)\)\s*-\s*(.+)/);

            if (match) {
                // Extract and trim captured groups (skip full match at index 0)
                const [, pageName, section, description] = match;
                results.push([pageName.trim(), section.trim(), description.trim()]);
            }
            else {
                // Log unparseable lines for debugging (should be rare with standard man pages)
                console.warn(`SearchEngine: parseOutput> Could not parse line: "${line}"`);
            }

            // Check for cancellation during processing
            if (cancellable?.is_cancelled()) {
                console.debug('SearchEngine: parseOutput> Parsing cancelled');
                throw new CancelledError();
            }
        }

        console.debug(`SearchEngine: parseOutput> Parsed ${results.length} line(s)`);
        return results;
    }

}


// ==================================================
/** Debugging and Prototyping Block
 * 
 * This section is a sandbox for rapidly debugging, prototyping, and manually 
 * verifying the core logic of the `SearchEngine` class outside of the main 
 * GNOME Shell environment.
 * 
 * Since the `SearchEngine` class does not rely on the Shell API and is designed 
 * as a standalone module, it can be tested independently, outside of the 
 * GNOME Shell environment.
 * 
 * It executes **only when** this module is running directly.
 * 
 * Key Features and Purpose:
 *
 * - Self-Contained Execution: It allows the `SearchEngine` module to be run 
 *   using
 *   
 *   ~~~sh
 *   gjs -m ./dist/SearchEngine.js
 *   ~~~
 *   
 *   for quick iteration without needing the GNOME Shell extension environment.
 * 
 * - Manual Verification: It may contain basic assertions (console.assert) to 
 *   verify critical internal methods.
 * 
 * - No Test Framework: It provides a lightweight, quick-check mechanism, 
 *   intentionally not a replacement for a formal test suite like 'Jasmine GJS', 
 *   which should be used for comprehensive, automated testing.
 * 
 * - Prototyping: It's a convenient place to test complex logic, error handling, 
 *   and other behavior. 
 * 
 * - GLib MainLoop: The use of `GLib.MainLoop` ensures that asynchronous 
 *   operations (like `Gio.Subprocess`) have a run context to complete before 
 *   the program exits.
 * 
 * Usage:
 * 
 * Rebuild and run:
 * 
 * ~~~sh
 * npm run build && gjs -m ./dist/SearchEngine.js
 * ~~~
 * 
 * Run with debug output:
 * 
 * ~~~sh
 * npm run build && /usr/bin/env -S G_MESSAGES_DEBUG=Gjs-Console gjs -m ./dist/SearchEngine.js
 * ~~~
 * 
 * See:
 * - {@link https://gjs-docs.gnome.org/gjs-mainloop/ |  Mainloop module GJS}
 * - {@link https://gjs.guide/guides/gjs/asynchronous-programming.html | Asynchronous Programming}
 * - {@link https://gjs.guide/extensions/development/debugging.html#gjs-console | Debug in GJS Console}
 * - {@link https://github.com/ptomato/jasmine-gjs | Jasmine GJS}
 * 
 * */
/* Uncomment if you want to use it
// ===============================
(async function test_block() {
    const System = imports.system;
    // to prevent execution in production
    if (import.meta.url.split('/').pop() !== System.programInvocationName.split('/').pop()) {
        console.warn(`Module ${import.meta.url} contains a sandbox block!`);
    }
    else {

        // === Sandbox Block Boundary ===

        // Helper to compare arrays
        function arraysEqual<T>(a: T[], b: T[]): boolean {
            return a.length === b.length &&
                JSON.stringify(a) === JSON.stringify(b);
        }

        async function main() {

            print('\n' + '='.repeat(50));
            print('SANDBOX TEST SUITE START');
            print('='.repeat(50));

            const searchEngine = new SearchEngine();

            // Test parseOutput method
            if ('parseOutput' in searchEngine && typeof searchEngine['parseOutput'] === 'function') {

                print('');
                print('Test: `parseOutput` method');
                print('-'.repeat(30));

                // Basic parsing test

                const result1 = searchEngine['parseOutput']('ls (1) - list directory contents')[0];
                const expected1 = ["ls", "1", "list directory contents"];

                if (arraysEqual(result1, expected1)) { console.log('Basic parsing: PASSED'); }
                else { console.error('Failed: Basic parsing'); }

                // Test with both \n and \0 separators

                const testLines1 = "aaa (1)   - ccc\nbbb (2)   - xxx\n";
                const testLines2 = "aaa (1)   - ccc\0bbb (2)   - xxx\0";

                const parsed1 = searchEngine['parseOutput'](testLines1);
                const parsed2 = searchEngine['parseOutput'](testLines2);

                if (arraysEqual(parsed1, parsed2)) { console.log('Separator handling (\\n vs \\0): PASSED'); }
                else { console.error('Failed: Separator handling'); }

            }

            // Test getPageInfo method
            if ('getPageInfo' in searchEngine && typeof searchEngine['getPageInfo'] === 'function') {

                print('');
                print('Test: `getPageInfo` method');
                print('-'.repeat(30));

                // Test existing page

                const existingPage = await searchEngine['getPageInfo']('1|printf');

                if (existingPage !== null) { console.log('Existing page (1|printf): FOUND'); }
                else { console.error('Failed: Existing page retrieval'); }

                // Test non-existing page

                const nonExistingPage = await searchEngine['getPageInfo']('225|nonexistent');

                if (nonExistingPage === null) { console.log('Non-existing page: CORRECTLY RETURNED NULL'); }
                else { console.error('Failed: Non-existing page check'); }
            }

            // Test cancellation mechanism
            if ('runSubprocess' in searchEngine && typeof searchEngine['runSubprocess'] === 'function') {

                print('');
                print('Test: Cancellation mechanism');
                print('-'.repeat(30));

                // Test cancel long-running process
                const cancellable = new Gio.Cancellable();
                const command = "apropos --and '..'"; // Finds all pages (potentially slow)

                // Schedule cancellation after 30ms
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
                    cancellable.cancel();
                    return GLib.SOURCE_REMOVE;
                });

                const result1 = await searchEngine['runSubprocess'](command, cancellable);

                // Should return null (the error handling branch) due to cancellation
                if (result1 === null) { console.log('Cancellation: SUCCESSFUL'); }
                else { console.error('Failed: Process was not cancelled'); }

                // Test same command without cancellation
                console.log('Running same command without cancellation...');
                const normalResult = await searchEngine['runSubprocess'](command);
                const hasResults = (normalResult?.length ?? 0) > 0;
                if (!hasResults) { console.error('Failed: Normal execution'); }
                console.log(`Normal execution: FOUND ${normalResult?.length ?? 0} results`);
            }

            // Test multiple concurrent cancellations
            if ('runSubprocess' in searchEngine && typeof searchEngine['runSubprocess'] === 'function') {

                print('');
                print('Test: Concurrent process cancellation');
                print('-'.repeat(30));

                const infiniteCommand = "sleep infinity"; // Never-ending process

                // Start three concurrent processes
                const cancellable1 = new Gio.Cancellable();
                const cancellable2 = new Gio.Cancellable();
                const cancellable3 = new Gio.Cancellable();

                searchEngine['runSubprocess'](infiniteCommand, cancellable1);
                searchEngine['runSubprocess'](infiniteCommand, cancellable2);
                searchEngine['runSubprocess'](infiniteCommand, cancellable3);

                console.log('Started 3 concurrent infinite processes');

                // Cancel all processes
                cancellable1.cancel();
                cancellable2.cancel();
                cancellable3.cancel();

                console.log('All processes must be cancelled');
                console.log('Note: Verify no orphaned processes with: pgrep sleep | wc -l # must be 0');

            }

            // Test edge case: empty search terms
            if ('searchManPages' in searchEngine && typeof searchEngine['searchManPages'] === 'function') {

                print('');
                print('Test: Edge case - empty search terms');
                print('-'.repeat(30));

                const emptyResult = await searchEngine['searchManPages']([]);
                const isEmptyArray = arraysEqual(emptyResult, []);

                if (isEmptyArray) { console.log('Empty search terms: CORRECTLY RETURNED []'); }
                else { console.error('Failed: Empty terms handling'); }
            }


            // Test specific page retrieval
            if ('getPageInfo' in searchEngine && typeof searchEngine['getPageInfo'] === 'function') {

                print('');
                print('Test: Known page retrieval (bash)');
                print('-'.repeat(30));

                const bashInfo = await searchEngine['getPageInfo']('1|bash');
                const isValid = bashInfo !== null &&
                    bashInfo[0] === 'bash (1)' &&
                    bashInfo[1].length > 10;

                if (isValid) {
                    console.log(`Retrieved: ${bashInfo[0]}`);
                    console.log(`Description length: ${bashInfo[1].length} chars`);
                }
                else { console.error('Failed: bash page retrieval'); }
            }

            print('');
            print('='.repeat(50));


        }

        // === Sandbox Block Boundary ===


        main()
            .catch((error) => {
                console.error('ERROR: Sandbox execution failed:', error);
            })
            .finally(() => {
                print('\n\nPress Ctrl+C to exit');
            });

        await new GLib.MainLoop(null, false).runAsync();

    }
})()
    .catch(error => {
        console.error('FATAL: Sandbox Unexpected Error:', error);
    });
*/