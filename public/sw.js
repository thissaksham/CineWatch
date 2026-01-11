// Basic Service Worker for PWA installability
self.addEventListener('install', (event) => {
    console.log('SW installed');
});

self.addEventListener('activate', (event) => {
    console.log('SW activated');
});

self.addEventListener('fetch', (event) => {
    // Simple pass-through fetch listener
});
