/* TEMPORARY service worker: GitHub Pages sends every file with a fixed 10-minute cache
   (Cache-Control: max-age=600), so phones could show an old version after a deploy.
   This worker fetches same-site files fresh from the network every time ("network first",
   cache: "no-store"). It keeps the last good copy only as an offline fallback.
   To remove it, see "Service worker (temporary)" in CLAUDE.md: ship the self-unregistering
   version of this file first, then delete the registration in app.js. */
var OFFLINE = "tx-offline-v1";

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", function (e) {
  var req = e.request;
  /* Only same-site GETs; Google Fonts and anything else go straight to the network as usual. */
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-store" })
      .then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(OFFLINE).then(function (c) { return c.put(req, copy); }).catch(function () {});
        }
        return res;
      })
      .catch(function () {
        /* Offline: last good copy (for a page load, fall back to the cached start page). */
        return caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(function (r) {
          if (r) return r;
          if (req.mode !== "navigate") return Response.error();
          return caches.match("./").then(function (p) { return p || Response.error(); });
        });
      })
  );
});
