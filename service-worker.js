/**
 * 408 考研复习助手 — Service Worker
 * 实现离线缓存，让 PWA 在断网时也能正常打开
 */

// 缓存版本号，更新文件后修改此版本即可刷新缓存
const CACHE_VERSION = 'v1.2.1';
const CACHE_NAME = `kr-408-${CACHE_VERSION}`;

// 需要预缓存的所有静态文件
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/storage.js',
  './js/sm2.js',
  './js/mindmap.js',
  './js/app.js',
  './manifest.json',
  './icon.svg'
];

/**
 * install 事件：预缓存所有静态文件
 * 使用 waitUntil 确保缓存完成后再激活
 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] 正在缓存静态文件...');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      console.log('[SW] 预缓存完成，跳过等待激活');
      return self.skipWaiting();
    })
  );
});

/**
 * activate 事件：清理旧版本缓存
 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('kr-408-') && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] 删除旧缓存：', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

/**
 * fetch 事件：Cache-First 策略
 * 有缓存直接返回（快速），没有则请求网络并缓存（降级）
 */
self.addEventListener('fetch', event => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // 命中缓存，直接返回
        return cachedResponse;
      }

      // 未命中缓存，请求网络
      return fetch(event.request).then(response => {
        // 只缓存成功的响应
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // 克隆响应（响应流只能消费一次）
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // 网络失败且无缓存，对于 HTML 请求返回缓存中的首页
        // 对于其他资源则直接失败
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
