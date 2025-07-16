// 간소화된 서비스 워커 - 모바일 최적화
const CACHE_NAME = 'sksiltron-v2';
const CACHE_EXPIRY = 12 * 60 * 60 * 1000; // 12시간 (모바일 메모리 절약)

// 캐시할 파일 패턴
const CACHEABLE_PATTERNS = [
  /\/contents\/.*\.(png|jpg|jpeg|gif|webp|bmp|webm|mp4)$/i,
  /\/contents\/.*\.json$/i
];

// 설치 이벤트
self.addEventListener('install', (event) => {
  console.log('서비스 워커 설치됨');
  self.skipWaiting();
});

// 활성화 이벤트
self.addEventListener('activate', (event) => {
  console.log('서비스 워커 활성화됨');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 네트워크 요청 가로채기 - 모바일 최적화
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 캐시 가능한 리소스인지 확인
  const shouldCache = CACHEABLE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (shouldCache) {
    event.respondWith(handleCacheableRequest(event.request));
  }
});

// 간소화된 캐시 처리
async function handleCacheableRequest(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    // 캐시된 응답이 있으면 바로 반환 (만료 체크 간소화)
    if (cachedResponse) {
      // 백그라운드에서 네트워크 요청으로 캐시 업데이트 (stale-while-revalidate)
      fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
      }).catch(() => {
        // 네트워크 실패는 무시
      });
      
      return cachedResponse;
    }
    
    // 캐시가 없으면 네트워크에서 가져오기
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // 캐시에 저장
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('요청 처리 실패:', request.url, error);
    
    // 최후의 수단으로 캐시에서 찾기
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}