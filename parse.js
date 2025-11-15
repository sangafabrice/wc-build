/**
 * @fileoverview
 * Parses CLI arguments and loads the user‑provided script file.
 * Returns a structured object describing the watcher configuration.
 */
import path from "path";
import { pathToFileURL } from "url";
import { argv } from "process";
import fs from "fs";

/** CLI flag patterns */
const ROOT_PATTERN = /^--root=/i;
const IGNORE_PATTERN = /^--ignore=/i;
const DELAY_PATTERN = /^--delay=/i;

// Extract arguments after `node script.js`
const cliargs = argv.slice(2);

/** Parsed configuration */
const namedArgv = {
    root: ".", // Default root directory
    ignore: [], // Patterns to ignore
}

// Last argument is expected to be the script path
let scriptPath = cliargs.pop();

// Normalize and ensure `.js` extension
scriptPath = path.resolve(
    fs.existsSync(scriptPath) && fs.statSync(scriptPath).isDirectory()
        ? scriptPath.concat("/index.js")
        : path.matchesGlob(scriptPath, "**/*.js")
            ? scriptPath : scriptPath.concat(".js")
);

// Dynamically import the user script
const { default: build, startup } = (await import(pathToFileURL(scriptPath).href));

// Attach script function and startup settings
Object.assign(namedArgv, {
    script: Object.assign(build, { path: scriptPath }),
    startup: startup ?? {}
});

// Parse remaining CLI flags
cliargs.forEach(
    arg => 
        ROOT_PATTERN.test(arg)
            ? (namedArgv.root = arg.replace(ROOT_PATTERN, ""))
            : IGNORE_PATTERN.test(arg)
                ? namedArgv.ignore.push(arg.replace(IGNORE_PATTERN, ""))
                : DELAY_PATTERN.test(arg)
                    ? (namedArgv.delay = Number(arg.replace(DELAY_PATTERN, "")))
                    : null
);

// Prefix patterns with root for proper matching
const ROOT_PREFIX = `${namedArgv.root}/**/`;

namedArgv.ignore.forEach(
    (pattern, index, $this) => 
        $this[index] = (
                pattern.startsWith(ROOT_PREFIX) || pattern.startsWith(`${namedArgv.root}/`)
                    ? pattern : ROOT_PREFIX + pattern
            ).replace(/\/+$/, "/*") // ensure trailing wildcard
);

/**
 * Check whether a filename should be ignored.
 * @param {string} filename
 * @returns {boolean}
 */
namedArgv.ignore.test = function (filename) {
    return this.some(pattern => path.matchesGlob(filename, pattern));
}

export default namedArgv;