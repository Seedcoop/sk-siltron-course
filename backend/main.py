from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response
import os
import json
from pathlib import Path
from typing import List
from datetime import datetime
import hashlib

app = FastAPI()

# Gzip 압축 미들웨어 추가 (로딩 속도 30-50% 향상)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# 환경변수에서 허용할 origins 가져오기
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

# CORS 설정 (프로덕션 환경 대응)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# contents 폴더가 존재하는지 확인
CONTENTS_DIR = Path("contents")
if not CONTENTS_DIR.exists():
    CONTENTS_DIR.mkdir()

# 캐시 최적화된 정적 파일 서빙
@app.get("/static/{file_path:path}")
async def serve_static_optimized(file_path: str):
    """최적화된 정적 파일 서빙 (캐시 헤더 + ETag)"""
    file_full_path = CONTENTS_DIR / file_path
    
    if not file_full_path.exists() or not file_full_path.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    # 파일 해시로 ETag 생성 (캐시 효율성 향상)
    file_stats = file_full_path.stat()
    etag = hashlib.md5(f"{file_path}-{file_stats.st_mtime}-{file_stats.st_size}".encode()).hexdigest()
    
    # 캐시 최적화 헤더
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",  # 1년 캐시
        "ETag": f'"{etag}"',
        "X-Content-Type-Options": "nosniff",
    }
    
    return FileResponse(
        file_full_path,
        headers=headers,
        filename=file_path
    )

@app.get("/")
async def root():
    return {"message": "SK Siltron Media Viewer API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/api/files")
async def get_files():
    """contents 폴더의 모든 미디어 파일 목록을 반환 (order.json 순서 적용)"""
    try:
        # 지원하는 파일 확장자
        supported_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', 
                              '.mp4', '.avi', '.mov', '.wmv', '.webm',
                              '.mp3', '.wav', '.ogg', '.m4a'}
        
        # 실제 존재하는 미디어 파일들 수집
        available_files = []
        for file_path in CONTENTS_DIR.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in supported_extensions:
                available_files.append(file_path.name)
        
        # order.json 파일 읽기
        order_file = CONTENTS_DIR / "order.json"
        ordered_files = []
        
        if order_file.exists():
            try:
                with open(order_file, 'r', encoding='utf-8') as f:
                    order_data = json.load(f)
                    defined_order = order_data.get('order', [])
                
                # JSON에 정의된 순서대로 아이템 추가 (파일, 퀴즈 또는 선택지 객체)
                for item in defined_order:
                    if isinstance(item, str):
                        # 파일인 경우: 실제 존재하는 파일만 추가
                        if item in available_files:
                            ordered_files.append(item)
                    elif isinstance(item, dict) and item.get('type') in ['quiz', 'choice']:
                        # 퀴즈 또는 선택지 객체인 경우: 그대로 추가
                        ordered_files.append(item)
                
                # JSON에 정의된 아이템들만 표시 (나머지 파일들은 무시)
                
            except (json.JSONDecodeError, KeyError) as e:
                print(f"order.json 파일 파싱 오류: {e}")
                # JSON 오류 시 기본 알파벳 순 정렬
                available_files.sort()
                ordered_files = available_files
        else:
            # order.json이 없으면 기본 알파벳 순 정렬
            available_files.sort()
            ordered_files = available_files
        
        return ordered_files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 목록을 가져오는데 실패했습니다: {str(e)}")

@app.get("/api/file/{filename}")
async def get_file(filename: str):
    """특정 파일을 반환"""
    file_path = CONTENTS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    return FileResponse(file_path)

@app.get("/api/file/{filename}/thumbnail")
async def get_thumbnail(filename: str, size: int = 400):
    """빠른 로딩을 위한 썸네일 버전 제공"""
    file_path = CONTENTS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    # 이미지 파일만 썸네일 생성, 나머지는 원본 반환
    if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')):
        try:
            from PIL import Image
            import io
            
            # 이미지 열기 및 썸네일 생성
            with Image.open(file_path) as img:
                # RGBA 모드로 변환 (투명도 지원)
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # 비율 유지하며 썸네일 생성
                img.thumbnail((size, size), Image.Resampling.LANCZOS)
                
                # WebP 형태로 압축 (더 작은 용량)
                img_io = io.BytesIO()
                img.save(img_io, 'WEBP', quality=75, optimize=True)
                img_io.seek(0)
                
                return Response(
                    content=img_io.getvalue(), 
                    media_type="image/webp",
                    headers={
                        "Cache-Control": "public, max-age=31536000",
                        "X-Thumbnail": "true"
                    }
                )
        except ImportError:
            # Pillow가 설치되지 않은 경우 원본 반환
            pass
        except Exception as e:
            print(f"썸네일 생성 실패: {e}")
    
    # 비디오나 썸네일 생성 실패 시 원본 반환
    return FileResponse(file_path)

@app.get("/api/order")
async def get_order():
    """현재 파일 순서 설정을 반환"""
    order_file = CONTENTS_DIR / "order.json"
    
    if order_file.exists():
        try:
            with open(order_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {"order": []}
    else:
        return {"order": []}

@app.post("/api/order")
async def update_order(order_data: dict):
    """파일 순서를 업데이트"""
    try:
        order_file = CONTENTS_DIR / "order.json"
        
        # 기본 구조 검증
        if "order" not in order_data or not isinstance(order_data["order"], list):
            raise HTTPException(status_code=400, detail="잘못된 순서 데이터 형식입니다")
        
        # order.json 파일에 저장
        with open(order_file, 'w', encoding='utf-8') as f:
            json.dump(order_data, f, ensure_ascii=False, indent=2)
        
        return {"message": "파일 순서가 업데이트되었습니다", "order": order_data["order"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"순서 업데이트에 실패했습니다: {str(e)}")

@app.get("/api/quiz-results")
async def get_quiz_results():
    """퀴즈 결과를 반환"""
    results_file = CONTENTS_DIR / "quiz_results.json"
    
    if results_file.exists():
        try:
            with open(results_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {"results": []}
    else:
        return {"results": []}

@app.post("/api/quiz-results")
async def save_quiz_result(result_data: dict):
    """퀴즈 결과를 저장"""
    try:
        results_file = CONTENTS_DIR / "quiz_results.json"
        
        # 기존 결과 불러오기
        if results_file.exists():
            try:
                with open(results_file, 'r', encoding='utf-8') as f:
                    existing_data = json.load(f)
            except json.JSONDecodeError:
                existing_data = {"results": []}
        else:
            existing_data = {"results": []}
        
        # 새 결과 추가
        if "results" not in existing_data:
            existing_data["results"] = []
        
        existing_data["results"].append(result_data)
        
        # 파일에 저장
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(existing_data, f, ensure_ascii=False, indent=2)
        
        return {"message": "퀴즈 결과가 저장되었습니다", "result": result_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"퀴즈 결과 저장에 실패했습니다: {str(e)}")

def get_quiz_number_from_order(quiz_item, order_list):
    """order.json에서 퀴즈의 번호를 계산"""
    quiz_count = 0
    for item in order_list:
        if isinstance(item, dict) and item.get('type') == 'quiz':
            quiz_count += 1
            if item == quiz_item:
                return quiz_count
    return quiz_count + 1  # 찾지 못한 경우 마지막 번호 + 1

@app.post("/api/save-quiz-answer")
async def save_quiz_answer(answer_data: dict):
    """퀴즈 답변을 저장 (quiz_number, option_number 자동 계산)"""
    try:
        # order.json에서 퀴즈 순서 확인
        order_file = CONTENTS_DIR / "order.json"
        if not order_file.exists():
            raise HTTPException(status_code=404, detail="order.json 파일을 찾을 수 없습니다")
        
        with open(order_file, 'r', encoding='utf-8') as f:
            order_data = json.load(f)
        
        order_list = order_data.get('order', [])
        quiz_item = answer_data.get('quiz_item')
        selected_option_index = answer_data.get('selected_option_index')
        
        if quiz_item is None or selected_option_index is None:
            raise HTTPException(status_code=400, detail="quiz_item과 selected_option_index가 필요합니다")
        
        # 퀴즈 번호 계산
        quiz_number = get_quiz_number_from_order(quiz_item, order_list)
        option_number = selected_option_index + 1  # 0-based index를 1-based로 변환
        
        # 저장할 결과 데이터
        result_data = {
            "quiz_number": quiz_number,
            "question": quiz_item.get('question', ''),
            "selected_option_index": selected_option_index,
            "option_number": option_number,
            "selected_option": quiz_item.get('options', [])[selected_option_index] if selected_option_index < len(quiz_item.get('options', [])) else '',
            "timestamp": datetime.now().isoformat()
        }
        
        # 기존 결과 불러오기
        results_file = CONTENTS_DIR / "quiz_results.json"
        if results_file.exists():
            try:
                with open(results_file, 'r', encoding='utf-8') as f:
                    existing_data = json.load(f)
            except json.JSONDecodeError:
                existing_data = {"results": []}
        else:
            existing_data = {"results": []}
        
        if "results" not in existing_data:
            existing_data["results"] = []
        
        # 동일한 퀴즈 번호의 기존 답변 제거 (덮어쓰기)
        existing_data["results"] = [r for r in existing_data["results"] if r.get("quiz_number") != quiz_number]
        
        # 새 결과 추가
        existing_data["results"].append(result_data)
        
        # 파일에 저장
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(existing_data, f, ensure_ascii=False, indent=2)
        
        return {"message": "퀴즈 답변이 저장되었습니다", "result": result_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"퀴즈 답변 저장에 실패했습니다: {str(e)}")

@app.get("/api/choice-results")
async def get_choice_results():
    """선택지 결과를 반환"""
    results_file = CONTENTS_DIR / "choice_results.json"
    
    if results_file.exists():
        try:
            with open(results_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {"choices": []}
    else:
        return {"choices": []}

@app.post("/api/save-choice")
async def save_choice(choice_data: dict):
    """선택지 결과를 저장하고 브라우저 캐싱용 데이터도 반환"""
    try:
        choice_id = choice_data.get('choice_id')
        selected_id = choice_data.get('selected_id')
        choice_index = choice_data.get('choice_index')
        
        if not choice_id or not selected_id:
            raise HTTPException(status_code=400, detail="choice_id와 selected_id가 필요합니다")
        
        # 저장할 결과 데이터
        result_data = {
            "choice_id": choice_id,
            "selected_id": selected_id,
            "choice_index": choice_index,
            "timestamp": datetime.now().isoformat()
        }
        
        # 기존 결과 불러오기
        results_file = CONTENTS_DIR / "choice_results.json"
        if results_file.exists():
            try:
                with open(results_file, 'r', encoding='utf-8') as f:
                    existing_data = json.load(f)
            except json.JSONDecodeError:
                existing_data = {"choices": []}
        else:
            existing_data = {"choices": []}
        
        if "choices" not in existing_data:
            existing_data["choices"] = []
        
        # 동일한 choice_id의 기존 선택 제거 (덮어쓰기)
        existing_data["choices"] = [c for c in existing_data["choices"] if c.get("choice_id") != choice_id]
        
        # 새 결과 추가
        existing_data["choices"].append(result_data)
        
        # 파일에 저장
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(existing_data, f, ensure_ascii=False, indent=2)
        
        # 브라우저 캐싱용 데이터 생성
        cache_data = {
            "userChoices": {
                "timestamp": datetime.now().isoformat(),
                "choices": {item["choice_id"]: item["selected_id"] for item in existing_data["choices"]}
            }
        }
        
        return {
            "message": "선택지 결과가 저장되었습니다", 
            "result": result_data,
            "cacheData": cache_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"선택지 저장에 실패했습니다: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 