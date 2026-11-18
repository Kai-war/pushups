// Offline support for the pushup tracker page. Keep this file in the same folder.
// Needs the page to be opened once over HTTPS. After that the app opens from
// the phone's saved copy, with or without a connection.
const CACHE = "pushups-v2";
const SCOPE = self.registration.scope;
const PAGES = [SCOPE, SCOPE + "index.html", SCOPE + "pushup-tracker.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PAGES.map((u) =>
        fetch(new Request(u, { cache: "reload" }))
          .then((res) => (res.ok ? c.put(u, res) : null))
          .catch(() => null)))) // the page also saves itself after it loads
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pushups-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function savedPage(req) {
  return caches.open(CACHE).then((c) =>
    c.match(req, { ignoreSearch: true })
      .then((r) => r || PAGES.reduce((p, u) => p.then((hit) => hit || c.match(u, { ignoreSearch: true })), Promise.resolve()))
      .then((r) => r || c.keys().then((ks) => (ks.length ? c.match(ks[0]) : undefined)))
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode !== "navigate" && !PAGES.includes(req.url.split("?")[0])) return;

  // Saved copy first, so the app opens instantly and offline.
  // When online, quietly fetch a fresh copy for next time.
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })
    .catch(() => undefined);
  e.waitUntil(fresh);

  e.respondWith(
    savedPage(req).then((saved) => {
      if (saved) return saved;
      return fresh.then((res) => res || new Response("Offline and not saved yet. Open the app once with a connection.", {
        status: 503, headers: { "Content-Type": "text/plain" }
      }));
    })
  );
});
