/*
 * Caches the app shell so the phone opens instantly at the gate, even with no
 * signal. Data is NOT cached here - Firestore has its own offline store and
 * write queue, and two caching layers over the same data is how you end up
 * showing an arrival that was already dealt with an hour ago.
 */
const SHELL = "reception-shell-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/index.html", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Never intercept Firestore/Auth - they must reach the network or fail on
  // their own terms so the SDK's retry and offline logic stays in charge.
  if (/googleapis|firebaseio|firebaseapp|gstatic/.test(req.url)) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => hit)));
});