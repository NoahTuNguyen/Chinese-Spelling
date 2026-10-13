/* 听写 practice — static app. Data comes from data/lists.json (edit that file to add lists). */
(function () {
  "use strict";
  var root = document.getElementById("root");
  var pc = document.getElementById("parent"); /* Parent corner <dialog>, kept outside #root so re-renders don't close it */

  /* ---------- storage helpers (per device) ---------- */
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

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
  var S = { lists: [], cur: null, mode: "learn", playing: false, clearArm: false, pcAll: false, loading: true, loadError: "" };
  var D = { src: "list", queue: [], i: 0, phase: "idle", marks: {}, saved: false };
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
  function curList() { for (var i = 0; i < S.lists.length; i++) if (S.lists[i].id === S.cur) return S.lists[i]; return null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function parseDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function fmtShort(s) { var d = parseDate(s); return d ? DAY[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()] : ""; }
  function fmtLong(s) { var d = parseDate(s); return d ? DAYL[d.getDay()] + " " + d.getDate() + " " + MONL[d.getMonth()] : ""; }
  function whenTag(s) {
    var d = parseDate(s); if (!d) return "";
    var n = Math.round((d - parseDate(todayStr())) / 86400000);
    if (n < 0) return '<span class="when past">Past list</span>';
    return '<span class="when">' + (n === 0 ? "Test today" : n === 1 ? "Tomorrow" : "in " + n + " days") + "</span>";
  }
  function titleOf(l) { return "听写" + (l && l.number ? "（" + l.number + "）" : ""); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- icons (inline SVG markup; colours come from CSS via currentColor) ---------- */
  var STAR = "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z";
  var LINE = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  function ic(size, inner, attrs) { return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ' + (attrs || LINE) + ">" + inner + "</svg>"; }
  var IC = {
    book: ic(22, '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>'),
    pencil: ic(22, '<path d="M17 3l4 4L8 20H4v-4z"/><path d="M14 6l4 4"/>'),
    star: ic(22, '<path d="' + STAR + '"/>'),
    gear: ic(24, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
    close: ic(18, '<path d="M6 6l12 12M18 6L6 18"/>', 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"'),
    play: ic(26, '<path d="M8 5.5v13l11-6.5z"/>', 'fill="currentColor"'),
    stop: ic(24, '<rect x="6" y="6" width="12" height="12" rx="2.5"/>', 'fill="currentColor"')
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
  function hl(src, i, on) { var el = root.querySelector('.word[data-src="' + src + '"][data-i="' + i + '"]'); if (el) el.classList.toggle("speaking", on); }

  /* ---------- per-device records ---------- */
  function trickyMap() { return lsGet("tx-tricky", {}); }
  function trickyArr() {
    var m = trickyMap();
    return Object.keys(m).map(function (k) { var o = m[k]; return { hanzi: k, pinyin: o.pinyin, english: o.english, pic: o.pic, misses: o.misses }; })
      .sort(function (a, b) { return b.misses - a.misses; });
  }
  function stickers() { var s = lsGet("tx-stickers", {}); return s && typeof s === "object" ? s : {}; }

  /* ---------- shared pieces ---------- */
  function banner() {
    if (voiceState === "none") return '<p class="banner">This browser has no Chinese voice, so words can\'t be read aloud here. Try Microsoft Edge or Chrome, or open the link on a phone.</p>';
    if (voiceState === "other") return '<p class="banner">This browser only has a non-mainland Chinese voice, so the accent may differ slightly from school. Edge or Chrome usually have a mainland voice.</p>';
    return "";
  }
  /* One short how-to line per screen: simple Chinese (kid) + English (kid or parent). */
  function howto(cn, en) { return '<p class="howto">' + (cn ? '<span class="howto-cn" lang="zh-CN">' + esc(cn) + "</span> · " : "") + esc(en) + "</p>"; }

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
  function card(w, i, src, extra) {
    return '<button type="button" class="word t' + (i % 5) + '" data-act="say" data-src="' + src + '" data-i="' + i + '" aria-label="Hear ' + esc(w.hanzi) + '">' +
      (prefs.pics && w.pic ? '<span class="pic" aria-hidden="true">' + esc(w.pic) + "</span>" : "") +
      '<span class="bars" aria-hidden="true"><span></span><span></span><span></span></span>' + boxes(w.hanzi) +
      (prefs.py && w.pinyin ? '<span class="py">' + esc(w.pinyin) + "</span>" : "") +
      (prefs.en && w.english ? '<span class="en">' + esc(w.english) + "</span>" : "") + (extra || "") + "</button>";
  }
  function tile(act, icon, cn, en) {
    return '<button type="button" class="tile" data-act="' + act + '"><span class="tile-ic">' + icon + '</span><span class="tile-cn" lang="zh-CN">' + cn + '</span><span class="tile-en">' + en + "</span></button>";
  }

  /* ---------- views ---------- */
  function learnView(L) {
    if (!L) return top('<h1 class="title">听写</h1>') + '<div class="panel"><p>No spelling lists have been added yet.</p></div>';
    var main = (L.id === nextId() ? '<span class="pill-week"><span lang="zh-CN">本周</span> This week</span>' : "") +
      '<h1 class="title" lang="zh-CN">' + esc(titleOf(L)) + "</h1>" +
      (L.date ? '<p class="date"><span class="d-short">' + esc(fmtShort(L.date)) + '</span><span class="d-long">' + esc(fmtLong(L.date)) + "</span>" + whenTag(L.date) + "</p>" : "");
    return top(main, stickerStrip()) + howto("点一点，听一听", "Tap a word to hear it.") +
      '<div class="grid">' + L.words.map(function (w, i) { return card(w, i, "learn"); }).join("") +
      (S.playing ? tile("playall", IC.stop, "停一停", "Stop") : tile("playall", IC.play, "全部听", "Play all")) + "</div>";
  }
  function dictView(L) {
    if (D.phase === "idle") {
      var head = top('<h1 class="title" lang="zh-CN">' + esc(L ? titleOf(L) : "听写") + "</h1>" + (L && L.date ? '<p class="date"><span class="d-short">' + esc(fmtShort(L.date)) + '</span><span class="d-long">' + esc(fmtLong(L.date)) + "</span>" + whenTag(L.date) + "</p>" : ""));
      if (!L) return head + '<div class="panel"><p>No list to practise yet.</p></div>';
      return head + howto("听一听，写一写", "Listen, then write it on your paper.") +
        '<div class="panel"><p class="muted">Each word is read twice, in random order. Write each one on your paper, then check your answers at the end.</p>' +
        '<div class="row"><button type="button" class="btn primary" data-act="dstart">Start dictation (' + L.words.length + " words)</button></div></div>";
    }
    if (D.phase === "run") {
      var w = D.queue[D.i], n = D.queue.length, last = D.i === n - 1;
      var dots = ""; for (var k = 0; k < n; k++) dots += '<span class="' + (k <= D.i ? "on" : "") + '"></span>';
      return howto("听一听，写一写", "Listen, then write it on your paper.") +
        '<div class="panel"><p class="count">Word ' + (D.i + 1) + " of " + n + '</p><div class="dots">' + dots + "</div>" + boxes(w.hanzi, "big", true) +
        '<div class="row"><button type="button" class="btn" data-act="again">Say again</button>' +
        '<button type="button" class="btn primary" data-act="next">' + (last ? "Finish and check" : "Next word") + '</button></div><div class="row"><button type="button" class="link" data-act="dstop">Stop dictation</button></div></div>';
    }
    var rows = D.queue.map(function (w, i) {
      var m = D.marks[i];
      var marks = D.saved
        ? (m === "ok" ? '<span class="r-ok">✓</span>' : m === "no" ? '<span class="r-no">✗</span>' : "")
        : '<button type="button" class="mk ok" data-act="mark" data-i="' + i + '" data-v="ok" aria-pressed="' + (m === "ok") + '" aria-label="Correct">✓</button>' +
          '<button type="button" class="mk no" data-act="mark" data-i="' + i + '" data-v="no" aria-pressed="' + (m === "no") + '" aria-label="Wrong">✗</button>';
      return '<div class="rrow"><button type="button" class="mini" data-act="say" data-src="review" data-i="' + i + '" aria-label="Hear ' + esc(w.hanzi) + '">🔊</button><span class="rz">' +
        esc(w.hanzi) + '</span><span class="rp">' + esc(w.pinyin || "") + "</span>" + marks + "</div>";
    }).join("");
    if (!D.saved) {
      return howto("", "Compare with your paper. Tap 🔊 to hear a word, mark each one ✓ or ✗, then tap Save marks.") +
        '<div class="panel"><p class="count">Check your paper</p><div class="review">' + rows + "</div>" +
        '<div class="row"><button type="button" class="btn primary" data-act="savemarks">Save marks</button><button type="button" class="link" data-act="dstop">Skip</button></div></div>';
    }
    var right = 0, wrong = 0;
    D.queue.forEach(function (_, i) { if (D.marks[i] === "ok") right++; else if (D.marks[i] === "no") wrong++; });
    return howto("", "Missed words are saved to Tricky. Practise just those now, or tap Done.") +
      '<div class="panel"><p class="score">' + right + " / " + D.queue.length + '</p><p class="muted">' + (wrong ? wrong + " to practise again." : "All correct. Well done!") + "</p>" +
      '<div class="review">' + rows + '</div><div class="row">' + (wrong ? '<button type="button" class="btn primary" data-act="retest">Practise the ' + wrong + " missed again</button>" : "") +
      '<button type="button" class="btn" data-act="dstop">Done</button></div></div>';
  }
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
    var nt = Object.keys(trickyMap()).length;
    return '<div class="pc-in"><span class="pc-grab" aria-hidden="true"></span>' +
      '<div class="pc-head"><div><h2 id="pc-title">Parent corner</h2><p>Lists, settings and tips</p></div>' +
      '<button type="button" class="pc-x" data-act="pcclose" aria-label="Close parent corner">' + IC.close + "</button></div>" +
      '<section class="pc-sec" aria-labelledby="pc-h-lists"><h3 id="pc-h-lists">Choose a list by test date</h3><div class="pc-lists">' + rows +
      (more > 0 ? '<button type="button" class="pc-more" data-act="pcmore">Show ' + more + " more list" + (more === 1 ? "" : "s") + "</button>" : "") + "</div></section>" +
      '<section class="pc-sec" aria-labelledby="pc-h-cards"><h3 id="pc-h-cards">On the word cards</h3><div class="sw-grid">' +
      sw("py", "Pinyin") + sw("pics", "Pictures") + sw("en", "English") + sw("slow", "Slow voice") + "</div></section>" +
      '<section class="pc-sec" aria-labelledby="pc-h-screen"><h3 id="pc-h-screen">Screen</h3><div class="sw-grid">' + sw("dark", "Dark theme") + "</div></section>" +
      '<div class="pc-tip"><b>How it works</b><p>Learn: tap a word to hear it. Dictation: each word plays twice; she writes on paper, then checks her answers. Missed words go to Tricky.</p></div>' +
      '<button type="button" class="pc-clear" data-act="tclear"' + (nt ? "" : " disabled") + ">" +
      (!nt ? "No tricky words on this device" : S.clearArm ? "Tap again to clear " + nt + " tricky word" + (nt === 1 ? "" : "s") : "Clear tricky words on this device") + "</button></div>";
  }
  function renderParent() { var k = focusKey(pc); pc.innerHTML = parentHtml(); refocus(pc, k); }
  var pcOpener = null, pcDownOnBackdrop = false;
  function openParent(opener) {
    if (pc.open) return;
    pcOpener = opener || null; S.pcAll = false; S.clearArm = false; renderParent();
    if (typeof pc.showModal === "function") pc.showModal(); else pc.setAttribute("open", "");
    var x = pc.querySelector(".pc-x"); if (x) x.focus();
  }
  function closeParent() { if (!pc.open) return; if (typeof pc.close === "function") pc.close(); else { pc.removeAttribute("open"); onParentClosed(); } }
  function onParentClosed() {
    S.clearArm = false;
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
  function focusKey(container) {
    var a = document.activeElement;
    if (!a || !container.contains(a) || !a.dataset || !a.dataset.act) return null;
    return [a.dataset.act, a.dataset.m || a.dataset.k || a.dataset.id || "", a.dataset.src || "", a.dataset.i || "", a.dataset.v || ""].join("|");
  }
  function refocus(container, key) {
    if (!key) return;
    var els = container.querySelectorAll("[data-act]");
    for (var i = 0; i < els.length; i++) {
      var e = els[i], d = e.dataset;
      if ([d.act, d.m || d.k || d.id || "", d.src || "", d.i || "", d.v || ""].join("|") === key && e.offsetParent !== null) { e.focus({ preventScroll: true }); return; }
    }
  }
  function render() {
    var full = S.mode === "dict" && D.phase !== "idle";
    document.body.classList.toggle("full", full);
    if (S.loading) { root.innerHTML = appbar() + '<main class="main"><p class="loading">Loading spelling lists…</p></main>'; return; }
    if (S.loadError) { root.innerHTML = appbar() + '<main class="main"><p class="banner">' + esc(S.loadError) + "</p></main>"; return; }
    var k = focusKey(root), L = curList(), v;
    if (S.mode === "learn") v = learnView(L);
    else if (S.mode === "dict") v = dictView(L);
    else v = trickyView();
    root.innerHTML = appbar() + '<main class="main">' + banner() + v + "</main>";
    refocus(root, k);
    if (pc.open) renderParent();
  }

  /* ---------- dictation ---------- */
  function startDict(words, src) {
    stopSpeech();
    D = { src: src, queue: shuffle(words.map(function (w) { return { hanzi: w.hanzi, pinyin: w.pinyin, english: w.english, pic: w.pic }; })), i: 0, phase: "run", marks: {}, saved: false };
    S.mode = "dict"; render(); sayCurrent();
  }
  function sayCurrent() {
    var t = ++TOKEN; var w = D.queue[D.i]; if (!w) return;
    wait(300).then(function () { if (t !== TOKEN) return; return speak(w.hanzi); })
      .then(function () { if (t !== TOKEN) return; return wait(1600); })
      .then(function () { if (t !== TOKEN) return; return speak(w.hanzi); });
  }
  function saveMarks() {
    var m = trickyMap();
    D.queue.forEach(function (w, i) {
      var v = D.marks[i]; if (!v) return;
      if (v === "no") { var o = m[w.hanzi] || { misses: 0, streak: 0 }; o.misses++; o.streak = 0; o.pinyin = w.pinyin; o.english = w.english; if (w.pic) o.pic = w.pic; m[w.hanzi] = o; }
      else if (m[w.hanzi]) { m[w.hanzi].streak = (m[w.hanzi].streak || 0) + 1; if (m[w.hanzi].streak >= 2) delete m[w.hanzi]; }
    });
    lsSet("tx-tricky", m); D.saved = true; render();
  }

  /* ---------- events ---------- */
  function wordFor(src, i) {
    if (src === "learn") { var L = curList(); return L && L.words[i]; }
    if (src === "tricky") return trickyArr()[i];
    if (src === "review") return D.queue[i];
  }
  var lastPointer = "mouse";
  var ACT = {
    pick: function (b) { stopSpeech(); S.cur = b.dataset.id; if (S.mode === "dict") D.phase = "idle"; closeParent(); render(); },
    mode: function (b) { stopSpeech(); S.mode = b.dataset.m; S.clearArm = false; if (S.mode === "dict" && D.phase !== "review") D.phase = "idle"; render(); },
    say: function (b) {
      var src = b.dataset.src, i = +b.dataset.i, w = wordFor(src, i); if (!w) return;
      var wasPlaying = S.playing; stopSpeech(); if (wasPlaying) render();
      var t = TOKEN; hl(src, i, true); speak(w.hanzi).then(function () { if (t === TOKEN) hl(src, i, false); });
    },
    playall: function () {
      if (S.playing) { stopSpeech(); render(); return; }
      var L = curList(); if (!L) return; stopSpeech(); var t = TOKEN; S.playing = true; render();
      (async function () {
        for (var i = 0; i < L.words.length; i++) {
          if (t !== TOKEN) return; hl("learn", i, true); await speak(L.words[i].hanzi); hl("learn", i, false);
          if (t !== TOKEN) return; await wait(900);
        }
        if (t === TOKEN) { S.playing = false; render(); }
      })();
    },
    pref: function (b) { var k = b.dataset.k; prefs[k] = !prefs[k]; lsSet("tx-prefs", prefs); applyTheme(); render(); },
    parent: function (b, e) {
      /* Keyboard (detail 0) and mouse open straight away; a short tap asks for a hold instead. */
      if (e.detail === 0 || lastPointer === "mouse") openParent(b);
      else if (!pc.open) nudge(b);
    },
    pcclose: closeParent,
    pcmore: function () { S.pcAll = true; renderParent(); var r = pc.querySelector('.pc-row[aria-pressed="true"]') || pc.querySelector(".pc-row"); if (r) r.focus(); },
    dstart: function () { var L = curList(); if (L) startDict(L.words, "list"); },
    tstart: function () { var a = trickyArr(); if (a.length) startDict(a, "tricky"); },
    again: function () { sayCurrent(); },
    next: function () { stopSpeech(); if (D.i < D.queue.length - 1) { D.i++; render(); sayCurrent(); } else { D.phase = "review"; render(); } },
    dstop: function () { stopSpeech(); var src = D.src; D.phase = "idle"; if (src === "tricky") S.mode = "tricky"; render(); },
    mark: function (b) { D.marks[+b.dataset.i] = b.dataset.v; render(); },
    savemarks: saveMarks,
    retest: function () { var miss = D.queue.filter(function (_, i) { return D.marks[i] === "no"; }); if (miss.length) startDict(miss, D.src); },
    tclear: function () { if (!S.clearArm) { S.clearArm = true; renderParent(); return; } S.clearArm = false; lsSet("tx-tricky", {}); render(); renderParent(); }
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b || !(root.contains(b) || pc.contains(b))) return;
    var a = b.dataset.act;
    if (a !== "tclear" && S.clearArm) { S.clearArm = false; if (pc.open && a !== "pick" && a !== "pcclose") renderParent(); }
    if (ACT[a]) { e.preventDefault(); ACT[a](b, e); }
  });

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
