// 서비스 워커 - 이미지 캐싱 최적화
const CACHE_NAME = 'sksiltron-images-v1';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24시간

// 캐시할 파일 패턴
const CACHEABLE_PATTERNS = [
  /\/contents\/.*\.(png|jpg|jpeg|gif|webp|bmp)$/i,
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
            console.log('이전 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 네트워크 요청 가로채기
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 캐시 가능한 리소스인지 확인
  const shouldCache = CACHEABLE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (shouldCache) {
    event.respondWith(handleCacheableRequest(event.request));
  }
});

// 캐시 가능한 요청 처리
async function handleCacheableRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // 캐시된 응답이 있고 만료되지 않았다면 반환
  if (cachedResponse) {
    const cachedDate = new Date(cachedResponse.headers.get('sw-cached-date'));
    const now = new Date();
    
    if (now - cachedDate < CACHE_EXPIRY) {
      console.log('캐시에서 반환:', request.url);
      return cachedResponse;
    } else {
      // 만료된 캐시 삭제
      await cache.delete(request);
    }
  }
  
  try {
    // 네트워크에서 가져오기
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // 응답 복사 (스트림은 한 번만 읽을 수 있음)
      const responseToCache = networkResponse.clone();
      
      // 캐시 날짜 헤더 추가
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-date', new Date().toISOString());
      
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });
      
      // 캐시에 저장
      cache.put(request, modifiedResponse);
      console.log('네트워크에서 가져와서 캐시에 저장:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('네트워크 요청 실패:', request.url, error);
    
    // 네트워크 실패 시 만료된 캐시라도 반환
    if (cachedResponse) {
      console.log('네트워크 실패, 만료된 캐시 반환:', request.url);
      return cachedResponse;
    }
    
    throw error;
  }
}

// 메시지 이벤트 (프리로딩 요청 처리)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRELOAD_IMAGES') {
    preloadImages(event.data.urls);
  }
});

// 이미지 프리로딩
async function preloadImages(urls) {
  const cache = await caches.open(CACHE_NAME);
  
  const preloadPromises = urls.map(async (url) => {
    try {
      const cachedResponse = await cache.match(url);
      
      if (!cachedResponse) {
        const response = await fetch(url);
        if (response.ok) {
          const headers = new Headers(response.headers);
          headers.set('sw-cached-date', new Date().toISOString());
          
          const modifiedResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: headers
          });
          
          await cache.put(url, modifiedResponse);
          console.log('프리로드 완료:', url);
        }
      }
    } catch (error) {
      console.warn('프리로드 실패:', url, error);
    }
  });
  
  await Promise.allSettled(preloadPromises);
}