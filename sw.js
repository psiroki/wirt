const cacheName = "wirt-v1";
const files = [
  "/wirt/",
  "/wirt/?source=pwa",
  "/wirt/crc32.js",
  "/wirt/drop.js",
  "/wirt/exif.js",
  "/wirt/exifWorker.js",
  "/wirt/imageBoom.js",
  "/wirt/maskSpinner.svg",
  "/wirt/solo_jazz_lo.png",
  "/wirt/manifest.json",
  "/wirt/icon-192.png",
  "/wirt/icon-512.png",
];

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(cacheName).then(cache => {
      return cache.addAll(files);
    })
  );
});
