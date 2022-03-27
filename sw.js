self.addEventListener("fetch", function(event) {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open("wirt").then(cache => {
      return cache.addAll([
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
      ]);
    })
  );
});
