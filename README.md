# SK Siltron Media Viewer

SK Siltron의 미디어 콘텐츠(이미지, 비디오)와 퀴즈를 순서대로 보여주는 웹 애플리케이션입니다.

## 프로젝트 구조

```
sksiltron/
├── backend/          # FastAPI 백엔드
│   ├── main.py
│   ├── requirements.txt
│   ├── railway.toml
│   └── contents/     # 미디어 파일들
├── frontend/         # React 프론트엔드
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vercel.json
└── README.md
```

## 기능

- 이미지/비디오 슬라이드쇼
- 스와이프/키보드 네비게이션
- 퀴즈 시스템
- 순서 관리 (order.json)
- 퀴즈 결과 저장

## 로컬 개발 환경 설정

### 백엔드 (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 프론트엔드 (React)

```bash
cd frontend
npm install
npm start
```

## 배포 가이드

### 1. Railway (백엔드 배포)

1. **Railway 계정 생성**: https://railway.app
2. **새 프로젝트 생성** → "Deploy from GitHub repo" 선택
3. **저장소 연결** → GitHub에서 이 프로젝트 선택
4. **루트 디렉토리 설정**:
   - Settings → General → Root Directory: `backend`
5. **환경변수 설정** (Variables 탭):
   ```bash
   ENV=production
   ALLOWED_ORIGINS=https://localhost:3000
   ```
   ⚠️ 나중에 Vercel URL로 업데이트 필요
6. **배포 확인**: 자동으로 빌드 및 배포 시작
7. **URL 확인**: Deployments 탭에서 Railway URL 복사

**Railway 설정 체크리스트:**
- [x] railway.toml 파일 존재
- [x] requirements.txt 최적화 완료
- [x] 환경변수 `ENV`, `ALLOWED_ORIGINS` 설정
- [x] Health check 엔드포인트 `/health` 구현
- [x] CORS 보안 설정 완료

### 2. Vercel (프론트엔드 배포)

1. **Vercel 계정 생성**: https://vercel.com
2. **새 프로젝트 생성** → "Import Git Repository" 선택
3. **저장소 연결** → GitHub에서 이 프로젝트 선택
4. **프로젝트 설정**:
   - Framework Preset: `Create React App`
   - Root Directory: `frontend`
   - Build Command: 자동 감지됨 (`npm run build`)
   - Output Directory: 자동 감지됨 (`build`)
5. **환경변수 설정** (Environment Variables):
   ```bash
   REACT_APP_API_URL=https://your-railway-url.railway.app
   ```
   ⚠️ Railway에서 받은 실제 URL로 교체
6. **배포 확인**: Deploy 버튼 클릭
7. **URL 확인**: 배포 완료 후 Vercel URL 복사

**Vercel 설정 체크리스트:**
- [x] vercel.json 설정 파일 존재
- [x] package.json 파일 존재  
- [x] 환경변수 `REACT_APP_API_URL` 설정
- [x] SPA 라우팅 설정 완료
- [x] 캐시 최적화 설정 완료

### 3. 배포 순서 (중요!)

1. **1단계: 백엔드 배포** (Railway)
   ```bash
   # 임시 CORS 설정으로 먼저 배포
   ENV=production
   ALLOWED_ORIGINS=https://localhost:3000
   ```
   ✅ Railway URL 확인: `https://your-project-name.railway.app`

2. **2단계: 프론트엔드 배포** (Vercel)
   ```bash
   # Railway URL을 환경변수로 설정
   REACT_APP_API_URL=https://your-project-name.railway.app
   ```
   ✅ Vercel URL 확인: `https://your-project-name.vercel.app`

3. **3단계: 백엔드 CORS 업데이트** (Railway)
   ```bash
   # Railway 환경변수 업데이트
   ENV=production
   ALLOWED_ORIGINS=https://your-project-name.vercel.app
   ```
   ✅ 재배포 자동 실행

### 4. 최종 환경변수 설정

**Railway (백엔드):**
```bash
ENV=production
ALLOWED_ORIGINS=https://sksiltron-frontend.vercel.app
```

**Vercel (프론트엔드):**
```bash
REACT_APP_API_URL=https://sksiltron-backend.railway.app
```

## 미디어 파일 관리

- `backend/contents/` 폴더에 이미지, 비디오 파일 업로드
- `order.json` 파일로 표시 순서 관리
- 지원 형식: PNG, JPG, GIF, MP4, WebM 등

## API 엔드포인트

- `GET /` - API 상태 확인
- `GET /health` - 헬스 체크
- `GET /api/files` - 파일 목록 조회
- `GET /api/file/{filename}` - 특정 파일 조회
- `POST /api/save-quiz-answer` - 퀴즈 답변 저장
- `GET /api/quiz-results` - 퀴즈 결과 조회

## 문제 해결

### ❌ CORS 오류 발생 시
```
Access to XMLHttpRequest at 'https://...' from origin 'https://...' has been blocked by CORS policy
```
**해결방법:**
- Railway → Settings → Variables에서 `ALLOWED_ORIGINS` 정확히 설정
- Vercel URL 끝에 `/` 없이 입력: `https://app-name.vercel.app`
- 환경변수 변경 후 Railway 자동 재배포 대기

### ❌ API 연결 실패 시
```
Network Error: Failed to fetch
```
**해결방법:**
1. Railway 백엔드 상태 확인: `https://your-app.railway.app/health`
2. Vercel 환경변수 `REACT_APP_API_URL` 정확히 설정
3. Railway URL 끝에 `/` 없이 입력: `https://app-name.railway.app`

### ❌ 동영상/이미지 로딩 실패 시
**해결방법:**
- Railway 배포 시 `contents/` 폴더 포함 확인
- 파일 크기 제한 확인 (Railway: 500MB, 개별 파일: 100MB 권장)
- 파일명에 특수문자나 공백 없는지 확인

### ⚡ 배포 상태 확인 방법

**Railway 백엔드 확인:**
```bash
curl https://your-app.railway.app/health
# 응답: {"status":"healthy","timestamp":"..."}
```

**Vercel 프론트엔드 확인:**
- 브라우저에서 직접 접속
- 개발자 도구 → Network 탭에서 API 호출 확인 