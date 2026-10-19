const CACHE = "nce-vault-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/catalog.js",
  "./js/book.js",
  "./js/lrc.js",
  "./js/lessons.js",
  "./js/materials.js",
  "./js/vocab.js",
  "./js/player.js",
  "./js/path.js",
  "./js/shadow.js",
  "./data/path.json",
  "./data/catalog.json",
  "./data/vocab-nce1.json",
  "./data/vocab-nce2.json",
  "./data/vocab-nce3.json",
  "./data/vocab-nce4.json",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isRemoteLesson = url.hostname === "nce.mleo.site";
  const isRemoteBook =
    url.hostname === "raw.githubusercontent.com" &&
    url.pathname.includes("/lilinji/English/");
  const isSheetJs = url.hostname === "cdn.sheetjs.com";

  if (isRemoteLesson || isRemoteBook || isSheetJs) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        try {
          const res = await fetch(e.request);
          if (res && res.ok) cache.put(e.request, res.clone());
          return res;
        } catch {
          const cached = await cache.match(e.request);
          if (cached) return cached;
          throw new Error("offline");
        }
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
