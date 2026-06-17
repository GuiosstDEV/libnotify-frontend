// ================================
// 📱 Service Worker - LibNotify
// ================================

const CACHE_NAME = 'libnotify-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './manifest.json',
  './src/css/index.css',
  './src/js/index.js',
  './assets/imagem/libnotify-icon.png'
];

// ================================
// 1️⃣ INSTALL - Cache assets
// ================================
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Cacheando assets estáticos');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('⚠️ Erro ao cachear alguns assets:', err);
        // Continua mesmo se alguns assets falharem
        return Promise.resolve();
      });
    })
  );
  
  self.skipWaiting(); // Ativa a nova versão imediatamente
});

// ================================
// 2️⃣ ACTIVATE - Limpar caches antigos
// ================================
self.addEventListener('activate', (event) => {
  console.log('✨ Service Worker: Ativando...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`🗑️ Deletando cache antigo: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  self.clients.claim(); // Toma controle imediatamente
});

// ================================
// 3️⃣ FETCH - Estratégia Network First
// ================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar requisições não-GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignorar requisições para domínios externos (Firebase, etc)
  if (url.hostname !== self.location.hostname) {
    // Tenta network, fallback para cache
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }
  
  // Para arquivos locais: tenta network, fallback para cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Se sucesso, cachear e retornar
        if (response.ok) {
          // Clonar ANTES de usar a response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Se falhar, tenta cache
        return caches.match(request).then((cached) => {
          if (cached) {
            console.log(`📦 Servindo do cache: ${url.pathname}`);
            return cached;
          }
          
          // Se não estiver cachado, retorna página offline
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
          
          return new Response('Offline - recurso não disponível', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
  );
});

// ================================
// 4️⃣ MESSAGE - Comunicação com cliente
// ================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('⏩ Pulando espera e ativando novo Service Worker');
    self.skipWaiting();
  }
});

console.log('✅ Service Worker registrado');
