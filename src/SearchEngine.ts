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
 * ensuring responsive search behavior.
 */
export class SearchEngine {

    /** Searches for manual pages matching the given terms.
     *
     * This method is designed to be called from `getInitialResultSet()` in the 
     * search provider implementation. It queries the system man database using the 
     * `apropos` command with all specified search terms.
     * 
     * **NOTE** The search uses the `apropos --and` flag, meaning all provided
     * search terms must be present in a manual page's description for it to be 
     * considered a match. This provides a more specific and narrow set of results.
     * 
     * For each match, a unique identifier is produced in the form `section|pageName`,
     * which can later be used with `getPageInfo()` to retrieve full metadata.
     *
     * This method never throws — it returns an empty array `[]` on cancellation or 
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

        // One last check — GNOME Shell may cancel the operation asynchronously
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
     * This method never throws — it returns `null` on cancellation or any error,
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

        // One last check — GNOME Shell may cancel the operation asynchronously
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

            // Delegate actual parsing; may throw `CancelledError` internally
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
     * @param stdout - Raw output string from the command
     * @param cancellable - Optional `Gio.Cancellable` for cooperative cancellation
     * @returns Array of tuples containing `[pageName, section, description]`.
     * 
     * @throws {CancelledError} If operation is cancelled via cancellable */
    private parseOutput(stdout: string, cancellable?: Gio.Cancellable | null): ManPageMetaInfo[] {

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
        const lines = stdout.trim().split(/[\n\0]/).filter(line => line.trim());

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


// - - - - -
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
 *   intentionally not a replacement for a formal test suite like Gjs-Jasmine, 
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
 * run build && /usr/bin/env -S G_MESSAGES_DEBUG=Gjs-Console gjs -m ./dist/SearchEngine.js
 * ~~~
 * 
 * */
// /* Uncomment if you want to use
(async function test_block() {
    const System = imports.system;
    if (import.meta.url.split('/').pop() !== System.programInvocationName.split('/').pop()) {
        console.warn(`Module ${import.meta.url} contains a sandbox block!`);
    }
    else {

        // === Sandbox Block Boundary ===

        function arraysEqual<T>(a: T[], b: T[]): boolean {
            return a.length === b.length &&
                JSON.stringify(a) === JSON.stringify(b);
        }

        async function main() {

            console.log('\n\n\n=== Sandbox Start ===\n\n');

            const searchEngine = new SearchEngine();

            // проверяем что `parseOutput` даст одинаковый результат как ... так и
            if ('parseOutput' in searchEngine && typeof searchEngine['parseOutput'] === 'function') {

                console.assert(
                    arraysEqual(
                        searchEngine['parseOutput']('ls (1) - list directory contents')[0],
                        ["ls", "1", "list directory contents"]),
                    'nooooooooooooooooo'
                );

                // должен правильно работать как с \n так и с \0
                const testLines1 = "" +
                    "aaa (1)   - ccc\n" +
                    "bbb (2)   - xxx\n";

                const testLines2 = "" +
                    "aaa (1)   - ccc\0" +
                    "bbb (2)   - xxx\0";

                console.assert(
                    arraysEqual(
                        searchEngine['parseOutput'](testLines1),
                        searchEngine['parseOutput'](testLines2)
                    ),
                    'noooooooooooooooooooo2'
                );

                console.log(

                    searchEngine['parseOutput'](testLines1),
                    searchEngine['parseOutput'](testLines2)
                );

            }

            console.log('--- ---');

            if ('getPageInfo' in searchEngine && typeof searchEngine['getPageInfo'] === 'function') {

                console.assert(await searchEngine['getPageInfo']('1|printf') !== null, 'naht!!!!');
                console.assert(await searchEngine['getPageInfo']('225|pupa') === null, 'nayn! nayn! nayn!'); // оказалось достаточно трудным найти не существующую команду
            }

            console.log('--- ---');


            // Test Т: Cancellation during a long-running subprocess
            // This is critical for a responsive GNOME Shell search provider. This test 
            // verifies that cancellation stops the external command and prevents errors.
            if ('runSubprocess' in searchEngine && typeof searchEngine['runSubprocess'] === 'function') {

                const cancellable = new Gio.Cancellable();
                const command = "apropos --and '..'"; // это найдет все страницы, что может занять время

                console.log('Test 1: Testing cancellation of long-running process...');

                // Schedule the cancellation to happen almost immediately
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
                    cancellable.cancel();
                    return GLib.SOURCE_REMOVE;
                });

                const result1 = await searchEngine['runSubprocess'](command, cancellable);

                // Should return null (the error handling branch) due to cancellation
                console.assert(result1 === null, 'Test 1 Failed: runSubprocess did not return null after cancellation.');
                console.log(`Test 1 Result: ${result1 === null ? 'Passed' : 'Failed'}. (Expected: null)`);

                // если не прерывать - та же команда найдет много результатов
                const result2 = await searchEngine['runSubprocess'](command);
                console.assert((result2?.length ?? 0) > 0, '....');
                console.log(`Test 1 Result: ...`);

                // можешь проверить в терминале что не осталось высящих процессов:
                // 〉pgrep apropos | wc -l

            }


            // Test T: searchManPages with empty terms
            // Input/Output Edge Case (Empty Terms)
            // Ensure searchManPages gracefully handles no input terms, which should result 
            // in an empty array and avoid running an unnecessary, potentially broad command
            //  like "apropos --and"
            // Но, это невероятная ситуация для поискового провайдера в GNOME Shell.
            if ('searchManPages' in searchEngine && typeof searchEngine['searchManPages'] === 'function') {
                console.log('Test 2: Testing searchManPages with empty terms...');
                const emptyResult = await searchEngine['searchManPages']([]);

                // выполнит команду, но парсер не сможет парсить ответ
                console.assert(arraysEqual(emptyResult, []), 'Test 2 Failed: searchManPages with [] did not return [].');
                console.log(`Test 2 Result: ${arraysEqual(emptyResult, []) ? 'Passed' : 'Failed'}. (Expected: [])`);
            }


            // Test 3: getPageInfo for a specific page (e.g., 'bash')
            // Specific getPageInfo Retrieval(Data Integrity)
            // Verify that a specific, known page is retrieved correctly with its full, 
            // untruncated description.
            if ('getPageInfo' in searchEngine && typeof searchEngine['getPageInfo'] === 'function') {
                console.log('Test 3: Testing getPageInfo for a known page (1|bash)...');

                const bashInfo = await searchEngine['getPageInfo']('1|bash');

                // Check for correct format and non-empty description
                const isCorrect = bashInfo !== null && bashInfo[0] === 'bash (1)' && bashInfo[1].length > 10;

                console.assert(isCorrect, 'Test 3 Failed: getPageInfo for 1|bash returned unexpected data or format.');
                console.log(`Test 3 Result: ${isCorrect ? 'Passed' : 'Failed'}. (Title: ${bashInfo ? bashInfo[0] : 'null'})`);
            }


        }

        // === Sandbox Block Boundary ===


        main()
            .catch((error) => {
                console.error('Sandbox Main Function Unexpected Error:', error);
            })
            .finally(() => {
                console.log('\n\n\nSandbox: C-c to exit');
            });

        await new GLib.MainLoop(null, false).runAsync();

    }
})()
    .catch(error => {
        console.error('Sandbox Unexpected Error:', error);
    });
// */