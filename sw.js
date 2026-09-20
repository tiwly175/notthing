/* Service Worker — cache-first สำหรับไฟล์นิ่ง, network-first สำหรับหน้าเว็บ, รองรับ Range (วิดีโอ/เพลง) */
const CACHE = 'link-space-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './bg-video.mp4',
  './Oasis_-_Champagne_Supernova.mp3',
  './gta-sa.jpg',
  './rov.jpg',
  './minecraft.jpg',
  './rdr.jpg',
  './onepiece.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(ASSETS.map(url => c.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

/* ตอบ request แบบ Range (เบราว์เซอร์ใช้กับ <video>/<audio>) จากไฟล์ใน cache */
async function rangeResponse(req, cached) {
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const size = buf.byteLength;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // ปล่อยให้เบราว์เซอร์โหลดเอง (เช่น ลิงก์เพลงจากเน็ต, ฟอนต์)

  // หน้าเว็บ: ลองเน็ตก่อน จะได้เห็นไฟล์ที่แก้ล่าสุดเสมอ ถ้าออฟไลน์ค่อยใช้ cache
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', clone)); }
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ไฟล์อื่น: cache-first
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      return req.headers.has('range') ? rangeResponse(req, cached) : cached;
    }
    try {
      const res = await fetch(req);
      // เก็บเฉพาะ 200 เต็มไฟล์ (ไม่เก็บ 206 partial)
      if (res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
      }
      return res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
