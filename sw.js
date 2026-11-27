/* Tarot Sanctuary — Service Worker (offline cache)
   ใช้ได้เฉพาะเมื่อเปิดผ่าน http/https เท่านั้น (file:// ไม่รองรับ service worker) */

const CACHE_VERSION = "tarot-v24";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=3.2",
  "./cards-data.js?v=1.4",
  "./promptpay.js?v=1.4",
  "./app.js?v=3.4",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./og-cover.jpg",
  "./truemoney-qr.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // ปล่อยฟอนต์/รูปจากโดเมนอื่นให้เบราว์เซอร์จัดการตามปกติ
  if (url.origin !== self.location.origin) return;

  // หน้าเว็บ: ลองเน็ตก่อน ถ้าออฟไลน์ค่อยใช้แคช
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // ไฟล์คงที่: แคชก่อน แล้วอัปเดตเบื้องหลัง
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
