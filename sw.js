// Choose a cache name
const cacheName = "cache-v1";

// List the files to precache
const precacheResources = [
  "./index.html",
  "./index.css",
  "./dist/index.js",
  "./pages/export.html",
  "./pages/import.html",
  "./pages/describe.html",
];

// When the service worker is installing, open the cache and add the precache resources to it
self.addEventListener("install", (event) => {
  console.log("Service worker install event!");
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(precacheResources))
  );
});

self.addEventListener("activate", (event) => {
  console.log("Service worker activate event!");
});

self.addEventListener("fetch", async (event) => {
  console.log("Fetch intercepted for:", event.request.url);
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log("Found in cache:", event.request.url);
        updateCache(cachedResponse, event);
        return cachedResponse;
      }
      return updateCache(cachedResponse, event);
    })
  );
});

function updateCache(cachedResponse, event) {
  cachedResponse = fetch(event.request).then((response) => {
    const foo = response.clone();
    if (response.ok) {
      caches.open(cacheName).then((cache) => {
        cache.put(event.request, foo);
        console.log("Cache updated:", event.request.url);
      });
    }
    return response;
  });
  return cachedResponse;
}
