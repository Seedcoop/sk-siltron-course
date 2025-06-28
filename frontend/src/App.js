import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function App() {
  const [files, setFiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preloading, setPreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [preloadedMedia, setPreloadedMedia] = useState(new Map());
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [mouseDown, setMouseDown] = useState(false);
  const [mouseStart, setMouseStart] = useState(null);
  const [mouseEnd, setMouseEnd] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({}); // 퀴즈 답변 저장
  const [showQuiz, setShowQuiz] = useState(false); // 퀴즈 팝업 표시 여부
  const [userInteracted, setUserInteracted] = useState(false); // 사용자 상호작용 여부
  const containerRef = useRef(null);

  // 파일 타입 확인 함수 (프리로딩에서 사용하므로 먼저 정의)
  const getFileType = (filename) => {
    const ext = filename.toLowerCase().split('.').pop();
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) {
      return 'image';
    } else if (['mp4', 'avi', 'mov', 'wmv', 'webm'].includes(ext)) {
      return 'video';
    } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
      return 'audio';
    }
    return 'unknown';
  };

  // 미디어 프리로딩 함수
  const preloadMedia = useCallback(async (mediaFiles) => {
    if (mediaFiles.length === 0) return;
    
    setPreloading(true);
    setPreloadProgress(0);
    
    const mediaMap = new Map();
    let loadedCount = 0;
    const totalMedia = mediaFiles.length;
    
    const loadPromises = mediaFiles.map((fileName) => {
      return new Promise((resolve) => {
        const fileUrl = `${API_BASE_URL}/static/${fileName}`;
        const fileType = getFileType(fileName);
        
        if (fileType === 'image') {
          const img = new Image();
          img.onload = () => {
            mediaMap.set(fileName, { url: fileUrl, element: img, type: 'image' });
            loadedCount++;
            setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
            resolve();
          };
          img.onerror = () => {
            console.error(`이미지 로딩 실패: ${fileName}`);
            loadedCount++;
            setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
            resolve();
          };
          img.src = fileUrl;
        } else if (fileType === 'video') {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadeddata = () => {
            mediaMap.set(fileName, { url: fileUrl, element: video, type: 'video' });
            loadedCount++;
            setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
            resolve();
          };
          video.onerror = () => {
            console.error(`비디오 로딩 실패: ${fileName}`);
            loadedCount++;
            setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
            resolve();
          };
          video.src = fileUrl;
        } else {
          // 오디오나 기타 파일은 바로 완료 처리
          mediaMap.set(fileName, { url: fileUrl, element: null, type: fileType });
          loadedCount++;
          setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
          resolve();
        }
      });
    });
    
    await Promise.all(loadPromises);
    setPreloadedMedia(mediaMap);
    setPreloading(false);
    console.log(`${mediaFiles.length}개의 미디어 파일 프리로딩 완료!`);
  }, []);

  // 파일 목록 로드
  useEffect(() => {
    const loadFiles = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE_URL}/api/files`);
        setFiles(response.data);
        
        // 파일 목록에서 실제 미디어 파일만 추출
        const mediaFiles = response.data.filter(item => 
          typeof item === 'string' && getFileType(item) !== 'unknown'
        );
        
        // 미디어 파일들을 프리로딩
        if (mediaFiles.length > 0) {
          await preloadMedia(mediaFiles);
        }
        
        setError(null);
      } catch (err) {
        setError('파일을 불러오는데 실패했습니다.');
        console.error('Error loading files:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFiles();
  }, [preloadMedia]);

  // currentIndex가 변경될 때 퀴즈 팝업 숨기기
  useEffect(() => {
    setShowQuiz(false);
  }, [currentIndex]);

  // 다음 아이템이 퀴즈인지 확인 (팝업으로 표시할지 결정)
  const getNextQuiz = useCallback(() => {
    if (files.length === 0 || currentIndex >= files.length - 1) return null;
    const nextItem = files[currentIndex + 1];
    if (typeof nextItem === 'object' && nextItem.type === 'quiz') {
      return { quiz: nextItem, quizIndex: currentIndex + 1 };
    }
    return null;
  }, [files, currentIndex]);

  // 다음 파일로 이동
  const nextFile = useCallback(() => {
    // 사용자 상호작용 기록
    setUserInteracted(true);
    
    if (files.length > 0) {
      // 현재 퀴즈가 표시된 상태라면 더 이상 진행하지 않음
      if (showQuiz) {
        return;
      }
      
      // 다음 아이템이 퀴즈인지 확인
      const nextQuiz = getNextQuiz();
      if (nextQuiz && quizAnswers[nextQuiz.quizIndex] === undefined) {
        // 퀴즈가 있고 아직 답변하지 않았다면 퀴즈 팝업 표시
        setShowQuiz(true);
        return;
      }
      
      setCurrentIndex((prevIndex) => {
        let nextIndex = prevIndex + 1;
        
        // 다음 아이템이 퀴즈라면 건너뛰기
        if (nextIndex < files.length) {
          const nextItem = files[nextIndex];
          if (typeof nextItem === 'object' && nextItem.type === 'quiz') {
            nextIndex = nextIndex + 1;
          }
        }
        
        return nextIndex < files.length ? nextIndex : prevIndex;
      });
    }
  }, [files, getNextQuiz, quizAnswers, showQuiz]);

  // 이전 파일로 이동
  const prevFile = useCallback(() => {
    // 사용자 상호작용 기록
    setUserInteracted(true);
    
    if (files.length > 0) {
      setCurrentIndex((prevIndex) => {
        let newIndex = prevIndex - 1;
        
        // 이전 아이템이 퀴즈라면 건너뛰기
        if (newIndex >= 0) {
          const prevItem = files[newIndex];
          if (typeof prevItem === 'object' && prevItem.type === 'quiz') {
            newIndex = newIndex - 1;
          }
        }
        
        return newIndex >= 0 ? newIndex : prevIndex;
      });
    }
  }, [files]);

  // 퀴즈 답변 처리
  const handleQuizAnswer = useCallback(async (answerIndex) => {
    const nextQuiz = getNextQuiz();
    if (nextQuiz) {
      try {
        // 서버로 퀴즈 답변 저장
        await axios.post(`${API_BASE_URL}/api/save-quiz-answer`, {
          quiz_item: nextQuiz.quiz,
          selected_option_index: answerIndex
        });
        
        // 로컬 상태에도 저장
        setQuizAnswers(prev => ({
          ...prev,
          [nextQuiz.quizIndex]: answerIndex
        }));
        
        // 잠시 후 퀴즈 숨기고 다음으로 이동
        setTimeout(() => {
          setShowQuiz(false);
          
          // 실제로 다음 파일로 이동 (퀴즈 건너뛰기)
          setCurrentIndex((prevIndex) => {
            let nextIndex = prevIndex + 1;
            
            // 다음 아이템이 퀴즈라면 건너뛰기
            if (nextIndex < files.length) {
              const nextItem = files[nextIndex];
              if (typeof nextItem === 'object' && nextItem.type === 'quiz') {
                nextIndex = nextIndex + 1;
              }
            }
            
            return nextIndex < files.length ? nextIndex : prevIndex;
          });
        }, 1000); // 1초 후 자동 이동
        
      } catch (error) {
        console.error('퀴즈 답변 저장 실패:', error);
        // 저장 실패해도 로컬에는 저장하고 다음으로 이동
        setQuizAnswers(prev => ({
          ...prev,
          [nextQuiz.quizIndex]: answerIndex
        }));
        
        setTimeout(() => {
          setShowQuiz(false);
          
          // 실제로 다음 파일로 이동 (퀴즈 건너뛰기)
          setCurrentIndex((prevIndex) => {
            let nextIndex = prevIndex + 1;
            
            // 다음 아이템이 퀴즈라면 건너뛰기
            if (nextIndex < files.length) {
              const nextItem = files[nextIndex];
              if (typeof nextItem === 'object' && nextItem.type === 'quiz') {
                nextIndex = nextIndex + 1;
              }
            }
            
            return nextIndex < files.length ? nextIndex : prevIndex;
          });
        }, 1000);
      }
    }
  }, [getNextQuiz, files]);

  // 스와이프 기능
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      setUserInteracted(true);
      nextFile();
    } else if (isRightSwipe) {
      setUserInteracted(true);
      prevFile();
    }
  };

  // 마우스 드래그 기능
  const onMouseDown = (e) => {
    setMouseDown(true);
    setMouseEnd(null);
    setMouseStart(e.clientX);
  };

  const onMouseMove = (e) => {
    if (!mouseDown) return;
    setMouseEnd(e.clientX);
  };

  const onMouseUp = () => {
    if (!mouseDown || !mouseStart || !mouseEnd) {
      setMouseDown(false);
      return;
    }
    
    const distance = mouseStart - mouseEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      setUserInteracted(true);
      nextFile();
    } else if (isRightSwipe) {
      setUserInteracted(true);
      prevFile();
    }
    
    setMouseDown(false);
  };

  const onMouseLeave = () => {
    setMouseDown(false);
  };

  // 키보드 이벤트 처리
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'ArrowRight') {
        setUserInteracted(true);
        nextFile();
      } else if (event.key === 'ArrowLeft') {
        setUserInteracted(true);
        prevFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextFile, prevFile]);



  // 퀴즈 팝업 렌더링
  const renderQuizPopup = (quizData, quizIndex) => {
    const selectedAnswer = quizAnswers[quizIndex];
    
    return (
      <div className="quiz-overlay">
        <div className="quiz-popup">
          <h2 className="quiz-question">{quizData.question}</h2>
          <div className="quiz-options">
            {quizData.options.map((option, index) => (
              <button
                key={index}
                className={`quiz-option ${selectedAnswer === index ? 'selected' : ''}`}
                onClick={() => handleQuizAnswer(index)}
              >
                {option}
              </button>
            ))}
          </div>
          {selectedAnswer !== undefined && (
            <div className="quiz-selected-message">
              답변이 저장되었습니다. 잠시 후 다음으로 이동합니다...
            </div>
          )}
        </div>
      </div>
    );
  };

  // 미디어 렌더링 (퀴즈는 팝업으로 별도 처리)
  const renderContent = () => {
    if (files.length === 0) return null;

    const currentItem = files[currentIndex];
    
    // 현재 아이템이 퀴즈인 경우는 이전 이미지로 되돌아가야 함 (이론적으로 발생하지 않아야 함)
    if (typeof currentItem === 'object' && currentItem.type === 'quiz') {
      // 퀴즈는 팝업으로만 표시되어야 하므로, 이전 이미지 찾기
      for (let i = currentIndex - 1; i >= 0; i--) {
        const item = files[i];
        if (typeof item === 'string') {
          const fileUrl = `${API_BASE_URL}/static/${item}`;
          const fileType = getFileType(item);
          return renderMediaByType(item, fileUrl, fileType);
        }
      }
      return <div className="no-files">표시할 이미지가 없습니다.</div>;
    }
    
    // 파일인 경우
    const fileUrl = `${API_BASE_URL}/static/${currentItem}`;
    const fileType = getFileType(currentItem);
    return renderMediaByType(currentItem, fileUrl, fileType);
  };

  // 미디어 타입별 렌더링 (프리로딩된 미디어 사용)
  const renderMediaByType = (fileName, fileUrl, fileType) => {
    const preloadedItem = preloadedMedia.get(fileName);
    
    switch (fileType) {
      case 'image':
        return (
          <img 
            src={fileUrl} 
            alt={fileName}
            className="media-content"
            style={preloadedItem ? {} : { filter: 'blur(5px)' }} // 프리로딩 안된 경우 블러 효과
          />
        );
      case 'video':
        return (
          <video 
            src={fileUrl} 
            controls
            autoPlay={userInteracted}
            muted={userInteracted}
            loop
            className="media-content"
            preload="metadata"
            style={preloadedItem ? {} : { filter: 'blur(5px)' }} // 프리로딩 안된 경우 블러 효과
            onClick={(e) => {
              // 동영상 클릭 시 음소거 해제하고 재생
              e.target.muted = false;
              if (e.target.paused) {
                e.target.play().catch(console.error);
              }
            }}
            onLoadedData={(e) => {
              // 사용자가 상호작용했고 동영상이 로드되면 자동재생 시도
              if (userInteracted && e.target.paused) {
                e.target.play().catch(console.error);
              }
            }}
          />
        );
      case 'audio':
        return (
          <div className="audio-container">
            <div className="audio-title">{fileName}</div>
            <audio 
              src={fileUrl} 
              controls
              className="audio-player"
            />
          </div>
        );
      default:
        return <div className="unsupported">지원하지 않는 파일 형식입니다.</div>;
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="loading-message">
            {preloading ? '미디어 파일을 준비하는 중...' : '파일 목록을 불러오는 중...'}
          </div>
          {preloading && (
            <div className="preload-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${preloadProgress}%` }}
                ></div>
              </div>
              <div className="progress-text">
                {preloadProgress}% 완료
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">{error}</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="app">
        <div className="no-files">contents 폴더에 미디어 파일이 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="app">
      <div 
        className="viewer-container"
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <div className="media-container">
          {renderContent()}
          {/* showQuiz 상태에 따라 퀴즈 팝업 표시 */}
          {showQuiz && (() => {
            const nextQuiz = getNextQuiz();
            return nextQuiz ? renderQuizPopup(nextQuiz.quiz, nextQuiz.quizIndex) : null;
          })()}
        </div>
        
        <div className="controls">
          <button 
            onClick={prevFile}
            className="nav-button prev-button"
            disabled={files.length <= 1}
          >
            <span className="nav-icon">⟨</span>
          </button>
          
          <div className="control-center">
            <span className="swipe-hint">
              {!userInteracted ? "클릭하거나 스와이프하여 동영상 자동재생을 활성화하세요" : "스와이프하여 이동하세요"}
            </span>
            <span className="file-counter">
              {currentIndex + 1} / {files.length}
            </span>
          </div>
          
          <button 
            onClick={nextFile}
            className="nav-button next-button"
            disabled={files.length <= 1}
          >
            <span className="nav-icon">⟩</span>
          </button>
        </div>
        

      </div>
    </div>
  );
}

export default App; 