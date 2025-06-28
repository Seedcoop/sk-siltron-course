# SK Siltron Media Viewer - Frontend

React 프론트엔드 애플리케이션입니다.

## 환경변수 설정

Vercel 배포 시 다음 환경변수를 설정하세요:

```bash
# 백엔드 API URL
REACT_APP_API_URL=https://your-railway-backend.railway.app
```

## 로컬 개발 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm start
```

## Vercel 배포

1. Vercel 프로젝트 생성
2. GitHub 연결
3. 루트 디렉토리를 `frontend`로 설정
4. Framework Preset: Create React App
5. 환경변수 `REACT_APP_API_URL` 설정
6. 자동 배포 확인

## 빌드

```bash
npm run build
```

빌드된 파일은 `build/` 폴더에 생성됩니다. 