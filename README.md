# SK Siltron 가상 투어

React 기반 인터랙티브 미디어 뷰어입니다.

## 프로젝트 구조

```
sksiltron/
├── frontend/         # React 애플리케이션
│   ├── src/
│   ├── public/
│   │   └── contents/ # 미디어 파일들
│   ├── package.json
│   └── vercel.json
└── README.md
```

## 기능

- 이미지/비디오 슬라이드쇼
- 스와이프/키보드 네비게이션
- 인터랙티브 선택지 시스템
- 순서 관리 (order.json)
- 로컬 스토리지 기반 결과 저장

## 로컬 개발

```bash
cd frontend
npm install
npm start
```

## 배포 (Vercel)

1. **Vercel 계정 생성**: https://vercel.com
2. **새 프로젝트 생성** → "Import Git Repository" 선택
3. **저장소 연결** → GitHub에서 이 프로젝트 선택
4. **프로젝트 설정**:
   - Framework Preset: `Create React App`
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `build`
5. **배포 확인**: Deploy 버튼 클릭

## 미디어 파일 관리

- `frontend/public/contents/` 폴더에 이미지, 비디오 파일 업로드
- `order.json` 파일로 표시 순서 관리
- 지원 형식: PNG, JPG, GIF, MP4, WebM 등 