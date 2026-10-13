/* 听写 practice — static app. Data comes from data/lists.json (edit that file to add lists). */
(function () {
  "use strict";
  var root = document.getElementById("root");
  var pc = document.getElementById("parent"); /* Parent corner <dialog>, kept outside #root so re-renders don't close it */

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
    return { slow: !!p.slow, py: p.py !== false, en: !!p.en, pics: p.pics !== false, dark: !!p.dark };
  })();
  function applyTheme() { document.documentElement.setAttribute("data-theme", prefs.dark ? "dark" : "light"); }
  applyTheme();
  /* focus/fi: Learn's one-word-at-a-time view and its word index. */
  var S = { lists: [], cur: null, mode: "learn", focus: false, fi: 0, playing: false, clearArm: false, resetArm: false, pcAll: false, loading: true, loadError: "" };
  /* Dictation: phase idle → run → check → done. src "list" | "tricky"; retest = practising missed words again. */
  function newDict() { return { src: "list", listId: null, retest: false, queue: [], i: 0, phase: "idle", marks: {}, result: null }; }
  var D = newDict();
  var TOKEN = 0;

  /* ---------- helpers ---------- */
  var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAYL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function sortLists(ls) { return ls.slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); }); }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function nextId() { var t = todayStr(); for (var i = 0; i < S.lists.length; i++) if (S.lists[i].date && S.lists[i].date >= t) return S.lists[i].id; return null; }
  function pickDefault() {
    var q = new URLSearchParams(location.search).get("list");
    if (q && S.lists.some(function (l) { return l.id === q; })) return q;
    if (!S.lists.length) return null;
    return nextId() || S.lists[S.lists.length - 1].id;
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
  function whenTag(s) { var t = whenText(s); return t ? '<span class="when' + (t === "Past list" ? " past" : "") + '">' + t + "</span>" : ""; }
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
    one: ic(22, '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10.5 9.5l2-1.5v8"/>')
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
    if (prev !== voiceState) render();
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
  function trickyArr() {
    var m = trickyMap();
    return Object.keys(m).map(function (k) { var o = m[k]; return { hanzi: k, pinyin: o.pinyin, english: o.english, pic: o.pic, misses: o.misses }; })
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

  var TABS = [["learn", "学习", "Learn", IC.book], ["dict", "听写", "Dictation", IC.pencil], ["tricky", "难词", "Tricky", IC.star]];
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
  function dateLine(L) { return L && L.date ? '<p class="date"><span class="d-short">' + esc(fmtShort(L.date)) + '</span><span class="d-long">' + esc(fmtLong(L.date)) + "</span>" + whenTag(L.date) + "</p>" : ""; }

  function stickerStrip() {
    if (!S.lists.length) return "";
    var st = stickers(), nx = nextId(), got = 0;
    var dots = S.lists.map(function (l) {
      var s = st[l.id];
      if (s) { got++; return '<span class="stk got' + (s.perfect ? " perfect" : "") + '">' + starFill(16) + "</span>"; }
      return '<span class="stk' + (l.id === nx ? " now" : "") + '"></span>';
    }).join("");
    return '<div class="stickers" role="img" aria-label="My stickers: ' + got + " of " + S.lists.length + '"><span class="stk-label"><b lang="zh-CN">我的贴纸</b> My stickers</span><span class="stk-row">' + dots + "</span></div>";
  }
  function boxes(text, cls, empty) {
    var chars = Array.from(text || "");
    return '<span class="boxes n' + Math.min(chars.length, 5) + (cls ? " " + cls : "") + '">' + chars.map(function (c) { return '<span class="tzg"><span>' + (empty ? "" : esc(c)) + "</span></span>"; }).join("") + "</span>";
  }
  var BARS = '<span class="bars" aria-hidden="true"><span></span><span></span><span></span></span>';
  function card(w, i, src, extra) {
    return '<button type="button" class="word t' + (i % 5) + '" data-act="say" data-src="' + src + '" data-i="' + i + '" data-hl="' + src + "-" + i + '" aria-label="Hear ' + esc(w.hanzi) + '">' +
      (prefs.pics && w.pic ? '<span class="pic" aria-hidden="true">' + esc(w.pic) + "</span>" : "") + BARS + boxes(w.hanzi) +
      (prefs.py && w.pinyin ? '<span class="py">' + esc(w.pinyin) + "</span>" : "") +
      (prefs.en && w.english ? '<span class="en">' + esc(w.english) + "</span>" : "") + (extra || "") + "</button>";
  }
  function tile(act, icon, cn, en) {
    return '<button type="button" class="tile" data-act="' + act + '"><span class="tile-ic">' + icon + '</span><span class="tile-cn" lang="zh-CN">' + cn + '</span><span class="tile-en">' + en + "</span></button>";
  }
  function keyHints() {
    return '<ul class="keys" aria-label="Keyboard shortcuts"><li><kbd>Space</kbd>Hear the word</li><li><kbd aria-label="Left arrow">←</kbd><kbd aria-label="Right arrow">→</kbd>Move between words</li><li><kbd>Enter</kbd>Next word in dictation</li></ul>';
  }

  /* ---------- Learn ---------- */
  function learnView(L) {
    if (!L) return top('<h1 class="title">听写</h1>') + '<div class="panel"><p>No spelling lists have been added yet.</p></div>';
    if (S.focus) return focusView(L);
    var main = (L.id === nextId() ? '<span class="pill-week"><span lang="zh-CN">本周</span> This week</span>' : "") +
      '<h1 class="title" lang="zh-CN">' + esc(titleOf(L)) + "</h1>" + dateLine(L);
    return top(main, stickerStrip()) +
      '<div class="learn-bar">' + howto("点一点，听一听", "Tap a word to hear it.") +
      '<button type="button" class="onebyone" data-act="focus">' + IC.one + '<span lang="zh-CN">一个一个</span> One by one</button></div>' +
      '<div class="grid">' + L.words.map(function (w, i) { return card(w, i, "learn"); }).join("") +
      (S.playing ? tile("playall", IC.stop, "停一停", "Stop") : tile("playall", IC.play, "全部听", "Play all")) + "</div>" + keyHints();
  }
  /* Focus mode: one word at a time; swipe, the arrow buttons or ←/→ move between words. */
  function focusView(L) {
    var n = L.words.length, i = S.fi = Math.max(0, Math.min(S.fi, n - 1)), w = L.words[i];
    var dots = ""; for (var k = 0; k < n; k++) dots += "<span" + (k === i ? ' class="on"' : "") + "></span>";
    return '<div class="focus">' +
      '<div class="f-top"><button type="button" class="f-all" data-act="unfocus">' + IC.grid + '<span class="f-all-cn" lang="zh-CN">全部</span><span class="f-all-en">All words</span></button>' +
      '<div class="f-title"><h1 class="f-h" lang="zh-CN">' + esc(titleOf(L)) + "</h1>" + (L.date ? '<p class="f-date">' + esc(fmtShort(L.date)) + ", " + esc(whenText(L.date)) + "</p>" : "") + "</div>" +
      '<div class="f-pc">' + gearBtn() + pillBtn() + "</div></div>" +
      '<div class="f-stage">' +
      '<button type="button" class="f-nav prev" data-act="fprev" aria-label="Previous word"' + (i === 0 ? " disabled" : "") + ">" + IC.chevL + "</button>" +
      '<div class="f-card t' + (i % 5) + '" data-hl="focus-' + i + '">' + BARS +
      (prefs.pics && w.pic ? '<span class="f-pic" aria-hidden="true">' + esc(w.pic) + "</span>" : "") + boxes(w.hanzi) +
      (prefs.py && w.pinyin ? '<span class="f-py">' + esc(w.pinyin) + "</span>" : "") +
      (prefs.en && w.english ? '<span class="f-en">' + esc(w.english) + "</span>" : "") +
      '<button type="button" class="listen" data-act="fsay" aria-label="Listen to ' + esc(w.hanzi) + '"><span class="listen-ic">' + IC.spkMid + '</span><span class="listen-cn" lang="zh-CN">听一听</span><span class="listen-en">Listen</span></button></div>' +
      '<button type="button" class="f-nav next" data-act="fnext" aria-label="Next word"' + (i === n - 1 ? " disabled" : "") + ">" + IC.chevR + "</button></div>" +
      '<div class="f-foot">' + howto("滑一滑", "Swipe or use the arrows", "f-howto") +
      '<div class="f-dots" role="img" aria-label="Word ' + (i + 1) + " of " + n + '">' + dots + "</div>" +
      '<button type="button" class="f-dict" data-act="dstart">' + IC.pencil + '<span lang="zh-CN">开始听写</span> Dictation</button></div>' +
      '<p class="sr" aria-live="polite">Word ' + (i + 1) + " of " + n + "</p></div>";
  }

  /* ---------- Dictation ---------- */
  function dictTitle() { var L = listById(D.listId); return D.src === "tricky" ? "难词" : titleOf(L); }
  function dictView(L) {
    if (D.phase === "run") return runView();
    if (D.phase === "check") return checkView();
    if (D.phase === "done") return doneView();
    var head = top('<h1 class="title" lang="zh-CN">' + esc(L ? titleOf(L) : "听写") + "</h1>" + dateLine(L));
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
    return '<div class="screen done"><div class="confetti" aria-hidden="true"><span class="cf c1"></span><span class="cf c2"></span><span class="cf c3"></span><span class="cf c4"></span><span class="cf c5"></span><span class="cf c6"></span></div>' +
      '<div class="wstars" role="img" aria-label="' + stars + ' out of 5 stars">' + starRow + "</div>" +
      '<h1 class="wd-cn" lang="zh-CN">' + head[0] + '</h1><p class="wd-en">' + head[1] + "</p>" +
      '<div class="scard">' + sc + '<ul class="sbook" aria-label="Sticker book: ' + got + " of " + S.lists.length + '">' + book + "</ul></div>" +
      '<div class="screen-foot">' + howto("", missed.length ? "Practise the words you missed, or go back to your words." : "Go back to your words, or try another list in the Parent corner.", "wd-how") + again +
      '<button type="button" class="big-btn white" data-act="back"><span class="bb-cn" lang="zh-CN">回到单词</span><span class="bb-en">Back to words</span></button></div></div>';
  }

  /* ---------- Tricky ---------- */
  function trickyView() {
    var arr = trickyArr();
    var h = top('<h1 class="title" lang="zh-CN">难词</h1><p class="sub">Tricky words</p>') + howto("再练一练", "Words to practise again.");
    if (!arr.length) return h + '<div class="panel"><p class="count">No tricky words yet</p><p class="muted">Words you mark to practise again in Dictation show up here.</p></div>';
    return h + '<div class="grid">' + arr.map(function (w, i) { return card(w, i, "tricky", '<span class="miss">Missed ' + w.misses + "×</span>"); }).join("") +
      tile("tstart", IC.pencil, "练一练", "Practise these") + "</div>";
  }

  /* ---------- Parent corner ---------- */
  function sw(k, label) {
    return '<button type="button" class="sw" role="switch" aria-checked="' + !!prefs[k] + '" data-act="pref" data-k="' + k + '"><span>' + label + '</span><span class="sw-track" aria-hidden="true"><span class="sw-knob"></span></span></button>';
  }
  function parentHtml() {
    var ls = S.lists, nx = nextId(), st = stickers(), t = todayStr(), shown = ls;
    if (!S.pcAll && ls.length > 4) {
      /* A window of 4 around now: last week's list, then the next ones. Show all if the chosen list falls outside it. */
      var ni = -1; for (var i = 0; i < ls.length; i++) if (ls[i].id === nx) ni = i;
      if (ni < 0) ni = ls.length;
      var start = Math.max(0, Math.min(ni - 1, ls.length - 4));
      shown = ls.slice(start, start + 4);
      if (!shown.some(function (l) { return l.id === S.cur; })) shown = ls;
    }
    var rows = shown.map(function (l) {
      var past = l.date && l.date < t;
      return '<button type="button" class="pc-row' + (past ? " past" : "") + '" data-act="pick" data-id="' + esc(l.id) + '" aria-pressed="' + (l.id === S.cur) + '">' +
        '<span class="pc-d">' + esc(fmtShort(l.date) || "No date") + '</span><span class="pc-t" lang="zh-CN">' + esc(titleOf(l)) + "</span>" +
        (st[l.id] ? '<span class="pc-star" role="img" aria-label="Sticker earned">' + starFill(14) + "</span>" : "") +
        (l.id === nx ? '<span class="nx-tag">Next</span>' : "") + "</button>";
    }).join("");
    var more = ls.length - shown.length;
    var nt = Object.keys(trickyMap()).length, ns = Object.keys(st).length;
    return '<div class="pc-in"><span class="pc-grab" aria-hidden="true"></span>' +
      '<div class="pc-head"><div><h2 id="pc-title">Parent corner</h2><p>Lists, settings and tips</p></div>' +
      '<button type="button" class="pc-x" data-act="pcclose" aria-label="Close parent corner">' + IC.close + "</button></div>" +
      '<section class="pc-sec" aria-labelledby="pc-h-lists"><h3 id="pc-h-lists">Choose a list by test date</h3><div class="pc-lists">' + rows +
      (more > 0 ? '<button type="button" class="pc-more" data-act="pcmore">Show ' + more + " more list" + (more === 1 ? "" : "s") + "</button>" : "") + "</div></section>" +
      '<section class="pc-sec" aria-labelledby="pc-h-cards"><h3 id="pc-h-cards">On the word cards</h3><div class="sw-grid">' +
      sw("py", "Pinyin") + sw("pics", "Pictures") + sw("en", "English") + sw("slow", "Slow voice") + "</div></section>" +
      '<section class="pc-sec" aria-labelledby="pc-h-screen"><h3 id="pc-h-screen">Screen</h3><div class="sw-grid">' + sw("dark", "Dark theme") + "</div></section>" +
      '<div class="pc-tip"><b>How it works</b><p>Learn: tap a word to hear it. Dictation: each word plays twice; she writes on paper, then checks with the faces. Missed words go to Tricky.</p></div>' +
      '<div class="pc-danger"><button type="button" class="pc-clear" data-act="tclear"' + (nt ? "" : " disabled") + ">" +
      (!nt ? "No tricky words on this device" : S.clearArm ? "Tap again to clear " + nt + " tricky word" + (nt === 1 ? "" : "s") : "Clear tricky words on this device") + "</button>" +
      (ns ? '<button type="button" class="pc-clear" data-act="sreset">' + (S.resetArm ? "Tap again to remove " + ns + " sticker" + (ns === 1 ? "" : "s") : "Reset stickers") + "</button>" : "") + "</div></div>";
  }
  function renderParent() { var k = focusKey(pc); pc.innerHTML = parentHtml(); refocus(pc, k); }
  var pcOpener = null, pcDownOnBackdrop = false;
  function openParent(opener) {
    if (pc.open) return;
    pcOpener = opener || null; S.pcAll = false; S.clearArm = false; S.resetArm = false; renderParent();
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
  function render() {
    var full = (S.mode === "dict" && D.phase !== "idle") || (S.mode === "learn" && S.focus);
    document.body.classList.toggle("full", full);
    if (S.loading) { root.innerHTML = appbar() + '<main class="main"><p class="loading">Loading spelling lists…</p></main>'; return; }
    if (S.loadError) { root.innerHTML = appbar() + '<main class="main"><p class="banner">' + esc(S.loadError) + "</p></main>"; return; }
    var k = focusKey(root), L = curList(), v;
    if (S.mode === "learn") v = learnView(L);
    else if (S.mode === "dict") v = dictView(L);
    else v = trickyView();
    root.innerHTML = appbar() + '<main class="main">' + (full ? "" : banner()) + v + "</main>";
    refocus(root, k);
    if (pc.open) renderParent();
  }

  /* ---------- dictation flow ---------- */
  function startDict(words, src, listId, retest) {
    stopSpeech();
    D = newDict();
    D.src = src; D.listId = listId || null; D.retest = !!retest; D.phase = "run";
    D.queue = shuffle(words.map(function (w) { return { hanzi: w.hanzi, pinyin: w.pinyin, english: w.english, pic: w.pic }; }));
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
  /* Tricky words: a practise-again word gains a miss; a right word on the list twice in a row leaves it. */
  function saveTricky() {
    var m = trickyMap();
    D.queue.forEach(function (w, i) {
      var v = D.marks[i]; if (!v) return;
      if (v === "no") { var o = m[w.hanzi] || { misses: 0, streak: 0 }; o.misses++; o.streak = 0; o.pinyin = w.pinyin; o.english = w.english; if (w.pic) o.pic = w.pic; m[w.hanzi] = o; }
      else if (m[w.hanzi]) { m[w.hanzi].streak = (m[w.hanzi].streak || 0) + 1; if (m[w.hanzi].streak >= 2) delete m[w.hanzi]; }
    });
    lsSet("tx-tricky", m);
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
  function moveFocus(d) {
    var L = curList(); if (!L) return;
    var n = Math.max(0, Math.min(L.words.length - 1, S.fi + d)); if (n === S.fi) return;
    S.fi = n; stopSpeech(); render(); sayFocus();
  }
  var lastPointer = "mouse";
  var ACT = {
    pick: function (b) { stopSpeech(); S.cur = b.dataset.id; S.fi = 0; if (S.mode === "dict") D = newDict(); closeParent(); render(); },
    mode: function (b) { stopSpeech(); S.mode = b.dataset.m; S.focus = false; S.clearArm = false; if (S.mode === "dict") D = newDict(); render(); },
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
      var c = root.querySelector('.word[data-i="' + i + '"]'); if (c) c.focus();
    },
    fprev: function () { moveFocus(-1); },
    fnext: function () { moveFocus(1); },
    fsay: sayFocus,
    pref: function (b) { var k = b.dataset.k; prefs[k] = !prefs[k]; lsSet("tx-prefs", prefs); applyTheme(); render(); },
    parent: function (b, e) {
      /* Keyboard (detail 0) and mouse open straight away; a short tap asks for a hold instead. */
      if (e.detail === 0 || lastPointer === "mouse") openParent(b);
      else if (!pc.open) nudge(b);
    },
    pcclose: closeParent,
    pcmore: function () { S.pcAll = true; renderParent(); var r = pc.querySelector('.pc-row[aria-pressed="true"]') || pc.querySelector(".pc-row"); if (r) r.focus(); },
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
    var b = e.target.closest("[data-act]"); if (!b || !(root.contains(b) || pc.contains(b))) return;
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
    if (pc.open || e.ctrlKey || e.metaKey || e.altKey || S.loading) return;
    var a = document.activeElement, act = a && a.dataset ? a.dataset.act : null, onBtn = !!(a && a.tagName === "BUTTON");
    var k = e.key, space = k === " " || k === "Spacebar";
    if (S.mode === "learn" && S.focus) {
      if (k === "ArrowLeft") { e.preventDefault(); moveFocus(-1); }
      else if (k === "ArrowRight") { e.preventDefault(); moveFocus(1); }
      else if (space && !onBtn) { e.preventDefault(); sayFocus(); }
      return;
    }
    if (S.mode === "learn" && (k === "ArrowLeft" || k === "ArrowRight")) {
      var items = Array.prototype.slice.call(root.querySelectorAll(".grid .word, .grid .tile")), idx = items.indexOf(a);
      if (idx < 0 && onBtn) return; /* arrows stay with the tab bar and other buttons */
      e.preventDefault();
      var to = idx < 0 ? 0 : Math.max(0, Math.min(items.length - 1, idx + (k === "ArrowRight" ? 1 : -1)));
      if (items[to]) items[to].focus();
      return;
    }
    if (S.mode === "dict" && D.phase === "run" && act !== "dstop") {
      /* In dictation Space always means hear again and Enter always means next (except on the ✕ button). */
      if (space) { e.preventDefault(); if (!e.repeat) ACT.again(); }
      else if (k === "Enter" && act !== "again") { e.preventDefault(); if (!e.repeat) ACT.next(); }
    }
  });

  /* Swipe between words in focus mode (horizontal moves only; vertical scrolling still works). */
  var SWIPE = null;
  root.addEventListener("pointerdown", function (e) {
    if (!S.focus || !e.target.closest(".f-stage") || e.target.closest("button")) return;
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

  /* ---------- load data ---------- */
  render();
  fetch("data/lists.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { S.lists = sortLists((d && d.lists) || []); S.cur = pickDefault(); S.loading = false; render(); })
    .catch(function () { S.loading = false; S.loadError = "The spelling lists couldn't be loaded. Check your connection and refresh the page."; render(); });
})();
