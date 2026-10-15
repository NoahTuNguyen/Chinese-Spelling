/* Pinyin test page: renders every pinyin string twice (UI font vs --font-pinyin) so tone marks can be
   checked by eye in Chrome, Safari, etc. Developer tool only; not linked from the app. */
(function () {
  "use strict";
  var out = document.getElementById("pv");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function row(src, text, weight) {
    var bad = text.normalize("NFC") !== text || /[̀-ͯ]/.test(text);
    var w = " w" + (weight || 600);
    return '<div class="pv-row' + (bad ? " bad" : "") + '"><span class="pv-src">' + esc(src) + (bad ? " · not NFC" : "") + "</span>" +
      '<span class="pv-ui' + w + '">' + esc(text) + '</span><span class="pv-py' + w + '">' + esc(text) + "</span></div>";
  }
  function section(title, rows) { return '<section class="pv-sec"><h2>' + esc(title) + "</h2>" + rows.join("") + "</section>"; }
  var sampler = "ā á ǎ à  ē é ě è  ī í ǐ ì  ō ó ǒ ò  ū ú ǔ ù  ǖ ǘ ǚ ǜ ü — tiān kōng jiā shū chū xīng";
  Promise.all([
    fetch("../data/stories.json", { cache: "no-cache" }).then(function (r) { return r.json(); }),
    fetch("../data/lists.json", { cache: "no-cache" }).then(function (r) { return r.json(); })
  ]).then(function (res) {
    var stories = res[0] || {}, lists = (res[1] && res[1].lists) || [], html = [];
    html.push(section("Tone marks, each weight", [500, 600, 700, 800].map(function (w) { return row("weight " + w, sampler, w); })));
    Object.keys(stories).forEach(function (id) {
      var st = stories[id], rows = [row(id + " · title", st.titlePinyin || "", 700)];
      (st.sentences || []).forEach(function (s, k) { rows.push(row(id + " · sentence " + (k + 1), s.py || "")); });
      html.push(section("Story " + id + " · " + (st.title || ""), rows));
    });
    lists.forEach(function (l) {
      var rows = [];
      l.words.forEach(function (w) { rows.push(row(l.id + " · " + w.hanzi, w.pinyin || "", 800)); if (w.sentencePinyin) rows.push(row(l.id + " · " + w.hanzi + " sentence", w.sentencePinyin)); });
      html.push(section("List " + l.id + " · 听写（" + l.number + "）", rows));
    });
    out.innerHTML = html.join("");
  }).catch(function (e) { out.textContent = "Couldn't load the data: " + e; });
})();
