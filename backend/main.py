from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import os
import json
from pathlib import Path
from typing import List, Optional
from datetime import datetime
import hashlib
import aiofiles
from PIL import Image
import io
import asyncio
import time
import weakref

app = FastAPI(
    title="SK Siltron Media Viewer API",
    description="고성능 미디어 서빙 API",
    version="2.0.0"
)

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

# 썸네일 디렉토리 생성
THUMBNAILS_DIR = CONTENTS_DIR / "thumbnails"
if not THUMBNAILS_DIR.exists():
    THUMBNAILS_DIR.mkdir()

# 파일 캐시 (약한 참조로 메모리 누수 방지)
file_cache = weakref.WeakValueDictionary()
order_cache = {"data": None, "timestamp": 0, "ttl": 60}  # 60초 TTL
thumbnail_cache = weakref.WeakValueDictionary()  # 썸네일 캐시

# 조건부 요청 지원 헬퍼 함수
def check_conditional_request(request: Request, etag: str, last_modified: float) -> Optional[Response]:
    """조건부 요청 확인 및 304 응답 반환"""
    # If-None-Match 헤더 확인
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and f'"{etag}"' in if_none_match:
        return Response(status_code=304, headers={"ETag": f'"{etag}"'})
    
    # If-Modified-Since 헤더 확인
    if_modified_since = request.headers.get("if-modified-since")
    if if_modified_since:
        try:
            client_time = time.mktime(time.strptime(if_modified_since, "%a, %d %b %Y %H:%M:%S GMT"))
            if last_modified <= client_time:
                return Response(status_code=304)
        except (ValueError, TypeError):
            pass
    
    return None

# 스트리밍 파일 읽기
async def stream_file(file_path: Path, chunk_size: int = 8192):
    """파일을 청크 단위로 스트리밍"""
    async with aiofiles.open(file_path, 'rb') as f:
        while chunk := await f.read(chunk_size):
            yield chunk

# 캐시 최적화된 정적 파일 서빙
@app.get("/static/{file_path:path}")
async def serve_static_optimized(file_path: str, request: Request, range: Optional[str] = None):
    """최적화된 정적 파일 서빙 (캐시 헤더 + ETag + 조건부 요청 + 스트리밍)"""
    file_full_path = CONTENTS_DIR / file_path
    
    if not file_full_path.exists() or not file_full_path.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    # 파일 통계 정보
    file_stats = file_full_path.stat()
    file_size = file_stats.st_size
    last_modified = file_stats.st_mtime
    
    # ETag 생성
    etag = hashlib.md5(f"{file_path}-{last_modified}-{file_size}".encode()).hexdigest()
    
    # 조건부 요청 확인
    conditional_response = check_conditional_request(request, etag, last_modified)
    if conditional_response:
        return conditional_response
    
    # 기본 헤더
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": f'"{etag}"',
        "X-Content-Type-Options": "nosniff",
        "Last-Modified": time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(last_modified)),
        "Accept-Ranges": "bytes"
    }
    
    # 큰 파일(1MB 이상)은 스트리밍으로 전송
    if file_size > 1024 * 1024:  # 1MB
        # Range 요청 처리
        if range and range.startswith("bytes="):
            try:
                ranges = range[6:].split("-")
                start = int(ranges[0]) if ranges[0] else 0
                end = int(ranges[1]) if ranges[1] else file_size - 1
                
                headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
                headers["Content-Length"] = str(end - start + 1)
                
                async def range_stream():
                    async with aiofiles.open(file_full_path, 'rb') as f:
                        await f.seek(start)
                        remaining = end - start + 1
                        while remaining > 0:
                            chunk_size = min(8192, remaining)
                            chunk = await f.read(chunk_size)
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            yield chunk
                
                return StreamingResponse(
                    range_stream(),
                    status_code=206,
                    headers=headers,
                    media_type="application/octet-stream"
                )
            except (ValueError, IndexError):
                pass
        
        # 일반 스트리밍
        return StreamingResponse(
            stream_file(file_full_path),
            headers=headers,
            media_type="application/octet-stream"
        )
    else:
        # 작은 파일은 일반 FileResponse
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
async def get_files(request: Request):
    """contents 폴더의 모든 미디어 파일 목록을 반환 (order.json 순서 적용, 캐싱 지원)"""
    try:
        current_time = time.time()
        order_file = CONTENTS_DIR / "order.json"
        
        # 캐시된 데이터가 있고 유효한지 확인
        if (order_cache["data"] is not None and 
            current_time - order_cache["timestamp"] < order_cache["ttl"] and
            order_file.exists()):
            
            file_mtime = order_file.stat().st_mtime
            if file_mtime <= order_cache["timestamp"]:
                # ETag 생성
                cache_etag = hashlib.md5(str(order_cache["data"]).encode()).hexdigest()
                
                # 조건부 요청 확인
                conditional_response = check_conditional_request(request, cache_etag, order_cache["timestamp"])
                if conditional_response:
                    return conditional_response
                
                return order_cache["data"]
        
        # 파일 수집
        supported_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', 
                              '.mp4', '.avi', '.mov', '.wmv', '.webm',
                              '.mp3', '.wav', '.ogg', '.m4a'}
        
        available_files = []
        async def collect_files(directory):
            for item in directory.iterdir():
                if item.is_file() and item.suffix.lower() in supported_extensions:
                    relative_path = item.relative_to(CONTENTS_DIR)
                    available_files.append(str(relative_path).replace('\\', '/'))
                elif item.is_dir():
                    await collect_files(item)
        await collect_files(CONTENTS_DIR)
        
        ordered_files = []
        
        if order_file.exists():
            try:
                async with aiofiles.open(order_file, 'r', encoding='utf-8') as f:
                    order_data = json.loads(await f.read())
                    defined_order = order_data.get('order', [])
                
                for item in defined_order:
                    if isinstance(item, str):
                        if item in available_files:
                            ordered_files.append(item)
                    elif isinstance(item, dict) and item.get('type') in ['quiz', 'choice', 'return_to_choice', 'crossroad', 'choice_summary']:
                        ordered_files.append(item)
                
            except (json.JSONDecodeError, KeyError) as e:
                print(f"order.json 파일 파싱 오류: {e}")
                available_files.sort()
                ordered_files = available_files
        else:
            available_files.sort()
            ordered_files = available_files
        
        # 캐시 업데이트
        order_cache["data"] = ordered_files
        order_cache["timestamp"] = current_time
        
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
async def get_thumbnail(filename: str, size: int = 400, request: Request = None):
    """빠른 로딩을 위한 썸네일 버전 제공 (캐시 강화)"""
    file_path = CONTENTS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')):
        try:
            # 캐시 키 생성
            cache_key = f"{filename}_{size}"
            file_stats = file_path.stat()
            etag = hashlib.md5(f"{cache_key}-{file_stats.st_mtime}-{file_stats.st_size}".encode()).hexdigest()
            
            # 조건부 요청 확인
            if request:
                conditional_response = check_conditional_request(request, etag, file_stats.st_mtime)
                if conditional_response:
                    return conditional_response
            
            # 메모리 캐시 확인
            if cache_key in thumbnail_cache:
                cached_data = thumbnail_cache[cache_key]
                return Response(
                    content=cached_data,
                    media_type="image/webp",
                    headers={
                        "Cache-Control": "public, max-age=31536000",
                        "ETag": f'"{etag}"',
                        "X-Thumbnail": "true",
                        "X-Cache": "HIT"
                    }
                )
            
            def create_thumbnail():
                with Image.open(file_path) as img:
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    img.thumbnail((size, size), Image.Resampling.LANCZOS)
                    img_io = io.BytesIO()
                    img.save(img_io, 'WEBP', quality=75, optimize=True)
                    img_io.seek(0)
                    return img_io.getvalue()
            
            thumbnail_data = await run_in_threadpool(create_thumbnail)
            
            # 캐시에 저장 (약한 참조)
            thumbnail_cache[cache_key] = thumbnail_data
            
            return Response(
                content=thumbnail_data, 
                media_type="image/webp",
                headers={
                    "Cache-Control": "public, max-age=31536000",
                    "ETag": f'"{etag}"',
                    "X-Thumbnail": "true",
                    "X-Cache": "MISS"
                }
            )
        except Exception as e:
            print(f"썸네일 생성 실패: {e}")
    
    return FileResponse(file_path)

@app.get("/api/thumbnail/{file_path:path}")
async def get_thumbnail(file_path: str, size: int = 400, quality: int = 85):
    """썸네일 생성 및 캐싱 API"""
    try:
        # 원본 파일 경로
        original_path = CONTENTS_DIR / file_path
        
        if not original_path.exists() or not original_path.is_file():
            raise HTTPException(status_code=404, detail="원본 파일을 찾을 수 없습니다")
        
        # 이미지 파일인지 확인
        image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}
        if original_path.suffix.lower() not in image_extensions:
            # 이미지가 아니면 원본 파일 반환
            return FileResponse(original_path)
        
        # 썸네일 파일 경로 생성
        safe_filename = file_path.replace('/', '_').replace('\\', '_')
        thumb_filename = f"{size}x{size}_q{quality}_{safe_filename}"
        thumb_path = THUMBNAILS_DIR / thumb_filename
        
        # 썸네일이 이미 존재하고 원본보다 최신이면 바로 반환
        if (thumb_path.exists() and 
            thumb_path.stat().st_mtime > original_path.stat().st_mtime):
            return FileResponse(thumb_path)
        
        # 썸네일 생성
        def create_thumbnail():
            try:
                with Image.open(original_path) as img:
                    # RGBA로 변환 (투명도 지원)
                    if img.mode in ('RGBA', 'LA', 'P'):
                        img = img.convert('RGBA')
                    else:
                        img = img.convert('RGB')
                    
                    # 썸네일 생성 (비율 유지)
                    img.thumbnail((size, size), Image.Resampling.LANCZOS)
                    
                    # WebP로 저장 (더 나은 압축)
                    webp_thumb_path = thumb_path.with_suffix('.webp')
                    img.save(webp_thumb_path, 'WEBP', optimize=True, quality=quality)
                    
                    return webp_thumb_path
            except Exception as e:
                print(f"썸네일 생성 실패: {e}")
                return original_path
        
        # 비동기로 썸네일 생성
        thumb_result = await run_in_threadpool(create_thumbnail)
        
        # ETag 생성
        file_stats = thumb_result.stat()
        etag = hashlib.md5(f"{thumb_result}-{file_stats.st_mtime}-{file_stats.st_size}".encode()).hexdigest()
        
        return FileResponse(
            thumb_result,
            headers={
                "Cache-Control": "public, max-age=86400",  # 1일 캐시
                "ETag": f'"{etag}"'
            }
        )
        
    except Exception as e:
        print(f"썸네일 API 오류: {e}")
        # 오류 시 원본 파일 반환
        if original_path.exists():
            return FileResponse(original_path)
        raise HTTPException(status_code=500, detail=f"썸네일 생성에 실패했습니다: {str(e)}")

@app.get("/api/order")
async def get_order():
    """현재 파일 순서 설정을 반환"""
    order_file = CONTENTS_DIR / "order.json"
    
    if order_file.exists():
        try:
            async with aiofiles.open(order_file, 'r', encoding='utf-8') as f:
                return json.loads(await f.read())
        except json.JSONDecodeError:
            return {"order": [], "soundSections": []}
    else:
        return {"order": [], "soundSections": []}

@app.post("/api/order")
async def update_order(order_data: dict):
    """파일 순서를 업데이트"""
    try:
        order_file = CONTENTS_DIR / "order.json"
        
        if "order" not in order_data or not isinstance(order_data["order"], list):
            raise HTTPException(status_code=400, detail="잘못된 순서 데이터 형식입니다")
        
        async with aiofiles.open(order_file, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(order_data, ensure_ascii=False, indent=2))
        
        return {"message": "파일 순서가 업데이트되었습니다", "order": order_data["order"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"순서 업데이트에 실패했습니다: {str(e)}")

@app.get("/api/quiz-results")
async def get_quiz_results():
    """퀴즈 결과를 반환"""
    results_file = CONTENTS_DIR / "quiz_results.json"
    
    if results_file.exists():
        try:
            async with aiofiles.open(results_file, 'r', encoding='utf-8') as f:
                return json.loads(await f.read())
        except json.JSONDecodeError:
            return {"results": []}
    else:
        return {"results": []}

@app.post("/api/quiz-results")
async def save_quiz_result(result_data: dict):
    """퀴즈 결과를 저장"""
    try:
        results_file = CONTENTS_DIR / "quiz_results.json"
        
        existing_data = {"results": []}
        if results_file.exists():
            try:
                async with aiofiles.open(results_file, 'r', encoding='utf-8') as f:
                    existing_data = json.loads(await f.read())
            except json.JSONDecodeError:
                pass
        
        if "results" not in existing_data:
            existing_data["results"] = []
        
        existing_data["results"].append(result_data)
        
        async with aiofiles.open(results_file, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(existing_data, ensure_ascii=False, indent=2))
        
        return {"message": "퀴즈 결과가 저장되었습니다", "result": result_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"퀴즈 결과 저장에 실패했습니다: {str(e)}")


@app.post("/api/save-quiz-answer")
async def save_quiz_answer(answer_data: dict):
    """퀴즈 답변을 저장 (quiz_number, option_number 자동 계산)"""
    try:
        order_file = CONTENTS_DIR / "order.json"
        if not order_file.exists():
            raise HTTPException(status_code=404, detail="order.json 파일을 찾을 수 없습니다")
        
        async with aiofiles.open(order_file, 'r', encoding='utf-8') as f:
            order_data = json.loads(await f.read())
        
        order_list = order_data.get('order', [])
        quiz_item = answer_data.get('quiz_item')
        selected_option_index = answer_data.get('selected_option_index')
        
        if quiz_item is None or selected_option_index is None:
            raise HTTPException(status_code=400, detail="quiz_item과 selected_option_index가 필요합니다")
        
        def get_quiz_number_from_order(quiz_item, order_list):
            """order_list에서 quiz_item의 위치를 찾아 quiz_number를 반환"""
            quiz_count = 0
            for i, item in enumerate(order_list):
                if isinstance(item, dict) and item.get('type') == 'quiz':
                    quiz_count += 1
                    if item == quiz_item:
                        return quiz_count
            return quiz_count + 1  # 찾지 못한 경우 마지막 번호 + 1
        
        quiz_number = get_quiz_number_from_order(quiz_item, order_list)
        option_number = selected_option_index + 1
        
        result_data = {
            "quiz_number": quiz_number,
            "question": quiz_item.get('question', ''),
            "selected_option_index": selected_option_index,
            "option_number": option_number,
            "selected_option": quiz_item.get('options', [])[selected_option_index] if selected_option_index < len(quiz_item.get('options', [])) else '',
            "timestamp": datetime.now().isoformat()
        }
        
        results_file = CONTENTS_DIR / "quiz_results.json"
        existing_data = {"results": []}
        if results_file.exists():
            try:
                async with aiofiles.open(results_file, 'r', encoding='utf-8') as f:
                    existing_data = json.loads(await f.read())
            except json.JSONDecodeError:
                pass
        
        if "results" not in existing_data:
            existing_data["results"] = []
        
        existing_data["results"] = [r for r in existing_data["results"] if r.get("quiz_number") != quiz_number]
        
        existing_data["results"].append(result_data)
        
        async with aiofiles.open(results_file, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(existing_data, ensure_ascii=False, indent=2))
        
        return {"message": "퀴즈 답변이 저장되었습니다", "result": result_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"퀴즈 답변 저장에 실패했습니다: {str(e)}")

@app.get("/api/choice-results")
async def get_choice_results():
    """선택지 결과를 반환"""
    results_file = CONTENTS_DIR / "choice_results.json"
    
    if results_file.exists():
        try:
            async with aiofiles.open(results_file, 'r', encoding='utf-8') as f:
                return json.loads(await f.read())
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
        
        result_data = {
            "choice_id": choice_id,
            "selected_id": selected_id,
            "choice_index": choice_index,
            "timestamp": datetime.now().isoformat()
        }
        
        results_file = CONTENTS_DIR / "choice_results.json"
        existing_data = {"choices": []}
        if results_file.exists():
            try:
                async with aiofiles.open(results_file, 'r', encoding='utf-8') as f:
                    existing_data = json.loads(await f.read())
            except json.JSONDecodeError:
                pass
        
        if "choices" not in existing_data:
            existing_data["choices"] = []
        
        existing_data["choices"] = [c for c in existing_data["choices"] if c.get("choice_id") != choice_id]
        
        existing_data["choices"].append(result_data)
        
        async with aiofiles.open(results_file, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(existing_data, ensure_ascii=False, indent=2))
        
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
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        workers=1,  # Railway에서는 단일 워커 권장
        loop="uvloop",  # 성능 최적화
        http="httptools",  # HTTP 성능 최적화
        access_log=False,  # 로그 오버헤드 감소
        timeout_keep_alive=30  # Keep-Alive 연결 유지
    ) 