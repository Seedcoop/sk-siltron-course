# SK Siltron Media Viewer - Backend

FastAPI 백엔드 서버입니다.

## 환경변수 설정

Railway 배포 시 다음 환경변수를 설정하세요:

```bash
# 환경 설정
ENV=production

# CORS 허용 도메인 (쉼표로 구분)
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,https://your-custom-domain.com
```

## 로컬 개발 실행

```bash
# 가상환경 생성 및 활성화
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 서버 실행
uvicorn main:app --reload --port 8000
```

## Railway 배포

1. Railway 프로젝트 생성
2. GitHub 연결
3. 루트 디렉토리를 `backend`로 설정
4. 환경변수 설정
5. 자동 배포 확인

Health check endpoint: `/health` 