/** 
 * @fileoverview
 * Watches a directory recursively and triggers a callback when files change.
 */
import minify from "@wc-build/minify";
import path from "path";
import fs from "fs";

const DEFAULT_DELAY = 500;
const DEFAULT_ROOT = ".";

// Cache: filename → minified content
const cache = new Map;

let rootDir = DEFAULT_ROOT,
    ignoreList = [],
    startupFiles,
    runDelay = DEFAULT_DELAY;

/**
 * Check if the file content has changed by comparing minified content.
 * @param {string} filename
 * @returns {Promise<boolean>} Whether file content is unchanged.
 */
async function isCached(filename) {
    try {
        filename = path.resolve(filename);
        const minContent = await minify(
            path.extname(filename), 
            fs.readFileSync(filename, { encoding: "utf8" })
        );
        const test = minContent == cache.get(filename);
        if (!test) cache.set(filename, minContent);
        return test;
    } catch (error) {
        console.error(error);
        return false;
    }
}

/** Check if a path is a regular file (not symlink). */
function isFile(filename) {
    const stat = fs.statSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
}

/** Determine whether a file exists, changed, and is not ignored. */
async function shouldKeep(filename) {
    return fs.existsSync(filename) &&
        isFile(filename) &&
        !(await isCached(filename)) &&
        !ignoreList.test(filename);
};

/** Get list of initial files to prime cache or use startup override. */
function getStartupFiles() {
    startupFiles = (
        startupFiles
        ?? fs.globSync(`${rootDir}/**/*`, { exclude: ignoreList, nodir: true })
    ).filter(isFile);
    startupFiles.forEach(isCached);
    return startupFiles;
}

/** Emit and clear changed files set. */
function emitChangedFiles(files) {
    const changedFiles = [...files];
    files.clear();
    return changedFiles;
}

/**
 * Watch file changes and yield batches of modified files.
 * @param {Set<string>} files
 */
async function* watch(files) {
    const sleep = delay => new Promise(r => setTimeout(r, delay));
    // Attach recursive filesystem watcher
    fs.watch(
        rootDir,
        { recursive: true },
        async function () {
            const filename = rootDir.concat(path.sep).concat(arguments[1]);
            if (await shouldKeep(filename))
                files.add(filename);
        }
    );
    // Main generator loop
    while (true) {
        if (files.size)
            yield sleep(runDelay)
            .then(() => emitChangedFiles(files));
        await sleep(0);
    }
}

export default Object.freeze(new class {
    /**
     * Configure the watcher.
     * @param {object} param0
     * @param {string} param0.root
     * @param {string[]} param0.ignore
     * @param {{ files?: string[] }} param0.startup
     * @param {number} param0.delay
     */
    config({ root, ignore, startup : { files }, delay }) {
        if (fs.existsSync(root) && fs.statSync(root).isDirectory)
            rootDir = root;
        if (Array.isArray(ignore) && ignore.every(e => typeof e == "string"))
            ignoreList = ignore;
        if (Array.isArray(files) && files.every(f => fs.existsSync(f) && fs.statSync(f).isFile))
            startupFiles = files;
        if (typeof delay == "number" && delay > 500)
            runDelay = delay;
        return this;
    }

    /**
     * Start the restart loop.
     * @param {(files:string[])=>Promise<void>} callback
     */
    async onrestart(callback) {
        for await (const files of watch(new Set(getStartupFiles())))
            try {
                await callback(files);
            } catch (error) {
                console.error(error);
            } finally {
                console.info(
                    `Completed running '${path.relative(".", callback.path)}'. ` +
                    `Waiting for file changes before restarting...\n`
                );
            }
    }
});