#!/usr/bin/env node
/* Checks pickDefaultList (src/lists-logic.js): node scripts/test_default_list.js — exits non-zero on a failure. */
"use strict";
const path = require("path");
const fs = require("fs");
const { pickDefaultList, nextUpcoming, isPast, TEST_DAY_CUTOFF_HOUR } = require(path.join(__dirname, "..", "src", "lists-logic.js"));

// Weekly Tuesday tests, deliberately out of order (the function must sort them).
const LISTS = [
  { id: "l16", date: "2026-10-27" },
  { id: "l14", date: "2026-10-13" },
  { id: "l15", date: "2026-10-20" },
  { id: "l17", date: "2026-11-03" },
];
const at = (s) => new Date(s); // "YYYY-MM-DDTHH:MM" without a zone = local time, like the app

const cases = [
  ["morning of a test day → that day's list", at("2026-10-20T08:30"), "l15"],
  ["just before the cutoff → that day's list", at("2026-10-20T14:59"), "l15"],
  ["at the cutoff on a test day → the next list", at(`2026-10-20T${String(TEST_DAY_CUTOFF_HOUR).padStart(2, "0")}:00`), "l16"],
  ["afternoon of a test day → the next list", at("2026-10-20T17:45"), "l16"],
  ["a day between tests → the next list", at("2026-10-23T10:00"), "l16"],
  ["the day before a test → that test's list", at("2026-10-26T21:00"), "l16"],
  ["before the first list → the first list", at("2026-09-01T09:00"), "l14"],
  ["after the last list → the latest list", at("2026-12-25T09:00"), "l17"],
  ["afternoon of the last test day → the latest list", at("2026-11-03T16:00"), "l17"],
];

let failed = 0;
for (const [name, now, want] of cases) {
  const got = pickDefaultList(LISTS, now);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: got ${got}${ok ? "" : `, want ${want}`}`);
}
// Related helpers used for the Next tag and dimming.
const extra = [
  ["no upcoming list after the last test", nextUpcoming(LISTS, at("2026-12-25T09:00")) === null],
  ["test-day list is past from the cutoff", isPast(LISTS[2], at("2026-10-20T15:00")) && !isPast(LISTS[2], at("2026-10-20T14:59"))],
  ["empty data → null", pickDefaultList([], at("2026-10-20T09:00")) === null],
];
for (const [name, ok] of extra) { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); }

// Sanity check against the real data file.
const real = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "lists.json"), "utf8")).lists;
console.log(`real lists.json, now (${new Date().toString().slice(0, 21)}): default = ${pickDefaultList(real, new Date())}`);

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
