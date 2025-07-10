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
  const [choiceAnswers, setChoiceAnswers] = useState({}); // 선택지 답변 저장
  const [showChoice, setShowChoice] = useState(false); // 선택지 화면 표시 여부
  const [userInteracted, setUserInteracted] = useState(false); // 사용자 상호작용 여부
  const containerRef = useRef(null);

  // URL 경로를 안전하게 인코딩하는 함수 (한글/특수문자 처리)
  const safeEncodeURI = (path) => {
    return path.split('/').map(encodeURIComponent).join('/');
  };

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

  // 전체 미디어 한 번에 완전 프리로딩 (넘길 때 로딩 제로!)
  const preloadMedia = useCallback(async (mediaFiles) => {
    if (mediaFiles.length === 0) return;
    
    setPreloading(true);
    setPreloadProgress(0);
    
    const mediaMap = new Map();
    let loadedCount = 0;
    const totalMedia = mediaFiles.length;

    console.log(`🚀 모든 미디어 ${totalMedia}개 한 번에 로딩 시작! 잠시만 기다려주세요...`);

    // 모든 파일을 원본 그대로 완전히 로딩
    const loadFullMedia = (fileName) => {
      return new Promise((resolve) => {
        const fileType = getFileType(fileName);
        const fileUrl = `${API_BASE_URL}/static/${safeEncodeURI(fileName)}`;
        
        if (fileType === 'image') {
          const img = new Image();
          img.onload = () => {
            // 이미지 완전 로딩 완료
            mediaMap.set(fileName, { 
              url: fileUrl,
              element: img, 
              type: 'image',
              loaded: 'complete',
              preloaded: true
            });
            loadedCount++;
            setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
            console.log(`✅ 이미지 로딩 완료: ${fileName} (${loadedCount}/${totalMedia})`);
            resolve();
          };
          img.onerror = () => {
            console.error(`❌ 이미지 로딩 실패: ${fileName}`);
            loadedCount++;
            setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
            resolve();
          };
          img.src = fileUrl;
          
        } else if (fileType === 'video') {
          const video = document.createElement('video');
          video.preload = 'auto'; // 전체 비디오 로딩
          video.oncanplaythrough = () => {
            // 비디오 완전 로딩 완료
            mediaMap.set(fileName, { 
              url: fileUrl,
              element: video, 
              type: 'video',
              loaded: 'complete',
              preloaded: true
            });
            loadedCount++;
            setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
            console.log(`✅ 비디오 로딩 완료: ${fileName} (${loadedCount}/${totalMedia})`);
            resolve();
          };
          video.onerror = () => {
            console.error(`❌ 비디오 로딩 실패: ${fileName}`);
            loadedCount++;
            setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
            resolve();
          };
          video.src = fileUrl;
          
        } else {
          // 오디오나 기타 파일
          mediaMap.set(fileName, { 
            url: fileUrl,
            element: null, 
            type: fileType,
            loaded: 'complete',
            preloaded: true
          });
          loadedCount++;
          setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
          console.log(`✅ 기타 파일 처리 완료: ${fileName} (${loadedCount}/${totalMedia})`);
          resolve();
        }
      });
    };

    // 🔥 모든 파일을 동시에 로딩 (병렬 처리)
    await Promise.all(mediaFiles.map(loadFullMedia));
    
    setPreloadedMedia(mediaMap);
    setPreloading(false);
    console.log(`🎉 전체 ${mediaFiles.length}개 파일 완전 로딩 완료! 이제 넘길 때 즉시 표시됩니다!`);
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

  // currentIndex가 변경될 때 팝업 숨기기 및 choice 타입 확인
  useEffect(() => {
    setShowQuiz(false);
    setShowChoice(false);
    
    if (files.length > 0 && currentIndex < files.length) {
      const currentItem = files[currentIndex];
      if (typeof currentItem === 'object' && currentItem.type === 'choice') {
        setShowChoice(true);
      }
    }
  }, [currentIndex, files]);

  // 다음 아이템이 퀴즈인지 확인 (팝업으로 표시할지 결정)
  const getNextQuiz = useCallback(() => {
    if (files.length === 0 || currentIndex >= files.length - 1) return null;
    const nextItem = files[currentIndex + 1];
    if (typeof nextItem === 'object' && nextItem.type === 'quiz') {
      return { quiz: nextItem, quizIndex: currentIndex + 1 };
    }
    return null;
  }, [files, currentIndex]);

  // 현재 아이템이 선택지인지 확인
  const getCurrentChoice = useCallback(() => {
    if (files.length === 0 || currentIndex >= files.length) return null;
    const currentItem = files[currentIndex];
    if (typeof currentItem === 'object' && currentItem.type === 'choice') {
      return { choice: currentItem, choiceIndex: currentIndex };
    }
    return null;
  }, [files, currentIndex]);

  // 선택지 결과를 브라우저에 캐싱
  const saveToBrowserCache = useCallback((cacheData) => {
    try {
      localStorage.setItem('skSiltronChoices', JSON.stringify(cacheData));
      console.log('브라우저 캐시에 저장 완료:', cacheData);
    } catch (error) {
      console.error('브라우저 캐시 저장 실패:', error);
    }
  }, []);

  // 다음 파일로 이동
  const nextFile = useCallback(() => {
    // 사용자 상호작용 기록
    setUserInteracted(true);
    
    if (files.length > 0) {
      // 현재 퀴즈나 선택지, 갈림길이 표시된 상태라면 더 이상 진행하지 않음
      if (showQuiz || showChoice) {
        return;
      }
      
      // 다음 아이템이 퀴즈인지 확인
      const nextQuiz = getNextQuiz();
      if (nextQuiz) {
        // 퀴즈가 있고 아직 답변하지 않았다면 팝업 표시
        setShowQuiz(true);
        return;
      }
      
      setCurrentIndex((prevIndex) => {
        let nextIndex = prevIndex + 1;
        
        // 다음 아이템이 퀴즈라면 건너뛰기
        if (nextIndex < files.length) {
          const nextItem = files[nextIndex];
          if (typeof nextItem === 'object' && (nextItem.type === 'quiz' || nextItem.type === 'choice')) {
            nextIndex = nextIndex + 1;
          }
        }
        
        return nextIndex < files.length ? nextIndex : prevIndex;
      });
    }
  }, [files, getNextQuiz, showQuiz, showChoice]);

  // 이전 파일로 이동
  const prevFile = useCallback(() => {
    // 사용자 상호작용 기록
    setUserInteracted(true);
    
    if (files.length > 0) {
      setCurrentIndex((prevIndex) => {
        let newIndex = prevIndex - 1;
        
        // 이전 아이템이 퀴즈나 선택지라면 건너뛰기
        if (newIndex >= 0) {
          const prevItem = files[newIndex];
          if (typeof prevItem === 'object' && (prevItem.type === 'quiz' || prevItem.type === 'choice')) {
            newIndex = newIndex - 1;
          }
        }
        
        return newIndex >= 0 ? newIndex : prevIndex;
      });
    }
  }, [files]);

  // 선택지 선택 처리
  const handleChoiceSelect = useCallback((choiceData, selectedChoiceId) => {
    const selectedChoice = choiceData.choice.choices.find(c => c.id === selectedChoiceId);
    
    if (selectedChoice && selectedChoice.results) {
      const resultImage = selectedChoice.results;
      
      // 1. files 배열에 결과 이미지를 현재 위치 다음에 삽입
      const newFiles = [...files];
      newFiles.splice(currentIndex + 1, 0, resultImage);
      setFiles(newFiles);
      
      // 2. 새로 삽입된 이미지로 바로 이동
      setCurrentIndex(currentIndex + 1);
      
    } else {
      // 결과 이미지가 없는 경우, 그냥 다음으로 이동
      nextFile();
    }

    // 3. 백그라운드에서 서버에 선택 결과 저장 (기존 로직 유지)
    const choiceId = `choice_${choiceData.choiceIndex}`;
    axios.post(`${API_BASE_URL}/api/save-choice`, {
      choice_id: choiceId,
      selected_id: selectedChoiceId,
      choice_index: choiceData.choiceIndex
    })
    .then(response => {
      if (response.data.cacheData) {
        saveToBrowserCache(response.data.cacheData);
        setChoiceAnswers(response.data.cacheData.userChoices.choices);
      }
      console.log('선택지 저장 완료 (백그라운드)');
    })
    .catch(error => {
      console.error('선택지 저장 실패 (백그라운드):', error);
    });
  }, [files, nextFile, saveToBrowserCache]);

  // 퀴즈 답변 처리
  const handleQuizSubmit = useCallback(async (quizData, selectedOption) => {
    const nextQuiz = getNextQuiz();
    if (nextQuiz) {
      try {
        // 서버로 퀴즈 답변 저장
        await axios.post(`${API_BASE_URL}/api/save-quiz-answer`, {
          quiz_item: nextQuiz.quiz,
          selected_option_index: selectedOption
        });
        
        // 로컬 상태에도 저장
        setQuizAnswers(prev => ({
          ...prev,
          [nextQuiz.quizIndex]: selectedOption
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
          [nextQuiz.quizIndex]: selectedOption
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
    if (showQuiz || showChoice) return;
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    if (showQuiz || showChoice) return;
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (showQuiz || showChoice) return;
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
    if (showQuiz || showChoice) return;
    setMouseDown(true);
    setMouseEnd(null);
    setMouseStart(e.clientX);
  };

  const onMouseMove = (e) => {
    if (showQuiz || showChoice) return;
    if (!mouseDown) return;
    setMouseEnd(e.clientX);
  };

  const onMouseUp = () => {
    if (showQuiz || showChoice) return;
    if (!mouseStart || !mouseEnd) {
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
    if (showQuiz || showChoice) return;
    if (mouseDown) {
      onMouseUp();
    }
  };

  // 키보드 이벤트 처리
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (showQuiz || showChoice) return;

      if (event.key === 'ArrowRight') {
        nextFile();
      } else if (event.key === 'ArrowLeft') {
        prevFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [nextFile, prevFile, showQuiz, showChoice]);

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
                onClick={() => handleQuizSubmit(quizData, index)}
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

  // 선택지 화면 렌더링
  const renderChoiceScreen = (choiceData, choiceIndex) => {
    const backgroundUrl = `${API_BASE_URL}/static/${safeEncodeURI(choiceData.background)}`;

    const handleImageClick = (e, choice) => {
      e.stopPropagation();
      handleChoiceSelect({ choice: choiceData, choiceIndex }, choice.id);
    };

    return (
      <div className="choice-screen">
        <img src={backgroundUrl} alt="배경" className="choice-background" />
        <h2 className="choice-question">{choiceData.question}</h2>
        <div className="choice-container">
          {choiceData.choices.map((choice) => {
            const imageUrl = `${API_BASE_URL}/static/${safeEncodeURI(choice.image)}`;
            const positionStyle = {
              left: `${choice.position.x * 100}%`,
              top: `${choice.position.y * 100}%`,
              width: `${choice.size.width * 100}%`,
              height: `${choice.size.height * 100}%`,
              transform: 'translate(-50%, -50%)'
            };
            
            return (
              <div
                key={choice.id}
                className="choice-item"
                style={positionStyle}
                onClick={(e) => handleImageClick(e, choice)}
              >
                <img src={imageUrl} alt={`선택 ${choice.id}`} className="choice-image" />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 현재 콘텐츠 렌더링
  const renderContent = () => {
    if (loading) return <div className="loading-screen">
      {preloading ? 
        '🚀 모든 미디어 완전 로딩 중... 잠시만 기다려주세요!' : 
        '파일 목록을 불러오는 중...'
      }
    </div>;
    if (error) return <div className="error-screen">{error}</div>;

    const currentItem = files[currentIndex];
    
    // choice 타입일 경우, 전용 렌더링 로직 실행
    if (typeof currentItem === 'object' && currentItem.type === 'choice') {
      return renderChoiceScreen(currentItem, currentIndex);
    }
    
    // 퀴즈 타입은 이전 이미지를 배경으로 사용해야 하므로, 팝업만 띄우고 배경은 일반 미디어로 렌더링
    if (typeof currentItem === 'object' && currentItem.type === 'quiz') {
      for (let i = currentIndex - 1; i >= 0; i--) {
        const prevItem = files[i];
        if (typeof prevItem === 'string') {
          return renderMedia(prevItem);
        }
      }
    }
    
    // 문자열(이미지/비디오) 또는 기타 객체 타입 렌더링
    if (typeof currentItem === 'string') {
      return renderMedia(currentItem);
    }
    
    return <div className="loading-screen">콘텐츠를 표시할 수 없습니다.</div>;
  };

  // 미디어 파일(이미지/비디오) 렌더링
  const renderMedia = (fileName) => {
    const preloadedItem = preloadedMedia.get(fileName);
    
    // 프리로딩이 완료된 경우 즉시 표시, 아니면 로딩 메시지
    if (!preloadedItem || !preloadedItem.preloaded) {
      return (
        <div className="media-loading">
          <div className="loading-spinner">⏳</div>
          <div>미디어 준비 중...</div>
        </div>
      );
    }
    
    switch (getFileType(fileName)) {
      case 'image':
        // 프리로딩된 이미지 요소 직접 복제해서 사용 (즉시 표시)
        const preloadedImg = preloadedItem.element;
        return (
          <img 
            src={preloadedImg.src}
            alt={fileName}
            className="media-content"
            style={{ 
              filter: 'none',
              opacity: 1,
              transition: 'opacity 0.2s ease'
            }}
            onLoad={() => {
              console.log(`🚀 프리로딩된 이미지 즉시 표시: ${fileName}`);
            }}
          />
        );
        
      case 'video':
        // 프리로딩된 비디오 설정 사용
        return (
          <video 
            src={`${API_BASE_URL}/static/${safeEncodeURI(fileName)}`}
            controls
            autoPlay={userInteracted}
            muted={userInteracted}
            loop
            className="media-content"
            preload="auto"
            style={{ 
              filter: 'none',
              opacity: 1,
              transition: 'opacity 0.2s ease'
            }}
            onClick={(e) => {
              // 동영상 클릭 시 음소거 해제하고 재생
              e.target.muted = false;
              if (e.target.paused) {
                e.target.play().catch(console.error);
              }
            }}
            onLoadedData={(e) => {
              console.log(`🚀 프리로딩된 비디오 즉시 재생 가능: ${fileName}`);
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
              src={`${API_BASE_URL}/static/${safeEncodeURI(fileName)}`} 
              controls
              className="audio-player"
              preload="auto"
            />
          </div>
        );
        
      default:
        return <div className="unsupported">지원하지 않는 파일 형식입니다.</div>;
    }
  };

  if (files.length === 0) {
    return (
      <div className="app">
        <div className="no-files">contents 폴더에 미디어 파일이 없습니다.</div>
      </div>
    );
  }

  return (
    <>
    <style>{`
      .popup-overlay {
        background-color: rgba(255, 255, 255, 0.2);
        transform: translateY(-2px);
      }
    `}</style>
    <div
      className="app"
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
    </>
  );
}

export default App; 