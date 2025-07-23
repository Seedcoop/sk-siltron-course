import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// 커스텀 메트릭
export let errorRate = new Rate('errors');

export let options = {
  stages: [
    // 워밍업: 30초간 10명까지
    { duration: '30s', target: 10 },
    // 점진적 증가: 60초간 50명까지  
    { duration: '60s', target: 50 },
    // 목표 부하: 120초간 150명 유지
    { duration: '120s', target: 150 },
    // 스파이크: 30초간 300명
    { duration: '30s', target: 300 },
    // 쿨다운: 30초간 감소
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95%가 3초 이내
    http_req_failed: ['rate<0.05'],    // 에러율 5% 이하
    errors: ['rate<0.05'],
  },
};

const BASE_URL = 'https://your-vercel-app.vercel.app'; // 실제 URL로 변경

export default function() {
  // 메인 페이지 로드
  let response = http.get(BASE_URL);
  let success = check(response, {
    'main page status is 200': (r) => r.status === 200,
    'main page response time < 2s': (r) => r.timings.duration < 2000,
  });
  errorRate.add(!success);
  
  sleep(Math.random() * 2 + 1); // 1-3초 대기
  
  // order.json 로드
  response = http.get(`${BASE_URL}/contents/order.json`);
  success = check(response, {
    'order.json status is 200': (r) => r.status === 200,
    'order.json is valid JSON': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    },
  });
  errorRate.add(!success);
  
  sleep(Math.random() * 3 + 2); // 2-5초 대기
  
  // 랜덤 이미지 로드
  const imageNum = Math.floor(Math.random() * 9);
  response = http.get(`${BASE_URL}/contents/${imageNum}.png`);
  success = check(response, {
    'image status is 200': (r) => r.status === 200,
    'image response time < 3s': (r) => r.timings.duration < 3000,
  });
  errorRate.add(!success);
  
  sleep(Math.random() * 5 + 3); // 3-8초 대기 (사용자 상호작용)
}