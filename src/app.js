/* 听写 practice — static app. Data comes from data/lists.json (edit that file to add lists). */
(function () {
  "use strict";
  var root = document.getElementById("root");

  /* ---------- storage helpers (per device) ---------- */
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- state ---------- */
  var prefs = lsGet("tx-prefs", { slow: false, py: true, en: true });
  var S = { lists: [], cur: null, mode: "learn", playing: false, clearArm: false, loading: true, loadError: "" };
  var D = { src: "list", queue: [], i: 0, phase: "idle", marks: {}, saved: false };
  var TOKEN = 0;

  /* ---------- helpers ---------- */
  function sortLists(ls) { return ls.slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); }); }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function pickDefault() {
    var q = new URLSearchParams(location.search).get("list");
    if (q && S.lists.some(function (l) { return l.id === q; })) return q;
    if (!S.lists.length) return null;
    var t = todayStr();
    var up = S.lists.filter(function (l) { return l.date && l.date >= t; });
    return (up[0] || S.lists[S.lists.length - 1]).id;
  }
  function curList() { for (var i = 0; i < S.lists.length; i++) if (S.lists[i].id === S.cur) return S.lists[i]; return null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function parseDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function fmtDate(s) { var d = parseDate(s); return d ? d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : ""; }
  function whenTag(s) {
    var d = parseDate(s); if (!d) return "";
    var diff = Math.round((d - parseDate(todayStr())) / 86400000);
    if (diff === 0) return '<span class="when">Test today</span>';
    if (diff === 1) return '<span class="when">Test tomorrow</span>';
    if (diff > 1) return '<span class="when">In ' + diff + " days</span>";
    return '<span class="when past">Past list</span>';
  }
  function titleOf(l) { return "听写" + (l && l.number ? "（" + l.number + "）" : ""); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

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

  /* ---------- tricky words (this device only) ---------- */
  function trickyMap() { return lsGet("tx-tricky", {}); }
  function trickyArr() {
    var m = trickyMap();
    return Object.keys(m).map(function (k) { var o = m[k]; return { hanzi: k, pinyin: o.pinyin, english: o.english, misses: o.misses }; })
      .sort(function (a, b) { return b.misses - a.misses; });
  }

  /* ---------- views ---------- */
  function banner() {
    if (voiceState === "none") return '<p class="banner">This browser has no Chinese voice, so words can\'t be read aloud here. Try Microsoft Edge or Chrome, or open the link on a phone.</p>';
    if (voiceState === "other") return '<p class="banner">This browser only has a non-mainland Chinese voice, so the accent may differ slightly from school. Edge or Chrome usually have a mainland voice.</p>';
    return "";
  }
  function header(L) {
    if (!L) return '<header class="top"><h1 class="title">听写</h1></header>';
    return '<header class="top"><h1 class="title">' + esc(titleOf(L)) + '</h1><p class="date">' + (L.date ? "<b>" + esc(fmtDate(L.date)) + "</b>" + whenTag(L.date) : "") + "</p></header>";
  }
  function chips() {
    if (S.lists.length < 2) return "";
    var t = todayStr(), next = null;
    for (var k = 0; k < S.lists.length; k++) { if (S.lists[k].date && S.lists[k].date >= t) { next = S.lists[k].id; break; } }
    return '<p class="pick-label">Choose a list by test date</p><div class="chips" role="list">' + S.lists.map(function (l) {
      var d = parseDate(l.date); var ds = d ? d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" }) : "No date";
      var past = l.date && l.date < t;
      return '<button class="chip' + (past ? " past" : "") + '" role="listitem" data-act="pick" data-id="' + esc(l.id) + '" aria-pressed="' + (l.id === S.cur) + '"><span class="d">' + esc(ds) +
        (l.id === next ? '<span class="nx">Next</span>' : "") + '</span><span class="cn">' + esc(titleOf(l)) + "</span></button>";
    }).join("") + "</div>";
  }
  function howto() {
    var t = "";
    if (S.mode === "learn") t = curList() ? "Tap a word to hear it. Play all reads the whole list. Turn off Pinyin or English to check she can read the characters on her own." : "";
    else if (S.mode === "dict") {
      if (D.phase === "idle") t = "Like the real test: each word is read twice, in random order. She writes it on paper, then you check together at the end.";
      else if (D.phase === "run") t = "Listen, then write the word on paper. Tap Say again to repeat it, or Next word when she is ready.";
      else if (!D.saved) t = "Compare with her paper. Tap 🔊 to hear a word, mark each one ✓ or ✗, then tap Save marks.";
      else t = "Wrong words are saved to Tricky words. Retest just those now, or tap Done.";
    } else t = "Words she got wrong in Dictation, kept on this device only. Tap to hear, or practise them all. A word leaves after she gets it right twice in a row.";
    return t ? '<p class="howto">' + esc(t) + "</p>" : "";
  }
  function tabs() {
    var t = [["learn", "学习", "Learn"], ["dict", "听写", "Dictation"], ["tricky", "难词", "Tricky words"]];
    return '<nav class="tabs" role="tablist">' + t.map(function (x) {
      return '<button class="tab" role="tab" data-act="mode" data-m="' + x[0] + '" aria-selected="' + (S.mode === x[0]) + '"><span class="cn">' + x[1] + "</span>" + x[2] + "</button>";
    }).join("") + "</nav>";
  }
  function boxes(text, cls, empty) {
    var chars = Array.from(text || ""); var n = chars.length;
    var lc = n >= 5 ? "l5" : n >= 3 ? "l" + n : "";
    return '<span class="boxes ' + (cls || lc) + '">' + chars.map(function (c) { return '<span class="tzg"><span>' + (empty ? "" : esc(c)) + "</span></span>"; }).join("") + "</span>";
  }
  function card(w, i, src, extra) {
    return '<button class="word" data-act="say" data-src="' + src + '" data-i="' + i + '" aria-label="Hear ' + esc(w.hanzi) + '">' + boxes(w.hanzi) +
      (prefs.py && w.pinyin ? '<span class="py">' + esc(w.pinyin) + "</span>" : "") +
      (prefs.en && w.english ? '<span class="en">' + esc(w.english) + "</span>" : "") + (extra || "") + "</button>";
  }
  function slowToggle() { return '<button class="tog" data-act="slow" aria-pressed="' + !!prefs.slow + '">Slow</button>'; }
  function toggles() {
    return slowToggle() +
      '<button class="tog" data-act="py" aria-pressed="' + !!prefs.py + '">Pinyin</button>' +
      '<button class="tog" data-act="en" aria-pressed="' + !!prefs.en + '">English</button>';
  }
  function learnView(L) {
    if (!L) return '<div class="panel"><p>No spelling lists have been added yet.</p></div>';
    return '<div class="controls"><button class="btn primary" data-act="playall">' + (S.playing ? "Stop" : "Play all") + "</button>" + toggles() + "</div>" +
      '<div class="grid">' + L.words.map(function (w, i) { return card(w, i, "learn"); }).join("") + "</div>";
  }
  function dictView(L) {
    if (D.phase === "idle") {
      if (!L) return '<div class="panel"><p>No list to practise yet.</p></div>';
      return '<div class="panel"><p class="count">' + esc(titleOf(L)) + "</p>" +
        '<div class="row"><button class="btn primary" data-act="dstart">Start dictation (' + L.words.length + " words)</button></div><div class=\"row\">" + slowToggle() + "</div></div>";
    }
    if (D.phase === "run") {
      var w = D.queue[D.i], n = D.queue.length, last = D.i === n - 1;
      var dots = ""; for (var k = 0; k < n; k++) dots += '<span class="' + (k <= D.i ? "on" : "") + '"></span>';
      return '<div class="panel"><p class="count">Word ' + (D.i + 1) + " of " + n + '</p><div class="dots">' + dots + "</div>" + boxes(w.hanzi, "big", true) +
        '<div class="row"><button class="btn" data-act="again">Say again</button>' +
        '<button class="btn primary" data-act="next">' + (last ? "Finish and check" : "Next word") + '</button></div><div class="row"><button class="link" data-act="dstop">Stop dictation</button></div></div>';
    }
    var rows = D.queue.map(function (w, i) {
      var m = D.marks[i];
      var marks = D.saved
        ? (m === "ok" ? '<span class="r-ok">✓</span>' : m === "no" ? '<span class="r-no">✗</span>' : "")
        : '<button class="mk ok" data-act="mark" data-i="' + i + '" data-v="ok" aria-pressed="' + (m === "ok") + '" aria-label="Correct">✓</button>' +
          '<button class="mk no" data-act="mark" data-i="' + i + '" data-v="no" aria-pressed="' + (m === "no") + '" aria-label="Wrong">✗</button>';
      return '<div class="rrow"><button class="mini" data-act="say" data-src="review" data-i="' + i + '" aria-label="Hear ' + esc(w.hanzi) + '">🔊</button><span class="rz">' +
        esc(w.hanzi) + '</span><span class="rp">' + esc(w.pinyin || "") + "</span>" + marks + "</div>";
    }).join("");
    if (!D.saved) {
      return '<div class="panel"><p class="count">Check her answers</p><div class="review">' + rows + "</div>" +
        '<div class="row"><button class="btn primary" data-act="savemarks">Save marks</button><button class="link" data-act="dstop">Skip</button></div></div>';
    }
    var right = 0, wrong = 0;
    D.queue.forEach(function (_, i) { if (D.marks[i] === "ok") right++; else if (D.marks[i] === "no") wrong++; });
    return '<div class="panel"><p class="score">' + right + " / " + D.queue.length + '</p><p class="muted">' + (wrong ? wrong + " to practise again." : "All correct. Well done!") + "</p>" +
      '<div class="review">' + rows + '</div><div class="row">' + (wrong ? '<button class="btn primary" data-act="retest">Retest the ' + wrong + " missed</button>" : "") +
      '<button class="btn" data-act="dstop">Done</button></div></div>';
  }
  function trickyView() {
    var arr = trickyArr();
    if (!arr.length) return '<div class="panel"><p class="count">No tricky words yet</p><p class="muted">Words she gets wrong in Dictation show up here for extra practice.</p></div>';
    return '<div class="controls"><button class="btn primary" data-act="tstart">Practise these in dictation</button>' + toggles() + "</div>" +
      '<div class="grid">' + arr.map(function (w, i) { return card(w, i, "tricky", '<span class="miss">Missed ' + w.misses + "×</span>"); }).join("") + "</div>" +
      '<div class="row"><button class="link" data-act="tclear">' + (S.clearArm ? "Tap again to clear the list" : "Clear tricky words") + "</button></div>";
  }
  function render() {
    if (S.loading) { root.innerHTML = '<p class="loading">Loading spelling lists…</p>'; return; }
    if (S.loadError) { root.innerHTML = '<p class="banner">' + esc(S.loadError) + "</p>"; return; }
    var L = curList();
    var h = banner() + header(L) + chips() + tabs() + howto();
    if (S.mode === "learn") h += learnView(L);
    else if (S.mode === "dict") h += dictView(L);
    else h += trickyView();
    root.innerHTML = h;
    var bar = root.querySelector(".chips"), ac = root.querySelector('.chip[aria-pressed="true"]');
    if (bar && ac) bar.scrollLeft = Math.max(0, ac.offsetLeft - bar.offsetLeft - 16);
  }

  /* ---------- dictation ---------- */
  function startDict(words, src) {
    stopSpeech();
    D = { src: src, queue: shuffle(words.map(function (w) { return { hanzi: w.hanzi, pinyin: w.pinyin, english: w.english }; })), i: 0, phase: "run", marks: {}, saved: false };
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
      if (v === "no") { var o = m[w.hanzi] || { misses: 0, streak: 0 }; o.misses++; o.streak = 0; o.pinyin = w.pinyin; o.english = w.english; m[w.hanzi] = o; }
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
  var ACT = {
    pick: function (b) { stopSpeech(); S.cur = b.dataset.id; if (S.mode === "dict") D.phase = "idle"; render(); },
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
    slow: function () { prefs.slow = !prefs.slow; lsSet("tx-prefs", prefs); render(); },
    py: function () { prefs.py = !prefs.py; lsSet("tx-prefs", prefs); render(); },
    en: function () { prefs.en = !prefs.en; lsSet("tx-prefs", prefs); render(); },
    dstart: function () { var L = curList(); if (L) startDict(L.words, "list"); },
    tstart: function () { var a = trickyArr(); if (a.length) startDict(a, "tricky"); },
    again: function () { sayCurrent(); },
    next: function () { stopSpeech(); if (D.i < D.queue.length - 1) { D.i++; render(); sayCurrent(); } else { D.phase = "review"; render(); } },
    dstop: function () { stopSpeech(); var src = D.src; D.phase = "idle"; if (src === "tricky") S.mode = "tricky"; render(); },
    mark: function (b) { D.marks[+b.dataset.i] = b.dataset.v; render(); },
    savemarks: saveMarks,
    retest: function () { var miss = D.queue.filter(function (_, i) { return D.marks[i] === "no"; }); if (miss.length) startDict(miss, D.src); },
    tclear: function () { if (!S.clearArm) { S.clearArm = true; render(); return; } S.clearArm = false; lsSet("tx-tricky", {}); render(); }
  };
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var a = b.dataset.act;
    if (a !== "tclear" && S.clearArm) S.clearArm = false;
    if (ACT[a]) { e.preventDefault(); ACT[a](b, e); }
  });

  /* ---------- load data ---------- */
  render();
  fetch("data/lists.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { S.lists = sortLists((d && d.lists) || []); S.cur = pickDefault(); S.loading = false; render(); })
    .catch(function () { S.loading = false; S.loadError = "The spelling lists couldn't be loaded. Check your connection and refresh the page."; render(); });
})();
