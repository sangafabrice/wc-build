#!/usr/bin/env node

/**
 * @fileoverview
 * Entry point of the file‑watcher system. Parses CLI arguments and
 * configures the watcher before starting automatic restarts.
 */
import argv from "./parse.js";
import watcher from "./watch.js";

// Configure watcher with parsed CLI options, then start watching.
watcher.config({ ...argv }).onrestart(argv.script);