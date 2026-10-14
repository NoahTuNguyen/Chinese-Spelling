/* 听写 practice — static app. Data comes from data/lists.json (edit that file to add lists). */
(function () {
  "use strict";
  var root = document.getElementById("root");
  var pc = document.getElementById("parent"); /* Parent corner <dialog>, kept outside #root so re-renders don't close it */
  var ws = document.getElementById("weeks"); /* Week sheet <dialog> (choose a list) */

  /* ---------- storage helpers (per device) ---------- */
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  /* Ask once (when the first sticker is earned) for storage the browser won't clear on its own. */
  var persistAsked = false;
  function persistOnce() {
    if (persistAsked) return; persistAsked = true;
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(function (p) { if (!p) return navigator.storage.persist(); }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- state ---------- */
  /* tx-prefs: { slow, py, en, pics, dark }. Saves from before the redesign have no "pics" and had English on
     by default, so those start with English off like new devices. */
  var prefs = (function () {
    var p = lsGet("tx-prefs", {}); if (!p || typeof p !== "object") p = {};
    if (!("pics" in p)) { p.en = false; p.pics = true; }
    return { slow: !!p.slow, py: p.py !== false, en: !!p.en, pics: p.pics !== false, dark: !!p.dark, sound: p.sound !== false };
  })();
  function applyTheme() { document.documentElement.setAttribute("data-theme", prefs.dark ? "dark" : "light"); }
  applyTheme();
  /* focus/fi: Learn's one-word-at-a-time view and its word index. pic/pi: the picture card and its word index
     (picFrom: "learn" grid or "focus" mode, where closing it returns to). */
  var S = { lists: [], cur: null, mode: "learn", focus: false, fi: 0, pic: false, pi: 0, picFrom: "learn", write: null, playing: false, clearArm: false, resetArm: false, loading: true, loadError: "" };
  /* Dictation: phase idle → run → check → done. src "list" | "tricky"; retest = practising missed words again. */
  function newDict() { return { src: "list", listId: null, retest: false, queue: [], i: 0, phase: "idle", marks: {}, result: null }; }
  var D = newDict();
  /* Play tab: phase picker → run → end. q = questions { w, choices[], firstTry }, i = current question,
     wrong = choice indexes tried and wrong, solved = answered right, hint = pinyin shown, anim = one-off animation. */
  function newGame() { return { phase: "picker", game: null, listId: null, q: [], i: 0, wrong: [], solved: false, hint: false, anim: null, result: null }; }
  var G = newGame(), gTimer = null;
  var TOKEN = 0;
  /* Set just before the first render: voice detection can finish while this script is still starting up
     (some browsers have the voice list ready at once), and must not render before everything is defined. */
  var booted = false;

  /* ---------- helpers ---------- */
  var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAYL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  /* Date rules (default list, next, past) live in lists-logic.js so scripts/test_default_list.js can check them. */
  var TXL = window.TXLists;
  function todayStr() { return TXL.ymd(new Date()); }
  function nextId() { return TXL.nextUpcoming(S.lists, new Date()); }
  function defaultId() { return TXL.pickDefaultList(S.lists, new Date()); }
  /* Opening list: ?list=l15 overrides; otherwise the default. The last-viewed list is deliberately not remembered. */
  function pickDefault() {
    var q = new URLSearchParams(location.search).get("list");
    if (q && S.lists.some(function (l) { return l.id === q; })) return q;
    return defaultId();
  }
  function listById(id) { for (var i = 0; i < S.lists.length; i++) if (S.lists[i].id === id) return S.lists[i]; return null; }
  function curList() { return listById(S.cur); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function parseDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function fmtShort(s) { var d = parseDate(s); return d ? DAY[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()] : ""; }
  function fmtLong(s) { var d = parseDate(s); return d ? DAYL[d.getDay()] + " " + d.getDate() + " " + MONL[d.getMonth()] : ""; }
  function whenText(s) {
    var d = parseDate(s); if (!d) return "";
    var n = Math.round((d - parseDate(todayStr())) / 86400000);
    return n < 0 ? "Past list" : n === 0 ? "Test today" : n === 1 ? "Tomorrow" : "in " + n + " days";
  }
  function titleOf(l) { return "听写" + (l && l.number ? "（" + l.number + "）" : ""); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function toTop() { try { window.scrollTo(0, 0); } catch (e) {} }

  /* ---------- icons (inline SVG markup; colours come from CSS via currentColor) ---------- */
  var STAR = "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z";
  var LINE = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  function ic(size, inner, attrs) { return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ' + (attrs || LINE) + ">" + inner + "</svg>"; }
  function line(w) { return 'fill="none" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"'; }
  var SPK = '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>';
  var IC = {
    book: ic(22, '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>'),
    pencil: ic(22, '<path d="M17 3l4 4L8 20H4v-4z"/><path d="M14 6l4 4"/>'),
    star: ic(22, '<path d="' + STAR + '"/>'),
    gear: ic(24, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', line(2)),
    close: ic(20, '<path d="M6 6l12 12M18 6L6 18"/>', line(2.6)),
    play: ic(26, '<path d="M8 5.5v13l11-6.5z"/>', 'fill="currentColor"'),
    stop: ic(24, '<rect x="6" y="6" width="12" height="12" rx="2.5"/>', 'fill="currentColor"'),
    spk: ic(22, SPK + '<path d="M16 9a4.2 4.2 0 0 1 0 6"/>', line(2)),
    spkBig: ic(84, SPK + '<path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>', line(1.8)),
    spkMid: ic(26, SPK + '<path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>', line(1.8)),
    check: ic(16, '<path d="M5 12.5l4.5 4.5L19 7.5"/>', line(3.2)),
    happy: ic(30, '<circle cx="12" cy="12" r="9"/><path d="M8 14.5a5 5 0 0 0 8 0"/><path d="M9 9.5v.5M15 9.5v.5"/>', line(2)),
    sad: ic(30, '<circle cx="12" cy="12" r="9"/><path d="M8.5 16c1-.8 2.2-1.2 3.5-1.2s2.5.4 3.5 1.2"/><path d="M9 9.5v.5M15 9.5v.5"/>', line(2)),
    arrowR: ic(22, '<path d="M5 12h14M13 6l6 6-6 6"/>', line(2.8)),
    chevL: ic(34, '<path d="M15 5l-7 7 7 7"/>', line(2.6)),
    chevR: ic(34, '<path d="M9 5l7 7-7 7"/>', line(2.6)),
    grid: ic(22, '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
    one: ic(22, '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10.5 9.5l2-1.5v8"/>'),
    puzzle: ic(22, '<path d="M9.5 4.5a2.5 2.5 0 0 1 5 0V6H18a1 1 0 0 1 1 1v3.5h-1.5a2.5 2.5 0 0 0 0 5H19V19a1 1 0 0 1-1 1h-3.5v-1.5a2.5 2.5 0 0 0-5 0V20H6a1 1 0 0 1-1-1v-3.5h1.5a2.5 2.5 0 0 0 0-5H5V7a1 1 0 0 1 1-1h3.5z"/>'),
    tick: ic(22, '<path d="M5 12.5l4.5 4.5L19 7.5"/>', line(3.2)),
    bulb: ic(20, '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>', line(2))
  };
  function starFill(size) { return ic(size, '<path d="' + STAR + '"/>', 'fill="currentColor"'); }
  var RING = '<svg class="ring" viewBox="0 0 52 52" aria-hidden="true" focusable="false"><circle cx="26" cy="26" r="24" pathLength="100"/></svg>';

  /* ---------- speech (browser built-in voices) ---------- */
  var synth = window.speechSynthesis || null;
  var VOICE = null, voiceState = synth ? "loading" : "none";
  function chooseVoice() {
    if (!synth) { voiceState = "none"; return; }
    var vs = synth.getVoices() || []; if (!vs.length) return;
    function norm(l) { return (l || "").replace("_", "-").toLowerCase(); }
    var cn = vs.filter(function (v) { var l = norm(v.lang); return l === "zh-cn" || l === "cmn-cn" || l.indexOf("cmn-hans") === 0 || l === "zh-hans-cn" || l === "zh-sg" || l === "zh"; });
    function score(v) {
      var n = v.name || "", s = 0;
      if (/natural|online/i.test(n)) s += 6; if (/xiaoxiao|yunxi|xiaoyi/i.test(n)) s += 3; if (/google/i.test(n)) s += 4;
      if (/tingting|ting-ting/i.test(n)) s += 3; if (/huihui|yaoyao|kangkang/i.test(n)) s += 1; if (norm(v.lang) === "zh-cn") s += 1;
      return s;
    }
    cn.sort(function (a, b) { return score(b) - score(a); });
    var prev = voiceState;
    if (cn.length) { VOICE = cn[0]; voiceState = "ok"; }
    else { var any = vs.filter(function (v) { return /^(zh|cmn)/i.test(v.lang); })[0]; if (any) { VOICE = any; voiceState = "other"; } else { VOICE = null; voiceState = "none"; } }
    if (prev !== voiceState && booted) render();
  }
  if (synth) {
    chooseVoice();
    if ("onvoiceschanged" in synth) synth.addEventListener("voiceschanged", chooseVoice);
    setTimeout(function () { if (voiceState === "loading") { chooseVoice(); if (voiceState === "loading") { voiceState = "none"; render(); } } }, 2500);
  }
  function speak(text) {
    return new Promise(function (res) {
      if (!synth) return res();
      try { synth.cancel(); } catch (e) {}
      var u = new SpeechSynthesisUtterance(text);
      u.lang = VOICE ? VOICE.lang : "zh-CN"; if (VOICE) u.voice = VOICE;
      u.rate = prefs.slow ? 0.6 : 0.85;
      var done = false; function fin() { if (!done) { done = true; res(); } }
      u.onend = fin; u.onerror = fin; setTimeout(fin, 1500 + text.length * 900);
      synth.speak(u);
    });
  }
  function stopSpeech() { TOKEN++; if (synth) try { synth.cancel(); } catch (e) {} S.playing = false; }
  /* Playing highlight: elements carry data-hl="<src>-<index>" (or "dict" for Hear again). */
  function hl(key, on) { var el = root.querySelector('[data-hl="' + key + '"]'); if (el) el.classList.toggle("speaking", on); }
  function sayOne(key, text) { var t = TOKEN; hl(key, true); speak(text).then(function () { if (t === TOKEN) hl(key, false); }); }

  /* ---------- per-device records ---------- */
  function trickyMap() { return lsGet("tx-tricky", {}); }
  function findWord(hanzi) { for (var i = 0; i < S.lists.length; i++) for (var j = 0; j < S.lists[i].words.length; j++) if (S.lists[i].words[j].hanzi === hanzi) return S.lists[i].words[j]; return null; }
  function trickyArr() {
    var m = trickyMap();
    /* Tricky words saved before pictures existed pick up the picture from the lists. */
    return Object.keys(m).map(function (k) { var o = m[k], f = findWord(k) || {}; return { hanzi: k, pinyin: o.pinyin, english: o.english, pic: o.pic || f.pic, img: o.img || f.img, misses: o.misses }; })
      .sort(function (a, b) { return b.misses - a.misses; });
  }
  /* tx-stickers: { "<listId>": { best, total, perfect, at } } */
  function stickers() { var s = lsGet("tx-stickers", {}); return s && typeof s === "object" ? s : {}; }

  /* ---------- shared pieces ---------- */
  function banner() {
    if (voiceState === "none") return '<p class="banner">This browser has no Chinese voice, so words can\'t be read aloud here. Try Microsoft Edge or Chrome, or open the link on a phone.</p>';
    if (voiceState === "other") return '<p class="banner">This browser only has a non-mainland Chinese voice, so the accent may differ slightly from school. Edge or Chrome usually have a mainland voice.</p>';
    return "";
  }
  /* One short how-to line per screen: simple Chinese (kid) + English (kid or parent). */
  function howto(cn, en, cls) { return '<p class="howto' + (cls ? " " + cls : "") + '">' + (cn ? '<span class="howto-cn" lang="zh-CN">' + esc(cn) + "</span> · " : "") + esc(en) + "</p>"; }

  var TABS = [["learn", "学习", "Learn", IC.book], ["play", "玩一玩", "Play", IC.puzzle], ["dict", "听写", "Dictation", IC.pencil], ["tricky", "难词", "Tricky", IC.star]];
  function nav() {
    var n = Object.keys(trickyMap()).length;
    return '<nav class="tabs" aria-label="Sections">' + TABS.map(function (t) {
      var badge = t[0] === "tricky" && n ? '<span class="badge" aria-hidden="true">' + n + '</span><span class="sr">, ' + n + (n === 1 ? " word" : " words") + "</span>" : "";
      return '<button type="button" class="tab" data-act="mode" data-m="' + t[0] + '"' + (S.mode === t[0] ? ' aria-current="page"' : "") + ">" +
        '<span class="tab-ic">' + t[3] + '</span><span class="tab-cn" lang="zh-CN">' + t[1] + '</span><span class="tab-en">' + t[2] + "</span>" + badge + "</button>";
    }).join("") + "</nav>";
  }
  /* Parent corner opener. Touch and pen need a ~1.5 s press-and-hold; mouse click and keyboard open it at once. */
  function pcLabel() { return "Parent corner" + (matchMedia("(pointer: coarse)").matches ? ": press and hold" : ""); }
  function gearBtn() {
    return '<div class="pc-gear"><button type="button" class="pc-btn round" data-act="parent" aria-haspopup="dialog" aria-label="' + pcLabel() + '">' + IC.gear + RING + "</button>" +
      '<span class="pc-cap" aria-hidden="true"><span class="cap-fine">Parents</span><span class="cap-coarse">Parents: hold</span><span class="cap-hint">Keep holding</span></span></div>';
  }
  function pillBtn() {
    return '<button type="button" class="pc-btn pill" data-act="parent" aria-haspopup="dialog" aria-label="' + pcLabel() + '"><span class="gear-ic">' + IC.gear + RING + "</span>" +
      '<span class="cap-fine">Parent corner</span><span class="cap-coarse">Parents: hold</span><span class="cap-hint">Keep holding</span></button>';
  }
  function appbar() {
    return '<header class="appbar"><div class="appbar-in"><div class="logo"><span class="logo-box" aria-hidden="true">听</span><span class="logo-txt"><span lang="zh-CN">听写</span> practice</span></div>' +
      nav() + pillBtn() + "</div></header>";
  }
  /* Page heading row: heading on the left, the Parent corner gear on the right (phone), extras below. */
  function top(main, extra) { return '<div class="top"><div class="top-main">' + main + "</div>" + gearBtn() + (extra || "") + "</div>"; }
  function boxes(text, cls, empty) {
    var chars = Array.from(text || "");
    return '<span class="boxes n' + Math.min(chars.length, 8) + (cls ? " " + cls : "") + '">' + chars.map(function (c) { return '<span class="tzg"><span>' + (empty ? "" : esc(c)) + "</span></span>"; }).join("") + "</span>";
  }
  var BARS = '<span class="bars" aria-hidden="true"><span></span><span></span><span></span></span>';
  /* Word picture (Pictures switch on): the 4:3 illustration, else the emoji in a 4:3 area, else nothing. */
  function picture(w, cls, eager) {
    if (!prefs.pics) return "";
    if (w.img) return '<img class="' + cls + '" src="' + esc(w.img) + '" alt="' + esc(w.english || "") + '" width="640" height="480"' + (eager ? "" : ' loading="lazy"') + ' decoding="async">';
    if (w.pic) return '<span class="' + cls + ' emoji" role="img" aria-label="' + esc(w.english || "") + '"><span aria-hidden="true">' + esc(w.pic) + "</span></span>";
    return "";
  }
  /* A word card: the main button plays the word; "ⓘ more" (Learn only) opens the picture card. */
  function card(w, i, src, extra, more) {
    return '<div class="word t' + (i % 5) + '" data-hl="' + src + "-" + i + '">' +
      '<button type="button" class="word-main" data-act="say" data-src="' + src + '" data-i="' + i + '" aria-label="Hear ' + esc(w.hanzi) + '">' +
      picture(w, "card-pic") + BARS + boxes(w.hanzi) +
      (prefs.py && w.pinyin ? '<span class="py">' + esc(w.pinyin) + "</span>" : "") +
      (prefs.en && w.english ? '<span class="en">' + esc(w.english) + "</span>" : "") + (extra || "") + "</button>" +
      (more ? '<button type="button" class="more" data-act="picview" data-i="' + i + '" aria-label="More about ' + esc(w.hanzi) + '"><span class="more-pill"><span aria-hidden="true">ⓘ</span> more</span></button>' : "") +
      "</div>";
  }
  function tile(act, icon, cn, en) {
    return '<button type="button" class="tile" data-act="' + act + '"><span class="tile-ic">' + icon + '</span><span class="tile-cn" lang="zh-CN">' + cn + '</span><span class="tile-en">' + en + "</span></button>";
  }
  function keyHints() {
    return '<ul class="keys" aria-label="Keyboard shortcuts"><li><kbd>Space</kbd>Hear the word</li><li><kbd aria-label="Left arrow">←</kbd><kbd aria-label="Right arrow">→</kbd>Move between words</li><li><kbd>Enter</kbd>Next word in dictation</li></ul>';
  }

  /* List heading: 本周 pill on the next list; a "Back to this week" pill when another list is chosen. */
  function backPill(cls) {
    var d = defaultId();
    return d && S.cur !== d ? '<button type="button" class="back-week' + (cls ? " " + cls : "") + '" data-act="thisweek"><span lang="zh-CN">回到本周</span> Back to this week</button>' : "";
  }
  /* Title picker: the list title is a button (with ▾ and the date line) that opens the week sheet. */
  var CARET = ic(18, '<path d="M6 9l6 6 6-6"/>', line(2.8));
  function titlePicker(L, small) {
    var when = L.date ? fmtShort(L.date) + " · " + whenText(L.date) : "";
    var label = "听写" + (L.number || L.id) + (L.date ? ", " + fmtLong(L.date) : "") + ". Change week";
    return '<h1 class="title-h' + (small ? " small" : "") + '"><button type="button" class="title-btn" data-act="weeks" aria-haspopup="dialog" aria-label="' + esc(label) + '">' +
      '<span class="title-line"><span class="title" lang="zh-CN">' + esc(titleOf(L)) + '</span><span class="caret">' + CARET + "</span></span>" +
      (when ? '<span class="title-date">' + esc(when) + "</span>" : "") + "</button></h1>";
  }
  /* Sticker count beside the title; opens the same week sheet. */
  function stickerPill() {
    var n = Object.keys(stickers()).length;
    return '<button type="button" class="stk-pill" data-act="weeks" aria-haspopup="dialog" aria-label="' + n + (n === 1 ? " sticker" : " stickers") + '. Choose a week">' +
      '<span class="ws-stk got">' + starFill(14) + '</span><span aria-hidden="true">' + n + "</span></button>";
  }
  function listHead(L, small) {
    return (!small && L.id === nextId() ? '<span class="pill-week"><span lang="zh-CN">本周</span> This week</span>' : "") +
      '<div class="title-row">' + titlePicker(L, small) + '<div class="title-pills">' + stickerPill() + backPill(small ? "f-back" : "") + "</div></div>";
  }

  /* ---------- Learn ---------- */
  function learnView(L) {
    if (!L) return top('<h1 class="title">听写</h1>') + '<div class="panel"><p>No spelling lists have been added yet.</p></div>';
    if (S.write) return writeView(L);
    if (S.pic) return picView(L);
    if (S.focus) return focusView(L);
    return top(listHead(L)) +
      '<div class="learn-bar">' + howto("点一点，听一听", "Tap a word to hear it.") +
      '<button type="button" class="onebyone" data-act="focus">' + IC.one + '<span lang="zh-CN">一个一个</span> One by one</button></div>' +
      '<div class="grid">' + L.words.map(function (w, i) { return card(w, i, "learn", "", true); }).join("") +
      (S.playing ? tile("playall", IC.stop, "停一停", "Stop") : tile("playall", IC.play, "全部听", "Play all")) + "</div>" + keyHints();
  }
  /* Focus mode: one word at a time; swipe, the arrow buttons or ←/→ move between words. */
  function focusView(L) {
    var n = L.words.length, i = S.fi = Math.max(0, Math.min(S.fi, n - 1)), w = L.words[i];
    var dots = ""; for (var k = 0; k < n; k++) dots += "<span" + (k === i ? ' class="on"' : "") + "></span>";
    return '<div class="focus">' +
      '<div class="f-top"><button type="button" class="f-all" data-act="unfocus">' + IC.grid + '<span class="f-all-cn" lang="zh-CN">全部</span><span class="f-all-en">All words</span></button>' +
      '<div class="f-title">' + listHead(L, true) + "</div>" +
      '<div class="f-pc">' + gearBtn() + pillBtn() + "</div></div>" +
      '<div class="f-stage">' +
      '<button type="button" class="f-nav prev" data-act="fprev" aria-label="Previous word"' + (i === 0 ? " disabled" : "") + ">" + IC.chevL + "</button>" +
      '<div class="f-card t' + (i % 5) + '" data-hl="focus-' + i + '">' + BARS +
      picture(w, "f-pic", true) + boxes(w.hanzi) +
      (prefs.py && w.pinyin ? '<span class="f-py">' + esc(w.pinyin) + "</span>" : "") +
      (prefs.en && w.english ? '<span class="f-en">' + esc(w.english) + "</span>" : "") +
      '<div class="f-acts"><button type="button" class="listen" data-act="fsay" aria-label="Listen to ' + esc(w.hanzi) + '"><span class="listen-ic">' + IC.spkMid + '</span><span class="listen-cn" lang="zh-CN">听一听</span><span class="listen-en">Listen</span></button>' +
      '<button type="button" class="f-more" data-act="picview" data-i="' + i + '" aria-label="More about ' + esc(w.hanzi) + '"><span aria-hidden="true">ⓘ</span><span lang="zh-CN">看图</span> More</button>' +
      '<button type="button" class="f-more f-write" data-act="wopen" data-i="' + i + '" aria-label="Write ' + esc(w.hanzi) + '">' + IC.pencil + '<span lang="zh-CN">写一写</span> Write</button></div></div>' +
      '<button type="button" class="f-nav next" data-act="fnext" aria-label="Next word"' + (i === n - 1 ? " disabled" : "") + ">" + IC.chevR + "</button></div>" +
      '<div class="f-foot">' + howto("滑一滑", "Swipe or use the arrows", "f-howto") +
      '<div class="f-dots" role="img" aria-label="Word ' + (i + 1) + " of " + n + '">' + dots + "</div>" +
      '<button type="button" class="f-dict" data-act="dstart">' + IC.pencil + '<span lang="zh-CN">开始听写</span> Dictation</button></div>' +
      '<p class="sr" aria-live="polite">Word ' + (i + 1) + " of " + n + "</p></div>";
  }

  /* Picture card: big picture, word, explanation and an example sentence; prev/next, swipe, ←/→, Esc closes. */
  function picView(L) {
    var n = L.words.length, i = S.pi = Math.max(0, Math.min(S.pi, n - 1)), w = L.words[i];
    var dots = ""; for (var k = 0; k < n; k++) dots += "<span" + (k === i ? ' class="on"' : "") + "></span>";
    var media = w.img ? '<img class="pv-pic" src="' + esc(w.img) + '" alt="' + esc(w.english || "") + '" width="640" height="480" decoding="async">'
      : w.pic ? '<span class="pv-pic emoji" role="img" aria-label="' + esc(w.english || "") + '"><span aria-hidden="true">' + esc(w.pic) + "</span></span>" : "";
    return '<div class="pv">' +
      '<div class="d-top"><button type="button" class="round-btn" data-act="pvclose" aria-label="Close picture card">' + IC.close + "</button>" +
      '<span class="d-title" lang="zh-CN">' + esc(titleOf(L)) + '</span><span class="d-count">' + (i + 1) + "<span> / " + n + "</span></span></div>" +
      howto("看图说一说", "Look, listen and read the sentence", "pv-how") +
      '<div class="pv-stage">' +
      '<button type="button" class="f-nav prev" data-act="pvprev" aria-label="Previous word"' + (i === 0 ? " disabled" : "") + ">" + IC.chevL + "</button>" +
      '<div class="pv-card t' + (i % 5) + (media ? "" : " no-pic") + '" data-hl="pv-' + i + '">' + BARS + media +
      '<div class="pv-info">' +
      '<div class="pv-word">' + boxes(w.hanzi) + '<div class="pv-side">' + (w.pinyin ? '<span class="pv-py">' + esc(w.pinyin) + "</span>" : "") +
      '<button type="button" class="listen" data-act="pvsay" aria-label="Listen to ' + esc(w.hanzi) + '"><span class="listen-ic">' + IC.spkMid + '</span><span class="listen-cn" lang="zh-CN">听一听</span><span class="listen-en">Listen</span></button>' +
      '<button type="button" class="pv-write" data-act="wopen" data-i="' + i + '" aria-label="Write ' + esc(w.hanzi) + '">' + IC.pencil + '<span lang="zh-CN">写一写</span> Write</button></div></div>' +
      (w.explain ? '<p class="pv-explain">' + esc(w.explain) + "</p>" : "") +
      (w.sentence ? '<div class="pv-sent"><p class="pv-s-cn" lang="zh-CN">' + esc(w.sentence) + "</p>" + (w.sentencePinyin ? '<p class="pv-s-py">' + esc(w.sentencePinyin) + "</p>" : "") +
        '<button type="button" class="sent-play" data-act="pvsent" data-hl="pvs-' + i + '" aria-label="Hear the sentence"><span class="listen-ic">' + IC.spkMid + '</span><span class="listen-cn" lang="zh-CN">听句子</span><span class="listen-en">Hear the sentence</span></button></div>' : "") +
      "</div></div>" +
      '<button type="button" class="f-nav next" data-act="pvnext" aria-label="Next word"' + (i === n - 1 ? " disabled" : "") + ">" + IC.chevR + "</button></div>" +
      '<div class="f-dots pv-dots" role="img" aria-label="Word ' + (i + 1) + " of " + n + '">' + dots + "</div>" +
      '<p class="sr" aria-live="polite">Word ' + (i + 1) + " of " + n + "</p></div>";
  }

  /* ---------- Dictation ---------- */
  function dictTitle() { var L = listById(D.listId); return D.src === "tricky" ? "难词" : titleOf(L); }
  function dictView(L) {
    if (D.phase === "run") return runView();
    if (D.phase === "check") return checkView();
    if (D.phase === "done") return doneView();
    var head = L ? top(listHead(L)) : top('<h1 class="title" lang="zh-CN">听写</h1>');
    if (!L) return head + '<div class="panel"><p>No list to practise yet.</p></div>';
    return head + howto("听一听，写一写", "Listen, then write it on your paper.") +
      '<div class="start"><button type="button" class="big-btn yellow start-btn" data-act="dstart">' + IC.pencil + '<span class="bb-cn" lang="zh-CN">开始听写</span><span class="bb-en">Start</span></button>' +
      '<p class="start-note">' + L.words.length + " words. Each one is read twice, in a mixed-up order. Get your paper and pencil ready.</p></div>";
  }
  function runView() {
    var w = D.queue[D.i], n = D.queue.length, last = D.i === n - 1, chars = Array.from(w.hanzi).length;
    var stones = D.queue.map(function (_, k) {
      return (k ? '<span class="link' + (k <= D.i ? " done" : "") + '"></span>' : "") +
        '<span class="stone' + (k < D.i ? " done" : k === D.i ? " now" : "") + '">' + (k < D.i ? IC.check : "") + "</span>";
    }).join("");
    return '<div class="screen dict">' +
      '<div class="d-top"><button type="button" class="round-btn" data-act="dstop" aria-label="Stop dictation">' + IC.close + "</button>" +
      '<span class="d-title" lang="zh-CN">' + esc(dictTitle()) + '</span><span class="d-count">' + (D.i + 1) + "<span> / " + n + "</span></span></div>" +
      '<div class="stones' + (n > 8 ? " many" : "") + '" role="img" aria-label="Word ' + (D.i + 1) + " of " + n + '">' + stones + "</div>" +
      '<div class="d-head"><p class="d-cn" lang="zh-CN">听一听，写一写</p><p class="d-en">Listen, then write it on your paper</p></div>' +
      '<button type="button" class="hear" data-act="again" data-hl="dict"><span class="hear-disc">' + IC.spkBig + '</span><span class="hear-cn" lang="zh-CN">再听一次</span><span class="hear-en">Hear again</span></button>' +
      '<div class="d-boxes">' + boxes(w.hanzi, "", true) + '<span class="d-n"><span lang="zh-CN">' + chars + " 个字</span> · " + chars + (chars === 1 ? " character" : " characters") + "</span></div>" +
      '<div class="screen-foot"><button type="button" class="big-btn dark" data-act="next">' +
      (last ? '<span class="bb-cn" lang="zh-CN">看答案</span><span class="bb-en">Check</span>' : '<span class="bb-cn" lang="zh-CN">下一个</span><span class="bb-en">Next</span>') + IC.arrowR + "</button></div></div>";
  }
  function checkView() {
    var n = D.queue.length, done = Object.keys(D.marks).length;
    var rows = D.queue.map(function (w, i) {
      var m = D.marks[i];
      return '<li class="c-row' + (m === "no" ? " again" : "") + '"><button type="button" class="c-say" data-act="say" data-src="review" data-i="' + i + '" data-hl="review-' + i + '" aria-label="Hear ' + esc(w.hanzi) + '">' + IC.spk + "</button>" +
        '<span class="c-word"><span class="c-hz" lang="zh-CN">' + esc(w.hanzi) + '</span><span class="c-py">' + esc(w.pinyin || "") + "</span></span>" +
        '<span class="c-faces" role="group" aria-label="' + esc(w.hanzi) + '">' +
        '<button type="button" class="face good" data-act="mark" data-i="' + i + '" data-v="ok" aria-pressed="' + (m === "ok") + '" aria-label="I got it right">' + IC.happy + "</button>" +
        '<button type="button" class="face again" data-act="mark" data-i="' + i + '" data-v="no" aria-pressed="' + (m === "no") + '" aria-label="Practise again">' + IC.sad + "</button></span></li>";
    }).join("");
    return '<div class="screen check"><div class="c-head"><button type="button" class="round-btn c-x" data-act="dstop" aria-label="Stop without saving">' + IC.close + "</button>" +
      '<h1 class="c-cn" lang="zh-CN">看答案</h1><p class="c-en">Check your paper</p>' +
      '<p class="c-how">For each word, tap the happy face if you wrote it right, or the other face to practise it again.</p></div>' +
      '<ul class="c-list">' + rows + "</ul>" +
      '<div class="screen-foot"><p class="c-count" aria-live="polite">' + done + " of " + n + " checked</p>" +
      '<button type="button" class="big-btn yellow" data-act="finish"' + (done < n ? " disabled" : "") + '><span class="bb-cn" lang="zh-CN">完成</span><span class="bb-en">Done</span></button></div></div>';
  }
  /* Five stars whatever the list length; all five only when every word was right. */
  function starCount(right, total) {
    if (!total) return 0; if (right >= total) return 5;
    return Math.min(4, Math.max(right > 0 ? 1 : 0, Math.round(right / total * 5)));
  }
  function doneView() {
    var r = D.result, st = stickers(), L = listById(D.listId);
    var stars = starCount(r.right, r.total), sizes = [40, 48, 58, 48, 40];
    var starRow = sizes.map(function (s, k) { return '<span class="ws s' + k + (k < stars ? " on" : "") + '">' + ic(s, '<path d="' + STAR + '"/>', 'stroke-width="1.2" stroke-linejoin="round"') + "</span>"; }).join("");
    var head = r.right >= r.total ? ["太棒了！", "Perfect! " + r.right + " out of " + r.total] : r.right > 0 ? ["做得好！", "Well done! " + r.right + " out of " + r.total] : ["加油！", "Good try! Let's practise them again."];
    var sc = "";
    if (r.sticker && L) {
      sc = '<div class="sc-head"><span class="sticker-new' + (r.sticker.perfect ? " perfect" : "") + (r.isNew ? " pop" : "") + '" aria-hidden="true">' + starFill(30) + '<span lang="zh-CN">' + esc(L.number) + "</span></span>" +
        "<div>" + (r.isNew ? '<p class="sn-cn" lang="zh-CN">新贴纸！</p><p class="sn-en">' + (L.id === nextId() ? "New sticker for this week" : "New sticker for " + esc(titleOf(L))) + "</p>"
          : '<p class="sn-cn" lang="zh-CN">又练了一次！</p><p class="sn-en">Best so far: ' + r.sticker.best + " out of " + r.sticker.total + "</p>") + "</div></div>";
    } else sc = '<p class="sn-cn"><span lang="zh-CN">我的贴纸</span> My stickers</p>';
    var got = 0;
    var book = S.lists.map(function (l) {
      var s = st[l.id]; if (s) got++;
      return '<li class="sb' + (s ? " got" : "") + (s && s.perfect ? " perfect" : "") + '"><span class="sb-dot" aria-hidden="true">' + (s ? starFill(24) : "") + '</span><span class="sb-n" lang="zh-CN">' + esc(l.number || l.id) + "</span>" +
        '<span class="sr">' + (s ? (s.perfect ? ", perfect sticker" : ", sticker earned") : ", not yet") + "</span></li>";
    }).join("");
    var missed = D.queue.filter(function (_, i) { return D.marks[i] === "no"; });
    var again = missed.length ? '<button type="button" class="big-btn yellow" data-act="retest"><span class="bb-cn" lang="zh-CN">再练一次</span><span class="bb-en">Practise ' +
      (missed.length <= 2 ? '<span lang="zh-CN">' + esc(missed.map(function (w) { return w.hanzi; }).join("、")) + "</span>" : missed.length + " words") + " again</span></button>" : "";
    return '<div class="screen welldone"><div class="confetti" aria-hidden="true"><span class="cf c1"></span><span class="cf c2"></span><span class="cf c3"></span><span class="cf c4"></span><span class="cf c5"></span><span class="cf c6"></span></div>' +
      '<div class="wstars" role="img" aria-label="' + stars + ' out of 5 stars">' + starRow + "</div>" +
      '<h1 class="wd-cn" lang="zh-CN">' + head[0] + '</h1><p class="wd-en">' + head[1] + "</p>" +
      '<div class="scard">' + sc + '<ul class="sbook" aria-label="Sticker book: ' + got + " of " + S.lists.length + '">' + book + "</ul></div>" +
      '<div class="screen-foot">' + howto("", missed.length ? "Practise the words you missed, or go back to your words." : "Go back to your words, or try another list in the Parent corner.", "wd-how") + again +
      '<button type="button" class="big-btn white" data-act="back"><span class="bb-cn" lang="zh-CN">回到单词</span><span class="bb-en">Back to words</span></button></div></div>';
  }

  /* ---------- Tricky ---------- */
  function trickyView() {
    var arr = trickyArr();
    var L = curList();
    var h = (L ? top(listHead(L)) : "") + '<h2 class="tricky-h"><span lang="zh-CN">难词</span> Tricky words</h2>' + howto("再练一练", "Words to practise again.");
    if (!arr.length) return h + '<div class="panel"><p class="count">No tricky words yet</p><p class="muted">Words you mark to practise again in Dictation show up here.</p></div>';
    return h + '<div class="grid">' + arr.map(function (w, i) { return card(w, i, "tricky", '<span class="miss">Missed ' + w.misses + "×</span>"); }).join("") +
      tile("tstart", IC.pencil, "练一练", "Practise these") + "</div>";
  }

  /* ---------- Play: games on the selected list (shared game engine) ---------- */
  /* Distractor words: from the same list first, topped up from the nearest other lists (by date) only
     if the list is too short. exclude = hanzi not to use. */
  function otherWords(L, exclude, n) {
    var seen = {}, out = [];
    exclude.forEach(function (h) { seen[h] = true; });
    function take(words) { shuffle(words).forEach(function (w) { if (out.length < n && !seen[w.hanzi]) { seen[w.hanzi] = true; out.push(w); } }); }
    take(L.words);
    if (out.length < n) {
      var i0 = S.lists.indexOf(L);
      S.lists.filter(function (l) { return l !== L; })
        .sort(function (a, b) { return Math.abs(S.lists.indexOf(a) - i0) - Math.abs(S.lists.indexOf(b) - i0); })
        .forEach(function (l) { if (out.length < n) take(l.words); });
    }
    return out;
  }
  function picOf(w, cls) {
    if (w.img) return '<img class="' + cls + '" src="' + esc(w.img) + '" alt="" width="640" height="480" decoding="async">';
    if (w.pic) return '<span class="' + cls + ' emoji" aria-hidden="true">' + esc(w.pic) + "</span>";
    return "";
  }
  /* Choice-game questions: the word + 2 other words as choices (answer = hanzi). */
  function wordQuestions(L, items) {
    return shuffle(items).map(function (w) {
      var choices = shuffle([w].concat(otherWords(L, [w.hanzi], 2))).map(function (c) { return { text: c.hanzi, py: c.pinyin }; });
      return { w: w, answer: w.hanzi, choices: choices, firstTry: true };
    });
  }
  function sayWordSoon(w, ms) { var t = TOKEN; setTimeout(function () { if (t === TOKEN && G.phase === "run") speak(w.hanzi); }, ms || 350); }

  /* Game registry (picker order). kind "choice" games share the question screen below:
     build(L) → questions, media(q) → what sits above the choices, onShow(q) when a question appears,
     hint: "pinyin" (pinyin under every choice) or "media" (media() shows the hint itself). */
  var GAMES = [
    { id: "pictureQuiz", cn: "看图选词", en: "Picture quiz", sub: "Look at the picture, pick the word", kind: "choice",
      how: ["这是什么？", "Which word is this?"], region: "Which word matches this picture?", hint: "pinyin",
      items: function (L) { return L ? L.words.filter(function (w) { return w.img; }) : []; }, min: 3,
      notEnough: "This week needs more pictures to play", ready: function (n) { return n + " pictures to play"; },
      art: function (L) { var t = L.words.filter(function (w) { return w.img; })[0]; return t && prefs.pics ? picOf(t, "") : IC.puzzle; },
      build: function (L) { return wordQuestions(L, this.items(L)); },
      media: function (q) { return '<img class="g-pic" src="' + esc(q.w.img) + '" alt="" width="640" height="480" decoding="async">'; } },
    { id: "listenPick", cn: "听音选字", en: "Listen & pick", sub: "Hear a word, pick the characters", kind: "choice",
      how: ["听一听，选一选", "Listen, then pick the word"], region: "Which word did you hear?", hint: "media",
      items: function (L) { return L ? L.words : []; }, min: 1,
      notEnough: "This week has no words yet", ready: function (n) { return n + " words to play"; },
      art: function () { return '<span class="gc-sound">' + IC.spkBig + "</span>"; },
      build: function (L) { return wordQuestions(L, this.items(L)); },
      hasHint: function (q) { return !!(q.w.img || q.w.pic); },
      media: function (q) {
        var show = G.hint || G.solved;
        return '<div class="g-listen' + (show && (q.w.img || q.w.pic) ? " with-pic" : "") + '">' +
          '<button type="button" class="hear g-hear" data-act="gsay" data-hl="gsay"><span class="hear-disc">' + IC.spkBig + '</span><span class="hear-cn" lang="zh-CN">再听一次</span><span class="hear-en">Hear again</span></button>' +
          (show ? picOf(q.w, "g-hintpic") : "") + "</div>";
      },
      onShow: function (q) { sayWordSoon(q.w, 400); } },
    { id: "missingChar", cn: "缺字", en: "Missing character", sub: "Find the character that's missing", kind: "choice",
      how: ["找一找，缺了哪个字？", "Which character is missing?"], region: "Which character is missing?", hint: "media",
      items: function (L) { return L ? L.words : []; }, min: 1,
      notEnough: "This week has no words yet", ready: function (n) { return n + " words to play"; },
      art: function (L) { var c = Array.from(L.words[0].hanzi); return '<span class="gc-miss"><span class="boxes"><span class="tzg"><span>' + esc(c[0]) + '</span></span><span class="tzg gap"><span></span></span></span></span>'; },
      build: function (L) {
        return shuffle(L.words).map(function (w) {
          var pos = Math.floor(Math.random() * Array.from(w.hanzi).length), ans = Array.from(w.hanzi)[pos];
          return { w: w, pos: pos, answer: ans, choices: missingChoices(L, w, pos).map(function (c) { return { text: c }; }), firstTry: true };
        });
      },
      hasHint: function (q) { return !!charPinyin(q.w, q.pos); },
      media: function (q) {
        var chars = Array.from(q.w.hanzi), py = charPinyin(q.w, q.pos);
        var boxesHtml = chars.map(function (c, i) {
          if (i !== q.pos) return '<span class="tzg"><span>' + esc(c) + "</span></span>";
          if (G.solved) return '<span class="tzg drop"><span>' + esc(c) + "</span></span>";
          return '<span class="tzg gap"><span>' + (G.hint && py ? '<em class="gap-py">' + esc(py) + "</em>" : "") + "</span></span>";
        }).join("");
        var label = chars.map(function (c, i) { return i === q.pos && !G.solved ? "missing character" : c; }).join(", ");
        return '<div class="g-miss"><span class="boxes n' + Math.min(chars.length, 8) + ' g-missbox" role="img" aria-label="' + esc(label) + '">' + boxesHtml + "</span>" +
          '<button type="button" class="g-say" data-act="gsay" data-hl="gsay"><span class="listen-ic">' + IC.spkMid + '</span><span lang="zh-CN">再听一次</span> Hear again</button></div>';
      },
      onShow: function (q) { sayWordSoon(q.w, 400); },
      onRight: function (q) { sayWordSoon(q.w, 650); }, /* after the character drops into its box */
      nextAfter: 2200 },
    { id: "memory", cn: "翻翻乐", en: "Memory match", sub: "Flip two cards to find a pair", kind: "memory",
      how: ["翻一翻，配一配", "Flip two cards to find a pair"],
      items: function (L) { return L ? L.words.filter(function (w) { return w.img || w.pic; }) : []; }, min: 2,
      notEnough: "This week needs more pictures to play", ready: function (n) { return Math.min(n, 6) + " pairs to find"; },
      bestText: function (sc, thisWeek) { return (thisWeek ? "Best this week: " : "Best for this list: ") + sc.best + " moves"; },
      art: function () { return '<span class="gc-cards"><span class="mm-mini back">?</span><span class="mm-mini face">翻</span></span>'; },
      build: function (L) {
        var words = shuffle(this.items(L)).slice(0, 6), cards = [];
        words.forEach(function (w, i) { cards.push({ w: w, i: i, face: "pic" }, { w: w, i: i, face: "word" }); });
        return { cards: shuffle(cards), up: [], matched: {}, found: 0, moves: 0, pairs: words.length, lock: false };
      } },
    { id: "bubbles", cn: "泡泡", en: "Bubble pop", sub: "Hear a word, pop the right bubble", kind: "bubbles",
      how: ["听一听，戳泡泡", "Listen, then pop the right bubble"], region: "Which bubble is the word you heard?",
      items: function (L) { return L ? L.words : []; }, min: 1,
      notEnough: "This week has no words yet", ready: function () { return "8 rounds to play"; },
      art: function () { return '<span class="gc-bubbles"><span class="bub-mini b1"></span><span class="bub-mini b2"></span><span class="bub-mini b3"></span></span>'; },
      /* 8 rounds; words repeat if the list is short (never the same word twice in a row); 4 bubbles each. */
      build: function (L) {
        var rounds = [], pool = [];
        while (rounds.length < 8) {
          if (!pool.length) pool = shuffle(L.words);
          var w = pool.shift();
          if (rounds.length && rounds[rounds.length - 1].w.hanzi === w.hanzi && L.words.length > 1) { pool.push(w); continue; }
          var choices = shuffle([w].concat(otherWords(L, [w.hanzi], 3))).map(function (c) { return { text: c.hanzi, py: c.pinyin }; });
          rounds.push({ w: w, answer: w.hanzi, choices: choices, firstTry: true });
        }
        return rounds;
      },
      onShow: function (q) { sayWordSoon(q.w, 300); } }
  ];
  /* 缺字 look-alikes (data/lookalikes.json): character → [most common mix-up, others…]. */
  var LOOK = {};
  function wordSet() { var s = {}; S.lists.forEach(function (l) { l.words.forEach(function (w) { s[w.hanzi] = true; }); }); return s; }
  function charPinyin(w, pos) { var sy = (w.pinyin || "").trim().split(/\s+/); return sy.length === Array.from(w.hanzi).length ? sy[pos] : ""; }
  /* The 2 wrong choices for the missing character: always the first look-alike, then one more at random;
     never one that spells another word from any list; fall back to characters from this list's other
     words, then from the nearest lists. */
  function missingChoices(L, w, pos) {
    var chars = Array.from(w.hanzi), ans = chars[pos], all = wordSet(), picks = [];
    function ok(c) {
      if (!c || c === ans || picks.indexOf(c) >= 0) return false;
      var t = chars.slice(); t[pos] = c; return !all[t.join("")];
    }
    var la = Array.isArray(LOOK[ans]) ? LOOK[ans] : [];
    if (ok(la[0])) picks.push(la[0]);
    shuffle(la.slice(1)).forEach(function (c) { if (picks.length < 2 && ok(c)) picks.push(c); });
    function fromWords(words) { shuffle(words).forEach(function (o) { if (o.hanzi === w.hanzi) return; shuffle(Array.from(o.hanzi)).forEach(function (c) { if (picks.length < 2 && ok(c)) picks.push(c); }); }); }
    if (picks.length < 2) fromWords(L.words);
    if (picks.length < 2) otherWords(L, [w.hanzi], 12).forEach(function (o) { fromWords([o]); });
    return shuffle([ans].concat(picks));
  }
  function gameById(id) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i]; return null; }
  function curGame() { return gameById(G.game); }
  function focusGameCard(id) { var c = root.querySelector('.game-card[data-g="' + id + '"]') || root.querySelector(".game-card"); if (c) c.focus({ preventScroll: true }); }
  /* tx-games: { "<gameId>": { "<listId>": { best, total } } } */
  function gameScores() { var s = lsGet("tx-games", {}); return s && typeof s === "object" ? s : {}; }
  function playView(L) {
    var g = curGame();
    if (G.phase === "run" && g && g.kind === "memory") return memoryView(g);
    if (G.phase === "setup" && g && g.kind === "bubbles") return bubbleSetupView(g);
    if (G.phase === "run" && g && g.kind === "bubbles") return bubbleView(g);
    if (G.phase === "run" && g) return choiceView(g);
    if (G.phase === "end" && g) return gameEndView(g);
    var head = L ? top(listHead(L)) : top('<h1 class="title" lang="zh-CN">玩一玩</h1>');
    if (!L) return head + '<div class="panel"><p>No spelling lists have been added yet.</p></div>';
    var scores = gameScores(), thisWeek = L.id === nextId();
    var cards = GAMES.map(function (g) {
      var n = g.items(L).length, ok = n >= g.min, sc = scores[g.id] && scores[g.id][L.id];
      var note = !ok ? g.notEnough : sc ? (g.bestText ? g.bestText(sc, thisWeek) : (thisWeek ? "Best this week: " : "Best for this list: ") + sc.best + " / " + sc.total) : g.ready(n);
      return '<button type="button" class="game-card g-' + g.id + (ok ? "" : " off") + '" data-act="gstart" data-g="' + g.id + '"' + (ok ? "" : ' aria-disabled="true"') + ">" +
        '<span class="gc-art" aria-hidden="true">' + g.art(L) + "</span>" +
        '<span class="gc-text"><span class="gc-cn" lang="zh-CN">' + g.cn + '</span><span class="gc-en">' + g.en + '</span><span class="gc-sub">' + g.sub + "</span>" +
        '<span class="gc-note' + (ok ? "" : " warn") + '">' + esc(note) + "</span></span></button>";
    }).join("");
    return head + howto("选一个游戏", "Pick a game") + '<div class="games">' + cards + "</div>";
  }
  /* Start (or restart) a round of game id on the selected list. */
  /* setup = true: games with a start screen (Bubble pop's speed choice) show it first. */
  function startGame(id, setup) {
    var L = curList(), g = gameById(id); if (!L || !g) return;
    if (g.items(L).length < g.min) return;
    clearTimeout(gTimer); stopSpeech(); bubbleStop();
    G = newGame(); G.game = g.id; G.listId = L.id;
    if (setup && g.kind === "bubbles") {
      G.phase = "setup"; render(); toTop();
      var sp = root.querySelector('.bub-speed[aria-pressed="true"]'); if (sp) sp.focus({ preventScroll: true });
      return;
    }
    G.phase = "run";
    if (g.kind === "memory") { G.mm = g.build(L); G.q = []; }
    else G.q = g.build(L);
    render(); toTop(); /* render() also starts the bubbles */
    var p = root.querySelector(".g-choice, .mm-card, .bub"); if (p) p.focus({ preventScroll: true });
    if (g.onShow) g.onShow(G.q[0]);
  }

  /* ---------- 泡泡 Bubble pop: bubbles float up (requestAnimationFrame + transforms) ---------- */
  var bubbleSpeed = "slow"; /* start-screen choice, kept for this visit; Slow voice doesn't affect it */
  var BUB = null; /* animation state: { raf, last, items: [{ x, y, lane, phase }], h } */
  function reducedMotion() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function bubbleSetupView(g) {
    function sp(id, cn, en) { return '<button type="button" class="bub-speed" data-act="bspeed" data-v="' + id + '" aria-pressed="' + (bubbleSpeed === id) + '"><span class="bb-cn" lang="zh-CN">' + cn + '</span><span class="bb-en">' + en + "</span></button>"; }
    return '<div class="screen game g-bubbles bub-setup">' +
      '<div class="d-top"><button type="button" class="round-btn" data-act="gquit" aria-label="Back to games">' + IC.close + "</button></div>" +
      '<div class="bub-hero" aria-hidden="true"><span class="bub-mini b1"></span><span class="bub-mini b2"></span><span class="bub-mini b3"></span></div>' +
      '<h1 class="wd-cn" lang="zh-CN">泡泡</h1><p class="wd-en">Bubble pop</p>' + howto(g.how[0], g.how[1], "bub-how") +
      '<div class="bub-speeds" role="group" aria-label="Speed">' + sp("slow", "慢", "Slow") + sp("normal", "中", "Normal") + "</div>" +
      '<div class="screen-foot"><button type="button" class="big-btn yellow" data-act="bgo"><span class="bb-cn" lang="zh-CN">开始</span><span class="bb-en">Start</span></button></div></div>';
  }
  function bubbleView(g) {
    var n = G.q.length, q = G.q[G.i], still = reducedMotion();
    var bubbles = q.choices.map(function (c, ci) {
      var wrong = G.wrong.indexOf(ci) >= 0, right = G.solved && c.text === q.answer;
      return '<button type="button" class="bub' + (still ? " still" : "") + (wrong ? " grey" : "") + (right ? " popped" : "") + " n" + Math.min(Array.from(c.text).length, 5) + '" data-act="bpick" data-i="' + ci + '"' +
        (wrong || G.solved ? " disabled" : "") + ' aria-label="' + (ci + 1) + ". " + esc(c.text) + (right ? ", right" : wrong ? ", not this one" : "") + '">' +
        '<span class="g-num" aria-hidden="true">' + (ci + 1) + '</span><span class="bub-hz" lang="zh-CN">' + esc(c.text) + "</span></button>";
    }).join("");
    return '<div class="screen game g-bubbles">' + gameTop(n, G.i) + howto(g.how[0], g.how[1], "bub-how") +
      '<div class="bub-bar"><button type="button" class="g-say" data-act="gsay" data-hl="gsay"><span class="listen-ic">' + IC.spkMid + '</span><span lang="zh-CN">再听一次</span> Hear again</button></div>' +
      '<section class="bub-field' + (still ? " still" : "") + '" aria-label="' + esc(g.region) + '">' + bubbles + "</section>" +
      '<p class="g-reveal bub-reveal" role="status"></p></div>';
  }
  /* Start the float for the current round: 4 lanes, staggered starts below the field, gentle side drift. */
  function bubbleStart() {
    bubbleStop();
    if (reducedMotion()) return; /* bubbles sit still in a row and fade in (CSS) */
    var els = root.querySelectorAll(".bub"); if (!els.length) return;
    BUB = { raf: 0, last: 0, items: [] };
    var order = shuffle([0, 1, 2, 3].slice(0, els.length));
    for (var i = 0; i < els.length; i++) BUB.items.push({ el: els[i], lane: i, y: 0, start: order[i], phase: Math.random() * 6.28, popped: els[i].classList.contains("popped") });
    /* All four start inside the lower half of the field at staggered heights, so they're visible at once. */
    var field = root.querySelector(".bub-field"), h = field ? field.clientHeight : 400;
    BUB.items.forEach(function (b) { b.y = h - b.el.offsetWidth - 8 - b.start * h * 0.13; });
    BUB.raf = requestAnimationFrame(bubbleFrame);
  }
  function bubbleStop() { if (BUB && BUB.raf) cancelAnimationFrame(BUB.raf); BUB = null; }
  function bubbleFrame(t) {
    var B = BUB; if (!B) return;
    var field = root.querySelector(".bub-field"); if (!field) { bubbleStop(); return; }
    var dt = B.last ? Math.min(0.05, (t - B.last) / 1000) : 0; B.last = t;
    var W = field.clientWidth, H = field.clientHeight, lanes = B.items.length;
    var speed = H * (bubbleSpeed === "normal" ? 0.14 : 0.075); /* fraction of the field height per second */
    B.items.forEach(function (b) {
      if (b.popped) return;
      var size = b.el.offsetWidth;
      b.y -= speed * dt;
      if (b.y < -size) b.y = H + 10 + Math.random() * 40; /* left the top: back in from the bottom */
      var laneW = W / lanes, x = laneW * (b.lane + 0.5) - size / 2 + Math.sin(t / 1100 + b.phase) * Math.min(14, laneW * 0.12);
      b.x = Math.max(0, Math.min(W - size, x));
      b.el.style.transform = "translate3d(" + b.x.toFixed(1) + "px," + b.y.toFixed(1) + "px,0)";
    });
    B.raf = requestAnimationFrame(bubbleFrame);
  }
  /* Pause while the tab is hidden; carry on where it was when it's back. */
  document.addEventListener("visibilitychange", function () {
    if (!BUB) return;
    if (document.hidden) { cancelAnimationFrame(BUB.raf); BUB.raf = 0; }
    else if (!BUB.raf) { BUB.last = 0; BUB.raf = requestAnimationFrame(bubbleFrame); }
  });
  /* Tap a bubble: right → pop (burst + pop sound) + chime + the word, next round; wrong → wobble + boop, grey, keeps floating. */
  function bubblePick(ci) {
    if (G.phase !== "run" || G.solved) return;
    var q = G.q[G.i], c = q.choices[ci], el = root.querySelector('.bub[data-i="' + ci + '"]');
    if (!c || !el || G.wrong.indexOf(ci) >= 0) return;
    if (c.text === q.answer) {
      G.solved = true; stopSpeech();
      if (BUB) BUB.items.forEach(function (b) { if (b.el === el) b.popped = true; });
      el.classList.add("popped"); el.disabled = true; el.setAttribute("aria-label", (ci + 1) + ". " + c.text + ", right");
      root.querySelectorAll(".bub").forEach(function (b) { if (b !== el) b.disabled = true; });
      var rv = root.querySelector(".bub-reveal"); if (rv) rv.innerHTML = '<span class="g-r-py">' + esc(q.w.pinyin || "") + '</span><span class="g-r-en">' + esc(q.w.english || "") + "</span>";
      popSound(); setTimeout(chime, 120); sayWordSoon(q.w, 350);
      var say = root.querySelector(".g-say"); if (say) say.focus({ preventScroll: true });
      clearTimeout(gTimer); gTimer = setTimeout(bubbleNext, 1800);
    } else {
      q.firstTry = false; G.wrong.push(ci);
      el.classList.add("grey", "wobble"); el.disabled = true; el.setAttribute("aria-label", (ci + 1) + ". " + c.text + ", not this one");
      setTimeout(function () { el.classList.remove("wobble"); }, 450);
      boop();
      var left = root.querySelector(".bub:not([disabled])"); if (left) left.focus({ preventScroll: true });
    }
  }
  function bubbleNext() {
    clearTimeout(gTimer); if (G.phase !== "run" || !G.solved) return;
    stopSpeech();
    if (G.i < G.q.length - 1) {
      G.i++; G.wrong = []; G.solved = false; render();
      var p = root.querySelector(".bub"); if (p) p.focus({ preventScroll: true });
      curGame().onShow(G.q[G.i]);
    } else { bubbleStop(); gameFinish(); }
  }

  /* ---------- 翻翻乐 Memory match: picture card ↔ characters card ---------- */
  function mmLabel(c, n, up) {
    var m = G.mm, what = c.face === "pic" ? "picture of " + (c.w.english || "a word") : c.w.hanzi;
    return "Card " + (n + 1) + ", " + (up ? what + (m.matched[c.i] ? ", matched" : "") : "face down");
  }
  function memoryView(g) {
    var m = G.mm, n = m.cards.length, cols = n <= 8 ? 4 : n <= 10 ? 5 : 6;
    var dots = ""; for (var k = 0; k < m.pairs; k++) dots += "<span" + (k < m.found ? ' class="done"' : "") + "></span>";
    var cards = m.cards.map(function (c, i) {
      var up = m.up.indexOf(i) >= 0 || !!m.matched[c.i];
      return '<button type="button" class="mm-card' + (up ? " up" : "") + (m.matched[c.i] ? " matched" : "") + '" data-act="mflip" data-i="' + i + '" aria-label="' + esc(mmLabel(c, i, up)) + '">' +
        '<span class="mm-inner"><span class="mm-back" aria-hidden="true"><span>?</span></span><span class="mm-face" aria-hidden="true">' +
        (c.face === "pic" ? picOf(c.w, "mm-pic") : '<span class="mm-hz n' + Math.min(Array.from(c.w.hanzi).length, 5) + '" lang="zh-CN">' + esc(c.w.hanzi) + "</span>") + "</span></span></button>";
    }).join("");
    return '<div class="screen game g-memory">' +
      '<div class="d-top"><button type="button" class="round-btn" data-act="gquit" aria-label="Back to games">' + IC.close + "</button>" +
      '<div class="g-dots" role="img" aria-label="' + m.found + " of " + m.pairs + ' pairs found">' + dots + '</div><span class="d-count mm-count">' + m.found + "<span> / " + m.pairs + "</span></span></div>" +
      howto(g.how[0], g.how[1], "mm-how") + '<p class="mm-moves" aria-live="polite">Moves: <b>' + m.moves + "</b></p>" +
      '<div class="mm-grid cols-' + cols + '">' + cards + "</div></div>";
  }
  /* Flip a card in place (no re-render, so the flip animates and focus stays). Two up: a match stays
     face up with a blue ring and a chime; otherwise both flip back after ~1 s. A characters card says its word. */
  function mmSet(i, up) {
    var m = G.mm, b = root.querySelector('.mm-card[data-i="' + i + '"]'), c = m.cards[i]; if (!b) return;
    b.classList.toggle("up", up); b.classList.toggle("matched", !!m.matched[c.i]); b.setAttribute("aria-label", mmLabel(c, i, up));
  }
  function mmProgress() {
    var m = G.mm, mv = root.querySelector(".mm-moves b"), ct = root.querySelector(".mm-count"), dots = root.querySelectorAll(".g-memory .g-dots span");
    if (mv) mv.textContent = m.moves;
    if (ct) ct.innerHTML = m.found + "<span> / " + m.pairs + "</span>";
    for (var k = 0; k < dots.length; k++) dots[k].classList.toggle("done", k < m.found);
    var gd = root.querySelector(".g-memory .g-dots"); if (gd) gd.setAttribute("aria-label", m.found + " of " + m.pairs + " pairs found");
  }
  function memoryFlip(i) {
    var m = G.mm; if (!m || G.phase !== "run") return;
    var c = m.cards[i]; if (!c || m.lock || m.matched[c.i] || m.up.indexOf(i) >= 0) return;
    m.up.push(i); mmSet(i, true);
    if (c.face === "word") { stopSpeech(); speak(c.w.hanzi); }
    if (m.up.length < 2) return;
    m.moves++;
    var a = m.cards[m.up[0]], b = m.cards[m.up[1]], pair = m.up.slice();
    if (a.i === b.i) {
      m.matched[a.i] = true; m.found++; m.up = [];
      pair.forEach(function (k) { mmSet(k, true); }); mmProgress(); chime();
      if (m.found === m.pairs) { clearTimeout(gTimer); gTimer = setTimeout(memoryFinish, 1100); }
    } else {
      m.lock = true; mmProgress();
      clearTimeout(gTimer);
      gTimer = setTimeout(function () { if (G.mm !== m) return; m.up = []; m.lock = false; pair.forEach(function (k) { mmSet(k, false); }); }, 1100);
    }
  }
  /* Stars from moves: ≤ pairs+1 → 5, ≤ pairs+3 → 4, ≤ pairs+5 → 3, otherwise 2. Best = fewest moves. No Tricky words. */
  function memoryFinish() {
    var m = G.mm, g = curGame(), p = m.pairs, mv = m.moves;
    var stars = mv <= p + 1 ? 5 : mv <= p + 3 ? 4 : mv <= p + 5 ? 3 : 2;
    var b = saveBest(g.id, G.listId, mv, p, true);
    G.result = { stars: stars, first: 0, total: p, missed: 0,
      head: stars === 5 ? ["太棒了！", "All " + p + " pairs in " + mv + " moves!"] : ["做得好！", "All " + p + " pairs in " + mv + " moves!"],
      bestText: (b.newBest ? "New best for this list: " : "Best for this list: ") + b.best + " moves" };
    G.phase = "end"; render(); toTop();
    var a = root.querySelector('[data-act="gagain"]'); if (a) a.focus({ preventScroll: true });
  }
  /* Shared top bar: ✕ back to the picker, progress dots, "2 / 5". */
  function gameTop(n, i) {
    var dots = ""; for (var k = 0; k < n; k++) dots += "<span" + (k === i ? ' class="on"' : k < i ? ' class="done"' : "") + "></span>";
    return '<div class="d-top"><button type="button" class="round-btn" data-act="gquit" aria-label="Back to games">' + IC.close + "</button>" +
      '<div class="g-dots" role="img" aria-label="Question ' + (i + 1) + " of " + n + '">' + dots + '</div><span class="d-count">' + (i + 1) + "<span> / " + n + "</span></span></div>";
  }
  /* Shared question screen for choice games. */
  function choiceView(g) {
    var n = G.q.length, q = G.q[G.i];
    var choices = q.choices.map(function (c, ci) {
      var right = G.solved && c.text === q.answer, wrong = G.wrong.indexOf(ci) >= 0, off = wrong || (G.solved && !right);
      var anim = G.anim && G.anim.i === ci ? " " + G.anim.type : "";
      return '<button type="button" class="g-choice' + (right ? " right" : "") + (wrong ? " wrong" : "") + anim + '" data-act="gpick" data-i="' + ci + '"' + (off ? " disabled" : "") +
        ' aria-label="' + (ci + 1) + ". " + esc(c.text) + (right ? ", right" : "") + '">' +
        '<span class="g-num" aria-hidden="true">' + (ci + 1) + '</span><span class="g-word"><span class="g-hz" lang="zh-CN">' + esc(c.text) + "</span>" +
        (G.hint && g.hint === "pinyin" ? '<span class="g-py">' + esc(c.py || "") + "</span>" : "") + "</span>" + (right ? '<span class="g-tick" aria-hidden="true">' + IC.tick + "</span>" : "") + "</button>";
    }).join("");
    G.anim = null; /* bounce/wobble play once, on the render that follows the tap */
    var canHint = !g.hasHint || g.hasHint(q);
    return '<div class="screen game g-' + g.id + '">' + gameTop(n, G.i) +
      '<section class="g-q" aria-label="' + esc(g.region) + '">' +
      '<div class="g-media">' + g.media(q) +
      '<p class="g-reveal" role="status">' + (G.solved ? '<span class="g-r-py">' + esc(q.w.pinyin || "") + '</span><span class="g-r-en">' + esc(q.w.english || "") + "</span>" : "") + "</p></div>" +
      '<div class="g-side"><p class="g-prompt"><span class="howto-cn" lang="zh-CN">' + g.how[0] + "</span> " + g.how[1] + "</p>" +
      '<div class="g-choices">' + choices + "</div>" +
      '<div class="g-tools">' + (G.solved ? '<button type="button" class="big-btn dark g-next" data-act="gnext"><span class="bb-cn" lang="zh-CN">' + (G.i < n - 1 ? "下一个" : "看结果") + '</span><span class="bb-en">' + (G.i < n - 1 ? "Next" : "Finish") + "</span>" + IC.arrowR + "</button>"
        : canHint ? '<button type="button" class="g-hint" data-act="ghint"' + (G.hint ? " disabled" : "") + '><span aria-hidden="true">💡</span><span lang="zh-CN">提示</span> Hint</button>' : "") + "</div>" +
      "</div></section></div>";
  }
  /* Answer: right → blue + tick, bounce, chime, the word spoken, pinyin + English shown, next after ~1.5 s.
     Wrong → boop, wobble, that choice fades and is disabled; keep trying. */
  function gamePick(ci) {
    if (G.phase !== "run" || G.solved) return;
    var g = curGame(), q = G.q[G.i], c = q.choices[ci]; if (!c || G.wrong.indexOf(ci) >= 0) return;
    if (c.text === q.answer) {
      G.solved = true; G.anim = { i: ci, type: "bounce" }; stopSpeech(); render(); chime();
      if (g.onRight) g.onRight(q); else sayWordSoon(q.w, 250);
      var nx = root.querySelector(".g-next"); if (nx) nx.focus({ preventScroll: true });
      clearTimeout(gTimer); gTimer = setTimeout(gameNext, g.nextAfter || 1600);
    } else {
      q.firstTry = false; G.wrong.push(ci); G.anim = { i: ci, type: "wobble" }; render(); boop();
      var left = root.querySelector(".g-choice:not([disabled])"); if (left) left.focus({ preventScroll: true });
    }
  }
  function gameNext() {
    clearTimeout(gTimer); if (G.phase !== "run" || !G.solved) return;
    stopSpeech();
    if (G.i < G.q.length - 1) {
      G.i++; G.wrong = []; G.solved = false; G.hint = false; render();
      var p = root.querySelector(".g-choice"); if (p) p.focus({ preventScroll: true });
      var g = curGame(); if (g.onShow) g.onShow(G.q[G.i]);
    } else gameFinish();
  }
  /* Best score per game per list. lower = true for scores where fewer is better (moves). */
  function saveBest(gameId, listId, score, total, lower) {
    var all = gameScores(), mine = all[gameId] = all[gameId] || {}, prev = mine[listId];
    var better = !prev || (lower ? score < prev.best : score > (prev.best || 0));
    if (better) mine[listId] = { best: score, total: total };
    lsSet("tx-games", all);
    return { best: mine[listId].best, newBest: better };
  }
  /* End of round: Tricky words for anything not right first time, best score per list. */
  function gameFinish() {
    var g = curGame(), first = G.q.filter(function (q) { return q.firstTry; }).length, total = G.q.length;
    applyTricky(G.q.map(function (q) { return { w: q.w, ok: q.firstTry }; }));
    var b = saveBest(g.id, G.listId, first, total, false);
    G.result = { first: first, total: total, best: b.best, newBest: b.newBest && first > 0, missed: total - first };
    G.phase = "end"; render(); toTop();
    var a = root.querySelector('[data-act="gagain"]'); if (a) a.focus({ preventScroll: true });
  }
  /* Shared end screen. r: { first, total, best, newBest, missed, stars?, head?, bestText? } */
  function gameEndView(g) {
    var r = G.result, stars = r.stars != null ? r.stars : starCount(r.first, r.total), sizes = [40, 48, 58, 48, 40];
    var starRow = sizes.map(function (s, k) { return '<span class="ws s' + k + (k < stars ? " on" : "") + '">' + ic(s, '<path d="' + STAR + '"/>', 'stroke-width="1.2" stroke-linejoin="round"') + "</span>"; }).join("");
    var head = r.head || (r.first >= r.total ? ["太棒了！", r.first + " / " + r.total + " first try!"] : r.first > 0 ? ["做得好！", r.first + " / " + r.total + " first try!"] : ["加油！", "Good try! Let's play again."]);
    var bestText = r.bestText || (r.newBest ? "New best for this list: " : "Best for this list: ") + r.best + " / " + r.total;
    return '<div class="screen welldone game-end"><div class="confetti" aria-hidden="true"><span class="cf c1"></span><span class="cf c2"></span><span class="cf c3"></span><span class="cf c4"></span><span class="cf c5"></span><span class="cf c6"></span></div>' +
      '<div class="wstars" role="img" aria-label="' + stars + ' out of 5 stars">' + starRow + "</div>" +
      '<h1 class="wd-cn" lang="zh-CN">' + head[0] + '</h1><p class="wd-en">' + head[1] + "</p>" +
      '<div class="scard"><p class="sn-cn"><span lang="zh-CN">' + g.cn + "</span> " + g.en + "</p>" +
      '<p class="sn-en">' + esc(bestText) + "</p>" +
      (r.missed ? '<p class="sn-en">' + r.missed + (r.missed === 1 ? " word" : " words") + " added to Tricky words to practise.</p>" : "") + "</div>" +
      '<div class="screen-foot">' + howto("", "Play again with a new order, or go back to the games.", "wd-how") +
      '<button type="button" class="big-btn yellow" data-act="gagain"><span class="bb-cn" lang="zh-CN">再玩一次</span><span class="bb-en">Play again</span></button>' +
      '<button type="button" class="big-btn white" data-act="gback"><span class="bb-cn" lang="zh-CN">回到游戏</span><span class="bb-en">Back to games</span></button></div></div>';
  }

  /* ---------- Hanzi Writer (stroke order), self-hosted ---------- */
  /* Stroke data comes only from our own copy, vendor/hanzi-writer-data/<char>.json (scripts/fetch_strokes.py);
     Hanzi Writer's default loader would fetch from a CDN, so every writer is created through hanziWriter(). */
  var strokeCache = {};
  function strokeLoader(ch, onLoad, onError) {
    if (strokeCache[ch]) { onLoad(strokeCache[ch]); return; }
    fetch("vendor/hanzi-writer-data/" + encodeURIComponent(ch) + ".json")
      .then(function (r) { if (!r.ok) throw new Error("stroke data " + r.status); return r.json(); })
      .then(function (d) { strokeCache[ch] = d; onLoad(d); })
      .catch(function (e) { if (onError) onError(e); });
  }
  function hanziWriter(el, ch, opts) {
    if (!window.HanziWriter) return null;
    var o = {}; for (var k in opts || {}) o[k] = opts[k];
    o.charDataLoader = strokeLoader;
    return window.HanziWriter.create(el, ch, o);
  }
  /* The one live writer (the Write tool). render() mounts it into .hw-target; anything else drops it. */
  var WR = null, wrSize = 0;
  function dropWriter() { if (WR) { try { WR.cancelQuiz(); } catch (e) {} WR = null; } }
  function tokenColor(name, fallback) { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
  /* Colours from the design tokens: strokes --ink, outline light grey (--hw-outline), hint highlight --pencil,
     correct quiz strokes --grid. Size fits the box; the drawn line scales with it. */
  function writerOptions(size, quiz, outline) {
    return { width: size, height: size, padding: Math.round(size * 0.07), showCharacter: false, showOutline: !!outline,
      strokeColor: quiz ? tokenColor("--grid", "#2F9461") : tokenColor("--ink", "#1D2B36"),
      outlineColor: tokenColor("--hw-outline", "#D9E2DD"), highlightColor: tokenColor("--pencil", "#F6C343"),
      drawingColor: tokenColor("--ink", "#1D2B36"), drawingWidth: Math.max(10, Math.round(size / 24)),
      strokeAnimationSpeed: 0.6, delayBetweenStrokes: 500, strokeHighlightSpeed: 1, highlightOnComplete: true };
  }
  var LENIENCY = 1.3; /* a little above Hanzi Writer's default (1) for young children */
  var hwResizeT = 0;
  window.addEventListener("resize", function () {
    clearTimeout(hwResizeT);
    hwResizeT = setTimeout(function () { var t = root.querySelector(".hw-target"); if (WR && t && Math.floor(t.clientWidth) !== wrSize) mountWriterForView(); }, 250);
  });

  /* ---------- 写一写 Write (Learn): watch, trace, then write each character ---------- */
  /* S.write = { wi: word index, ci: character index, step: "watch" | "trace" | "write", from: "pic" | "focus" } */
  function writeView(L) {
    var wv = S.write, w = L.words[wv.wi], chars = Array.from(w.hanzi), ci = wv.ci, ch = chars[ci], n = chars.length;
    var chips = chars.map(function (c, i) { return '<span class="wv-ch' + (i === ci ? " on" : "") + '">' + esc(c) + "</span>"; }).join("");
    var steps = [["watch", "看一看", "Watch"], ["trace", "描一描", "Trace"], ["write", "写一写", "Write"]].map(function (s, k) {
      return '<button type="button" class="wv-step" data-act="wstep" data-v="' + s[0] + '" aria-pressed="' + (wv.step === s[0]) + '"><span class="wv-n" aria-hidden="true">' + (k + 1) + '</span><span class="bb-cn" lang="zh-CN">' + s[1] + '</span><span class="bb-en">' + s[2] + "</span></button>";
    }).join("");
    var again = wv.step === "watch" ? ["再看一次", "Watch again"] : ["再写一次", "Try again"];
    var last = ci === n - 1, end = last && wv.wi === L.words.length - 1;
    return '<div class="screen wv">' +
      '<div class="d-top"><button type="button" class="round-btn" data-act="wclose" aria-label="Close Write">' + IC.close + "</button>" +
      '<span class="d-title wv-word" lang="zh-CN" aria-label="' + esc(w.hanzi) + ", character " + (ci + 1) + " of " + n + '">' + chips + '</span><span class="d-count">' + (ci + 1) + "<span> / " + n + "</span></span></div>" +
      howto("看一看，描一描，写一写", "Watch, trace, then write", "wv-how") +
      '<div class="wv-body"><div class="wv-stage">' +
      '<div class="wv-head"><span class="wv-py">' + esc(charPinyin(w, ci) || w.pinyin || "") + '</span>' +
      '<button type="button" class="g-say wv-say" data-act="wsay" data-hl="wsay" aria-label="Hear ' + esc(w.hanzi) + '"><span class="listen-ic">' + IC.spkMid + '</span><span lang="zh-CN">' + esc(w.hanzi) + "</span></button></div>" +
      '<div class="hw-box" role="img" aria-label="' + esc((wv.step === "watch" ? "Stroke order of " : "Drawing box for ") + ch) + '"><div class="hw-target"></div></div>' +
      '<p class="wv-status" role="status"></p></div>' +
      '<div class="wv-side"><div class="wv-steps" role="group" aria-label="Steps">' + steps + "</div>" +
      '<button type="button" class="wv-again" data-act="wreplay"><span aria-hidden="true">↻</span><span lang="zh-CN">' + again[0] + "</span> " + again[1] + "</button>" +
      '<div class="wv-nav"><button type="button" class="wv-navb" data-act="wprev"' + (ci === 0 ? " disabled" : "") + ' aria-label="Previous character">' + IC.chevL + "</button>" +
      '<button type="button" class="big-btn dark wv-next" data-act="wnext"><span class="bb-cn" lang="zh-CN">' + (end ? "完成" : last ? "下一个词" : "下一个字") + '</span><span class="bb-en">' + (end ? "Done" : last ? "Next word" : "Next character") + "</span>" + IC.arrowR + "</button></div>" +
      "</div></div></div>";
  }
  function writeStatus(t) { var s = root.querySelector(".wv-status"); if (s) s.textContent = t; }
  /* Mount the writer for the Write view's current character and step. */
  function mountWrite() {
    var L = curList(), t = root.querySelector(".hw-target"); if (!L || !t || !S.write) return;
    var wv = S.write, ch = Array.from(L.words[wv.wi].hanzi)[wv.ci], size = wrSize = Math.floor(t.clientWidth);
    dropWriter(); t.innerHTML = "";
    var w = WR = hanziWriter(t, ch, writerOptions(size, wv.step !== "watch", wv.step !== "write"));
    if (!w) { writeStatus("Stroke order isn't available here."); return; }
    if (wv.step === "watch") { w.animateCharacter({ onComplete: function () { if (WR === w) writeStatus("描一描 Now trace it"); } }); return; }
    w.quiz({ leniency: LENIENCY, showHintAfterMisses: wv.step === "trace" ? 2 : 3,
      onComplete: function (s) { if (WR !== w) return; chime(); writeStatus(s.totalMistakes === 0 ? "太棒了！ Perfect!" : "做得好！ Well done!"); } });
  }
  function mountWriterForView() {
    if (S.mode === "learn" && S.write) mountWrite();
  }
  function openWrite(wi) {
    stopSpeech();
    S.write = { wi: wi, ci: 0, step: "watch", from: S.pic ? "pic" : "focus" };
    render(); toTop();
    var b = root.querySelector('.wv-step[aria-pressed="true"]'); if (b) b.focus({ preventScroll: true });
  }
  function closeWrite() {
    if (!S.write) return;
    var wi = S.write.wi, from = S.write.from; S.write = null; dropWriter();
    if (from === "pic") S.pi = wi; else S.fi = wi;
    render();
    var b = root.querySelector('[data-act="wopen"]'); if (b) b.focus({ preventScroll: true });
  }
  function moveWrite(d) {
    var L = curList(), wv = S.write; if (!L || !wv) return;
    var n = Array.from(L.words[wv.wi].hanzi).length;
    if (d < 0) { if (wv.ci === 0) return; wv.ci--; }
    else if (wv.ci < n - 1) wv.ci++;
    else if (wv.wi < L.words.length - 1) { wv.wi++; wv.ci = 0; }
    else { closeWrite(); return; }
    wv.step = "watch"; stopSpeech(); render();
    if (d > 0 && wv.ci === 0) sayOne("wsay", L.words[wv.wi].hanzi); /* a new word: hear it */
  }

  /* ---------- sound effects (Web Audio, no files; Parent corner → Sounds) ---------- */
  var AC = null;
  function audioCtx() {
    if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { AC = new C(); } catch (e) { return null; } }
    if (AC.state === "suspended") { try { AC.resume(); } catch (e) {} }
    return AC;
  }
  function tone(freq, at, dur, type, vol, slideTo) {
    var ac = audioCtx(); if (!ac) return;
    var t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function chime() { if (prefs.sound) { tone(784, 0, 0.18, "sine", 0.18); tone(1175, 0.11, 0.34, "sine", 0.16); } } /* G5 → D6, bright and short */
  function boop() { if (prefs.sound) tone(260, 0, 0.22, "triangle", 0.14, 170); } /* soft low slide, not a buzzer */
  function popSound() { if (prefs.sound) { tone(520, 0, 0.07, "sine", 0.2, 1400); tone(1600, 0.03, 0.05, "triangle", 0.08, 900); } } /* quick bright "pop" */

  /* ---------- Parent corner ---------- */
  /* Add to Home Screen tip: phones and tablets only, and not once it's already running from the Home Screen. */
  function homeTip() {
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    var ua = navigator.userAgent || "", ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
    if (standalone || (!ios && !android)) return "";
    var share = ic(18, '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M6 11H5v10h14V11h-1"/>', line(2));
    return '<div class="pc-tip home"><b>Add to Home Screen</b><p>' +
      (ios ? "Safari can clear stickers from sites you haven't opened for a week. Add this page to your Home Screen so they stay: in Safari, tap Share <span class=\"share-ic\">" + share + "</span> then <b>Add to Home Screen</b>."
        : "Add this page to your Home Screen so it opens like an app and keeps stickers safe: open the browser menu ⋮ and tap <b>Add to Home screen</b> (or <b>Install app</b>).") + "</p></div>";
  }
  function sw(k, label) {
    return '<button type="button" class="sw" role="switch" aria-checked="' + !!prefs[k] + '" data-act="pref" data-k="' + k + '"><span>' + label + '</span><span class="sw-track" aria-hidden="true"><span class="sw-knob"></span></span></button>';
  }
  function parentHtml() {
    var nt = Object.keys(trickyMap()).length, ns = Object.keys(stickers()).length;
    return '<div class="pc-in"><span class="pc-grab" aria-hidden="true"></span>' +
      '<div class="pc-head"><div><h2 id="pc-title">Parent corner</h2><p>Settings and tips</p></div>' +
      '<button type="button" class="pc-x" data-act="pcclose" aria-label="Close parent corner">' + IC.close + "</button></div>" +
      '<section class="pc-sec" aria-labelledby="pc-h-cards"><h3 id="pc-h-cards">On the word cards</h3><div class="sw-grid">' +
      sw("py", "Pinyin") + sw("pics", "Pictures") + sw("en", "English") + sw("slow", "Slow voice") + "</div></section>" +
      '<section class="pc-sec" aria-labelledby="pc-h-screen"><h3 id="pc-h-screen">Sound and screen</h3><div class="sw-grid">' + sw("sound", "Sounds") + sw("dark", "Dark theme") + "</div></section>" +
      '<div class="pc-tip"><b>How it works</b><p>Learn: tap a word to hear it. Dictation: each word plays twice; she writes on paper, then checks with the faces. Missed words go to Tricky.</p></div>' + homeTip() +
      '<section class="pc-sec pc-credits" aria-labelledby="pc-h-credits"><h3 id="pc-h-credits">Credits</h3>' +
      "<p>Stroke order: Hanzi Writer (MIT). Stroke data: Make Me a Hanzi / Arphic Technology, Arphic Public License.</p>" +
      '<p class="pc-links"><a href="vendor/hanzi-writer/LICENSE.txt" target="_blank" rel="noopener">Hanzi Writer licence (MIT)</a>' +
      '<a href="vendor/hanzi-writer-data/ARPHICPL.TXT" target="_blank" rel="noopener">Arphic Public License</a></p></section>' +
      '<div class="pc-danger"><button type="button" class="pc-clear" data-act="tclear"' + (nt ? "" : " disabled") + ">" +
      (!nt ? "No tricky words on this device" : S.clearArm ? "Tap again to clear " + nt + " tricky word" + (nt === 1 ? "" : "s") : "Clear tricky words on this device") + "</button>" +
      (ns ? '<button type="button" class="pc-clear" data-act="sreset">' + (S.resetArm ? "Tap again to remove " + ns + " sticker" + (ns === 1 ? "" : "s") : "Reset stickers") + "</button>" : "") + "</div></div>";
  }
  function renderParent() { var k = focusKey(pc); pc.innerHTML = parentHtml(); refocus(pc, k); }
  var pcOpener = null, pcDownOnBackdrop = false;
  function openParent(opener) {
    if (pc.open) return;
    pcOpener = opener || null; S.clearArm = false; S.resetArm = false; renderParent();
    if (typeof pc.showModal === "function") pc.showModal(); else pc.setAttribute("open", "");
    var x = pc.querySelector(".pc-x"); if (x) x.focus();
  }
  function closeParent() { if (!pc.open) return; if (typeof pc.close === "function") pc.close(); else { pc.removeAttribute("open"); onParentClosed(); } }
  function onParentClosed() {
    S.clearArm = false; S.resetArm = false;
    var o = pcOpener; pcOpener = null;
    if (!o || !document.contains(o) || o.offsetParent === null) o = Array.prototype.filter.call(root.querySelectorAll(".pc-btn"), function (b) { return b.offsetParent !== null; })[0];
    if (o) o.focus({ preventScroll: true });
  }
  pc.addEventListener("close", onParentClosed);
  /* Close on a backdrop tap, but only if the press started there (the finger lifting after a hold must not close it). */
  pc.addEventListener("pointerdown", function (e) { pcDownOnBackdrop = e.target === pc; });
  pc.addEventListener("click", function (e) { if (e.target === pc && pcDownOnBackdrop) closeParent(); });

  /* ---------- Week sheet: choose a list (from the title picker or sticker pill) ---------- */
  function weeksHtml() {
    var st = stickers(), nx = nextId(), now = new Date();
    var rows = S.lists.map(function (l) {
      var s = st[l.id], past = TXL.isPast(l, now);
      var state = s ? (s.perfect ? "perfect sticker" : "sticker earned") : "no sticker yet";
      var label = "听写" + (l.number || l.id) + ", " + (l.date ? fmtLong(l.date) : "no date") + ", " + state + (l.id === nx ? ", next test" : "");
      return '<button type="button" class="ws-row' + (past ? " past" : "") + '" data-act="wspick" data-id="' + esc(l.id) + '" aria-pressed="' + (l.id === S.cur) + '" aria-label="' + esc(label) + '">' +
        '<span class="ws-d" aria-hidden="true">' + esc(fmtShort(l.date) || "No date") + '</span><span class="ws-t" lang="zh-CN" aria-hidden="true">' + esc(titleOf(l)) + "</span>" +
        (l.id === nx ? '<span class="ws-next" aria-hidden="true">Next</span>' : "") +
        '<span class="ws-stk' + (s ? " got" + (s.perfect ? " perfect" : "") : "") + '" aria-hidden="true">' + (s ? starFill(16) : "") + "</span></button>";
    }).join("");
    return '<div class="pc-in"><span class="pc-grab" aria-hidden="true"></span>' +
      '<div class="pc-head"><h2 id="ws-title"><span lang="zh-CN">选一周</span> Choose a week</h2>' +
      '<button type="button" class="pc-x" data-act="wsclose" aria-label="Close">' + IC.close + "</button></div>" +
      howto("点一周来练习", "Tap a week to practise it", "ws-how") + '<div class="ws-list">' + rows + "</div></div>";
  }
  var wsOpener = null, wsDownOnBackdrop = false;
  function openWeeks(opener) {
    if (ws.open) return;
    wsOpener = opener || null; ws.innerHTML = weeksHtml();
    if (typeof ws.showModal === "function") ws.showModal(); else ws.setAttribute("open", "");
    /* Open scrolled to the selected week, with focus on it. */
    var sel = ws.querySelector('.ws-row[aria-pressed="true"]') || ws.querySelector(".ws-row");
    if (sel) {
      sel.focus({ preventScroll: true });
      /* rows' offsetParent is the dialog itself (position: fixed), which is also the scroll container */
      ws.scrollTop = Math.max(0, sel.offsetTop - (ws.clientHeight - sel.offsetHeight) / 2);
    }
  }
  function closeWeeks() { if (!ws.open) return; if (typeof ws.close === "function") ws.close(); else { ws.removeAttribute("open"); onWeeksClosed(); } }
  /* Focus goes back to the title, whether the sheet was opened from it or from the sticker pill
     (the page may have re-rendered after a pick, so find the visible one). */
  function onWeeksClosed() {
    wsOpener = null;
    var t = Array.prototype.filter.call(root.querySelectorAll(".title-btn"), function (b) { return b.offsetParent !== null; })[0];
    if (t) t.focus({ preventScroll: true });
  }
  ws.addEventListener("close", onWeeksClosed);
  ws.addEventListener("pointerdown", function (e) { wsDownOnBackdrop = e.target === ws; });
  ws.addEventListener("click", function (e) { if (e.target === ws && wsDownOnBackdrop) closeWeeks(); });

  /* ---------- render ---------- */
  /* Re-rendering replaces the DOM, so remember which control had focus and put focus back on its replacement. */
  function keyOf(d) { return [d.act, d.m || d.k || d.id || "", d.src || "", d.i || "", d.v || ""].join("|"); }
  function focusKey(container) {
    var a = document.activeElement;
    return a && container.contains(a) && a.dataset && a.dataset.act ? keyOf(a.dataset) : null;
  }
  function refocus(container, key) {
    if (!key) return;
    var els = container.querySelectorAll("[data-act]");
    for (var i = 0; i < els.length; i++) if (keyOf(els[i].dataset) === key && els[i].offsetParent !== null && !els[i].disabled) { els[i].focus({ preventScroll: true }); return; }
  }
  /* Warm the cache with the current list's pictures only; everything else loads lazily when shown. */
  var preloaded = null;
  function preloadPictures(L) {
    if (!L || !prefs.pics || preloaded === L.id) return;
    preloaded = L.id;
    L.words.forEach(function (w) { if (w.img) { var im = new Image(); im.decoding = "async"; im.src = w.img; } });
  }
  function render() {
    var full = (S.mode === "dict" && D.phase !== "idle") || (S.mode === "learn" && (S.focus || S.pic || S.write)) || (S.mode === "play" && G.phase !== "picker");
    document.body.classList.toggle("full", full);
    if (S.loading) { root.innerHTML = appbar() + '<main class="main"><p class="loading">Loading spelling lists…</p></main>'; return; }
    if (S.loadError) { root.innerHTML = appbar() + '<main class="main"><p class="banner">' + esc(S.loadError) + "</p></main>"; return; }
    var k = focusKey(root), L = curList(), v;
    if (S.mode === "learn") v = learnView(L);
    else if (S.mode === "play") v = playView(L);
    else if (S.mode === "dict") v = dictView(L);
    else v = trickyView();
    root.innerHTML = appbar() + '<main class="main">' + (full ? "" : banner()) + v + "</main>";
    refocus(root, k);
    if (pc.open) renderParent();
    preloadPictures(L);
    /* Bubble pop: (re)start the float for the bubbles just drawn; stop it everywhere else. */
    if (S.mode === "play" && G.phase === "run" && G.game === "bubbles") bubbleStart(); else bubbleStop();
    /* Stroke order: mount a writer into the drawing box just drawn; drop it everywhere else. */
    if (root.querySelector(".hw-target")) mountWriterForView(); else dropWriter();
  }

  /* ---------- dictation flow ---------- */
  function startDict(words, src, listId, retest) {
    stopSpeech();
    D = newDict();
    D.src = src; D.listId = listId || null; D.retest = !!retest; D.phase = "run";
    D.queue = shuffle(words.map(function (w) { return { hanzi: w.hanzi, pinyin: w.pinyin, english: w.english, pic: w.pic, img: w.img }; }));
    S.mode = "dict"; S.focus = false; render(); toTop(); sayCurrent();
  }
  function sayCurrent() {
    var t = ++TOKEN; var w = D.queue[D.i]; if (!w) return;
    hl("dict", true);
    wait(300).then(function () { if (t !== TOKEN) return; return speak(w.hanzi); })
      .then(function () { if (t !== TOKEN) return; return wait(1600); })
      .then(function () { if (t !== TOKEN) return; return speak(w.hanzi); })
      .then(function () { if (t === TOKEN) hl("dict", false); });
  }
  /* Tricky words (shared by Dictation and the picture quiz): a missed word gains a miss; a word that is already
     tricky leaves after it's right twice in a row. results = [{ w, ok }] */
  function applyTricky(results) {
    var m = trickyMap();
    results.forEach(function (r) {
      var w = r.w;
      if (!r.ok) { var o = m[w.hanzi] || { misses: 0, streak: 0 }; o.misses++; o.streak = 0; o.pinyin = w.pinyin; o.english = w.english; if (w.pic) o.pic = w.pic; if (w.img) o.img = w.img; m[w.hanzi] = o; }
      else if (m[w.hanzi]) { m[w.hanzi].streak = (m[w.hanzi].streak || 0) + 1; if (m[w.hanzi].streak >= 2) delete m[w.hanzi]; }
    });
    lsSet("tx-tricky", m);
  }
  function saveTricky() {
    applyTricky(D.queue.map(function (w, i) { return D.marks[i] ? { w: w, ok: D.marks[i] === "ok" } : null; }).filter(Boolean));
  }
  /* Done pressed: save tricky words, then the sticker. A sticker is earned the first time a full dictation of a
     list is finished; later runs keep the best score. Practising missed words again doesn't change it. */
  function finishCheck() {
    stopSpeech(); saveTricky();
    var right = 0; D.queue.forEach(function (_, i) { if (D.marks[i] === "ok") right++; });
    var res = { right: right, total: D.queue.length, isNew: false, sticker: null };
    if (D.src === "list" && !D.retest && D.listId) {
      var st = stickers(), prev = st[D.listId];
      st[D.listId] = { best: Math.max(prev ? prev.best || 0 : 0, right), total: res.total, perfect: !!(prev && prev.perfect) || right === res.total, at: prev && prev.at ? prev.at : todayStr() };
      lsSet("tx-stickers", st); persistOnce();
      res.isNew = !prev; res.sticker = st[D.listId];
    }
    D.result = res; D.phase = "done"; render(); toTop();
  }

  /* ---------- events ---------- */
  function wordFor(src, i) {
    if (src === "learn") { var L = curList(); return L && L.words[i]; }
    if (src === "tricky") return trickyArr()[i];
    if (src === "review") return D.queue[i];
  }
  function sayFocus() { var L = curList(), w = L && L.words[S.fi]; if (!w) return; stopSpeech(); sayOne("focus-" + S.fi, w.hanzi); }
  function sayPic() { var L = curList(), w = L && L.words[S.pi]; if (!w) return; stopSpeech(); sayOne("pv-" + S.pi, w.hanzi); }
  /* Prev/next in focus mode or the picture card (whichever is open). */
  function moveFocus(d) {
    var L = curList(); if (!L) return;
    var cur = S.pic ? S.pi : S.fi, n = Math.max(0, Math.min(L.words.length - 1, cur + d)); if (n === cur) return;
    if (S.pic) S.pi = n; else S.fi = n;
    stopSpeech(); render(); if (S.pic) sayPic(); else sayFocus();
  }
  function closePic() {
    stopSpeech(); var i = S.pi; S.pic = false;
    if (S.picFrom === "focus") { S.focus = true; S.fi = i; render(); return; }
    render();
    var b = root.querySelector('.more[data-i="' + i + '"]'); if (b) b.focus();
  }
  var lastPointer = "mouse";
  var ACT = {
    weeks: function (b) { openWeeks(b); },
    wsclose: closeWeeks,
    /* Pick a week: select it, close the sheet, stay on the same tab (Dictation goes back to its start screen). */
    wspick: function (b) {
      var id = b.dataset.id;
      if (id !== S.cur) { stopSpeech(); S.cur = id; S.fi = 0; S.pi = 0; S.write = null; if (S.mode === "dict") D = newDict(); if (S.mode === "play") G = newGame(); }
      wsOpener = null; render(); closeWeeks();
    },
    thisweek: function () {
      stopSpeech(); S.cur = defaultId(); S.fi = 0; S.pi = 0; S.write = null; if (S.mode === "dict") D = newDict(); render();
      var c = Array.prototype.filter.call(root.querySelectorAll(".title-btn"), function (x) { return x.offsetParent !== null; })[0]; if (c) c.focus({ preventScroll: true }); /* the pill itself is gone now */
    },
    mode: function (b) { stopSpeech(); clearTimeout(gTimer); S.mode = b.dataset.m; S.focus = false; S.pic = false; S.write = null; S.clearArm = false; if (S.mode === "dict") D = newDict(); if (S.mode === "play") G = newGame(); render(); },
    gstart: function (b) { if (b.getAttribute("aria-disabled") === "true") return; audioCtx(); startGame(b.dataset.g, true); }, /* first tap unlocks Web Audio on iOS */
    bspeed: function (b) { bubbleSpeed = b.dataset.v === "normal" ? "normal" : "slow"; render(); },
    bgo: function () { audioCtx(); startGame(G.game); },
    bpick: function (b) { bubblePick(+b.dataset.i); },
    gpick: function (b) { gamePick(+b.dataset.i); },
    mflip: function (b) { memoryFlip(+b.dataset.i); },
    ghint: function () { if (G.phase !== "run") return; G.hint = true; render(); var c = root.querySelector(".g-choice:not([disabled])"); if (c) c.focus({ preventScroll: true }); },
    gnext: gameNext,
    gsay: function () { var q = G.q[G.i]; if (q) { stopSpeech(); sayOne("gsay", q.say || q.w.hanzi); } },
    gquit: function () { var id = G.game; clearTimeout(gTimer); stopSpeech(); G = newGame(); render(); toTop(); focusGameCard(id); },
    gagain: function () { startGame(G.game); },
    gback: function () { var id = G.game; G = newGame(); render(); toTop(); focusGameCard(id); },
    say: function (b) {
      var src = b.dataset.src, i = +b.dataset.i, w = wordFor(src, i); if (!w) return;
      var wasPlaying = S.playing; stopSpeech(); if (wasPlaying) render();
      sayOne(src + "-" + i, w.hanzi);
    },
    playall: function () {
      if (S.playing) { stopSpeech(); render(); return; }
      var L = curList(); if (!L) return; stopSpeech(); var t = TOKEN; S.playing = true; render();
      (async function () {
        for (var i = 0; i < L.words.length; i++) {
          if (t !== TOKEN) return; hl("learn-" + i, true); await speak(L.words[i].hanzi); hl("learn-" + i, false);
          if (t !== TOKEN) return; await wait(900);
        }
        if (t === TOKEN) { S.playing = false; render(); }
      })();
    },
    focus: function () { stopSpeech(); S.focus = true; S.fi = 0; render(); toTop(); sayFocus(); },
    unfocus: function () {
      stopSpeech(); var i = S.fi; S.focus = false; render();
      var c = root.querySelector('.word-main[data-i="' + i + '"]'); if (c) c.focus();
    },
    fprev: function () { moveFocus(-1); },
    fnext: function () { moveFocus(1); },
    fsay: sayFocus,
    picview: function (b) { stopSpeech(); S.picFrom = S.focus ? "focus" : "learn"; S.pi = +b.dataset.i; S.focus = false; S.pic = true; render(); toTop(); sayPic(); },
    pvclose: closePic,
    wopen: function (b) { openWrite(+b.dataset.i); },
    wclose: closeWrite,
    wstep: function (b) { if (!S.write) return; S.write.step = b.dataset.v; render(); },
    wreplay: function () { writeStatus(""); mountWrite(); },
    wsay: function () { var L = curList(), w = L && S.write && L.words[S.write.wi]; if (w) { stopSpeech(); sayOne("wsay", w.hanzi); } },
    wprev: function () { moveWrite(-1); },
    wnext: function () { moveWrite(1); },
    pvprev: function () { moveFocus(-1); },
    pvnext: function () { moveFocus(1); },
    pvsay: sayPic,
    pvsent: function () { var L = curList(), w = L && L.words[S.pi]; if (!w || !w.sentence) return; stopSpeech(); sayOne("pvs-" + S.pi, w.sentence); },
    pref: function (b) { var k = b.dataset.k; prefs[k] = !prefs[k]; lsSet("tx-prefs", prefs); applyTheme(); render(); },
    parent: function (b, e) {
      /* Keyboard (detail 0) and mouse open straight away; a short tap asks for a hold instead. */
      if (e.detail === 0 || lastPointer === "mouse") openParent(b);
      else if (!pc.open) nudge(b);
    },
    pcclose: closeParent,
    dstart: function () { var L = curList(); if (L) startDict(L.words, "list", L.id, false); },
    tstart: function () { var a = trickyArr(); if (a.length) startDict(a, "tricky", null, false); },
    again: function () { sayCurrent(); },
    next: function () {
      stopSpeech();
      if (D.i < D.queue.length - 1) { D.i++; render(); sayCurrent(); }
      else { D.phase = "check"; render(); toTop(); }
    },
    dstop: function () { stopSpeech(); var src = D.src; D = newDict(); if (src === "tricky") S.mode = "tricky"; render(); toTop(); },
    mark: function (b) { var i = +b.dataset.i, v = b.dataset.v; if (D.marks[i] === v) delete D.marks[i]; else D.marks[i] = v; render(); },
    finish: function () { if (Object.keys(D.marks).length >= D.queue.length) finishCheck(); },
    retest: function () { var miss = D.queue.filter(function (_, i) { return D.marks[i] === "no"; }); if (miss.length) startDict(miss, D.src, D.listId, true); },
    back: function () { stopSpeech(); var src = D.src; D = newDict(); S.mode = src === "tricky" ? "tricky" : "learn"; S.focus = false; render(); toTop(); },
    tclear: function () { if (!S.clearArm) { S.clearArm = true; renderParent(); return; } S.clearArm = false; lsSet("tx-tricky", {}); render(); renderParent(); },
    sreset: function () { if (!S.resetArm) { S.resetArm = true; renderParent(); return; } S.resetArm = false; lsSet("tx-stickers", {}); render(); renderParent(); }
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b || !(root.contains(b) || pc.contains(b) || ws.contains(b))) return;
    var a = b.dataset.act;
    if ((a !== "tclear" && S.clearArm) || (a !== "sreset" && S.resetArm)) {
      if (a !== "tclear") S.clearArm = false; if (a !== "sreset") S.resetArm = false;
      if (pc.open && a !== "pick" && a !== "pcclose") renderParent();
    }
    if (ACT[a]) { e.preventDefault(); ACT[a](b, e); }
  });

  /* Keyboard shortcuts: Space = hear, ←/→ = move between words, Enter = next word in dictation.
     A focused button keeps its own Space/Enter except where noted. */
  document.addEventListener("keydown", function (e) {
    if (pc.open || ws.open || e.ctrlKey || e.metaKey || e.altKey || S.loading) return;
    var a = document.activeElement, act = a && a.dataset ? a.dataset.act : null, onBtn = !!(a && a.tagName === "BUTTON");
    var k = e.key, space = k === " " || k === "Spacebar";
    if (S.mode === "learn" && S.write) {
      if (k === "Escape") { e.preventDefault(); closeWrite(); }
      else if (k === "ArrowLeft" && !onBtn) { e.preventDefault(); moveWrite(-1); }
      else if (k === "ArrowRight" && !onBtn) { e.preventDefault(); moveWrite(1); }
      else if (space && !onBtn) { e.preventDefault(); ACT.wsay(); }
      return;
    }
    if (S.mode === "learn" && S.pic) {
      if (k === "ArrowLeft") { e.preventDefault(); moveFocus(-1); }
      else if (k === "ArrowRight") { e.preventDefault(); moveFocus(1); }
      else if (k === "Escape") { e.preventDefault(); closePic(); }
      else if (space && !onBtn) { e.preventDefault(); sayPic(); }
      return;
    }
    if (S.mode === "learn" && S.focus) {
      if (k === "ArrowLeft") { e.preventDefault(); moveFocus(-1); }
      else if (k === "ArrowRight") { e.preventDefault(); moveFocus(1); }
      else if (space && !onBtn) { e.preventDefault(); sayFocus(); }
      return;
    }
    if (S.mode === "learn" && (k === "ArrowLeft" || k === "ArrowRight")) {
      var items = Array.prototype.slice.call(root.querySelectorAll(".grid .word-main, .grid .tile")), idx = items.indexOf(a);
      if (idx < 0 && act === "picview") idx = items.indexOf(a.parentNode.querySelector(".word-main")); /* from "ⓘ more", move by card */
      if (idx < 0 && onBtn) return; /* arrows stay with the tab bar and other buttons */
      e.preventDefault();
      var to = idx < 0 ? 0 : Math.max(0, Math.min(items.length - 1, idx + (k === "ArrowRight" ? 1 : -1)));
      if (items[to]) items[to].focus();
      return;
    }
    /* Picture quiz: keys 1/2/3 pick a choice. */
    if (S.mode === "play" && G.phase === "run" && /^[1-9]$/.test(k)) {
      var q = G.q[G.i];
      if (q && q.choices && +k <= q.choices.length) { e.preventDefault(); if (!e.repeat) (G.game === "bubbles" ? bubblePick : gamePick)(+k - 1); }
      return;
    }
    if (S.mode === "dict" && D.phase === "run" && act !== "dstop") {
      /* In dictation Space always means hear again and Enter always means next (except on the ✕ button). */
      if (space) { e.preventDefault(); if (!e.repeat) ACT.again(); }
      else if (k === "Enter" && act !== "again") { e.preventDefault(); if (!e.repeat) ACT.next(); }
    }
  });

  /* Swipe between words in focus mode and the picture card (horizontal moves only; vertical scrolling still works). */
  var SWIPE = null;
  root.addEventListener("pointerdown", function (e) {
    if (!((S.focus && e.target.closest(".f-stage")) || (S.pic && e.target.closest(".pv-stage"))) || e.target.closest("button")) return;
    SWIPE = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  root.addEventListener("pointerup", function (e) {
    if (!SWIPE || e.pointerId !== SWIPE.id) return;
    var dx = e.clientX - SWIPE.x, dy = e.clientY - SWIPE.y; SWIPE = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) moveFocus(dx < 0 ? 1 : -1);
  });
  root.addEventListener("pointercancel", function () { SWIPE = null; });

  /* Press-and-hold for the Parent corner on touch screens: the ring fills over 1.5 s (CSS), then it opens. */
  var HOLD = null, HOLD_MS = 1500;
  function holdEnd() { if (!HOLD) return; clearTimeout(HOLD.t); HOLD.b.classList.remove("holding"); HOLD = null; }
  function nudge(b) {
    var w = b.closest(".pc-gear") || b; w.classList.add("hint");
    clearTimeout(w._hint); w._hint = setTimeout(function () { w.classList.remove("hint"); }, 1600);
  }
  document.addEventListener("pointerdown", function (e) {
    lastPointer = e.pointerType || "mouse";
    var b = e.target.closest && e.target.closest(".pc-btn");
    if (!b || lastPointer === "mouse" || e.button > 0) return;
    holdEnd();
    b.classList.add("holding");
    HOLD = { b: b, x: e.clientX, y: e.clientY, t: setTimeout(function () { var bb = HOLD && HOLD.b; holdEnd(); if (bb) openParent(bb); }, HOLD_MS) };
  }, true);
  document.addEventListener("pointermove", function (e) { if (HOLD && Math.abs(e.clientX - HOLD.x) + Math.abs(e.clientY - HOLD.y) > 16) holdEnd(); }, true);
  document.addEventListener("pointerup", holdEnd, true);
  document.addEventListener("pointercancel", holdEnd, true);
  document.addEventListener("contextmenu", function (e) { if (e.target.closest && e.target.closest(".pc-btn")) e.preventDefault(); });

  /* TEMPORARY: network-first service worker so a deploy shows up straight away despite GitHub Pages'
     10-minute cache (see sw.js and CLAUDE.md). updateViaCache "none": sw.js itself is never served from cache. */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () {}); });
  }

  /* ---------- load data ---------- */
  booted = true;
  render();
  fetch("data/lookalikes.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (d) { LOOK = d && typeof d === "object" ? d : {}; }).catch(function () {}); /* only 缺字 uses it; it falls back without */
  fetch("data/lists.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { S.lists = TXL.sortLists((d && d.lists) || []); S.cur = pickDefault(); S.loading = false; render(); })
    .catch(function () { S.loading = false; S.loadError = "The spelling lists couldn't be loaded. Check your connection and refresh the page."; render(); });
})();
