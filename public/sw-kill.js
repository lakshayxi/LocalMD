/**
 * Emergency service-worker kill switch.
 *
 * This file is inert in normal builds. To retire a broken worker, deploy this
 * exact content at /sw.js. Existing installations will fetch it from the same
 * registration URL, activate it immediately, remove LocalMD caches, and then
 * unregister themselves.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((name) => name === 'localmd-assets' || name.startsWith('workbox-precache'))
              .map((name) => caches.delete(name)),
          ),
        ),
    ]),
  );
});
