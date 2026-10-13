/* Which list to open, and which lists are past or next. Shared by app.js and scripts/test_default_list.js.
   List dates are "YYYY-MM-DD" in local time. */
(function (root) {
  "use strict";
  /* On a test day the app keeps showing that day's list until this hour (local time), then moves on. */
  var TEST_DAY_CUTOFF_HOUR = 15;

  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function sortLists(ls) { return (ls || []).slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); }); }
  /* A list is done with once its test day has passed, or from the cutoff hour on the test day itself. */
  function isPast(l, now) {
    if (!l || !l.date) return false;
    var t = ymd(now);
    return l.date < t || (l.date === t && now.getHours() >= TEST_DAY_CUTOFF_HOUR);
  }
  /* The next list still to be tested: today's before the cutoff, else the first dated after today. Null if none. */
  function nextUpcoming(lists, now) {
    var s = sortLists(lists);
    for (var i = 0; i < s.length; i++) if (s[i].date && !isPast(s[i], now)) return s[i].id;
    return null;
  }
  /* The list to open by default: the next upcoming one, or the latest list if every test is past. */
  function pickDefaultList(lists, now) {
    var s = sortLists(lists);
    return nextUpcoming(s, now) || (s.length ? s[s.length - 1].id : null);
  }

  var api = { TEST_DAY_CUTOFF_HOUR: TEST_DAY_CUTOFF_HOUR, ymd: ymd, sortLists: sortLists, isPast: isPast, nextUpcoming: nextUpcoming, pickDefaultList: pickDefaultList };
  if (typeof module === "object" && module.exports) module.exports = api; else root.TXLists = api;
})(this);
