import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

function App() {
  const [files, setFiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userInteracted, setUserInteracted] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  
  // 상태 관리
  const [showQuiz, setShowQuiz] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const [showCrossroad, setShowCrossroad] = useState(false);
  const [showChoiceSummary, setShowChoiceSummary] = useState(false);
  
  // 답변 저장
  const [quizAnswers, setQuizAnswers] = useState({});
  const [choiceAnswers, setChoiceAnswers] = useState({});
  
  // 오디오 관련 상태
  const [soundSections, setSoundSections] = useState([]);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [currentAudioRef, setCurrentAudioRef] = useState(null);
  
  // 이미지 프리로딩 관련 상태
  const [preloadedImages, setPreloadedImages] = useState(new Set());
  const [imageCache, setImageCache] = useState(new Map());

  // 파일 타입 확인
  const getFileType = useCallback((filename) => {
    const ext = filename.toLowerCase().split('.').pop();
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'avi', 'mov', 'wmv', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    return 'unknown';
  }, []);

  // WebP 지원 확인
  const supportsWebP = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  }, []);

  // 최적화된 이미지 URL 생성
  const getOptimizedImageUrl = useCallback((fileName) => {
    const basePath = `/contents/${fileName}`;
    const ext = fileName.toLowerCase().split('.').pop();
    
    // WebP를 지원하고 원본이 PNG/JPG인 경우 WebP 버전 시도
    if (supportsWebP() && ['png', 'jpg', 'jpeg'].includes(ext)) {
      const webpPath = basePath.replace(/\.(png|jpg|jpeg)$/i, '.webp');
      return { primary: webpPath, fallback: basePath };
    }
    
    return { primary: basePath, fallback: null };
  }, [supportsWebP]);

  // 이미지 프리로딩 함수 (WebP 지원)
  const preloadImage = useCallback((fileName) => {
    return new Promise((resolve, reject) => {
      if (preloadedImages.has(fileName)) {
        resolve(imageCache.get(fileName));
        return;
      }

      const { primary, fallback } = getOptimizedImageUrl(fileName);
      const img = new Image();
      
      const tryLoadImage = (url, isFallback = false) => {
        img.onload = () => {
          setPreloadedImages(prev => new Set([...prev, fileName]));
          setImageCache(prev => new Map([...prev, [fileName, img]]));
          resolve(img);
        };
        
        img.onerror = () => {
          if (!isFallback && fallback) {
            // WebP 실패 시 원본 이미지로 fallback
            tryLoadImage(fallback, true);
          } else {
            console.warn(`이미지 프리로드 실패: ${fileName}`);
            reject(new Error(`Failed to preload ${fileName}`));
          }
        };
        
        img.src = url;
      };
      
      tryLoadImage(primary);
    });
  }, [preloadedImages, imageCache, getOptimizedImageUrl]);

  // 다음 이미지들 프리로딩
  const preloadNextImages = useCallback(async () => {
    if (!files.length) return;
    
    const imagesToPreload = [];
    const preloadRange = 3; // 다음 3개 이미지까지 프리로드
    
    for (let i = currentIndex + 1; i <= Math.min(currentIndex + preloadRange, files.length - 1); i++) {
      const file = files[i];
      
      if (typeof file === 'string' && getFileType(file) === 'image') {
        imagesToPreload.push(file);
      } else if (typeof file === 'object') {
        // choice나 다른 객체 타입에서 이미지 추출
        if (file.background && getFileType(file.background) === 'image') {
          imagesToPreload.push(file.background);
        }
        if (file.choices) {
          file.choices.forEach(choice => {
            if (choice.image && getFileType(choice.image) === 'image') {
              imagesToPreload.push(choice.image);
            }
            if (choice.results && getFileType(choice.results) === 'image') {
              imagesToPreload.push(choice.results);
            }
          });
        }
      }
    }
    
    // 중복 제거 및 이미 로드된 이미지 제외
    const uniqueImages = [...new Set(imagesToPreload)].filter(img => !preloadedImages.has(img));
    
    if (uniqueImages.length > 0) {
      // 서비스 워커에 프리로딩 요청
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const imageUrls = uniqueImages.map(img => `/contents/${img}`);
        navigator.serviceWorker.controller.postMessage({
          type: 'PRELOAD_IMAGES',
          urls: imageUrls
        });
      }
      
      // 병렬로 프리로드 (최대 3개씩)
      const batchSize = 3;
      for (let i = 0; i < uniqueImages.length; i += batchSize) {
        const batch = uniqueImages.slice(i, i + batchSize);
        try {
          await Promise.allSettled(batch.map(img => preloadImage(img)));
        } catch (error) {
          console.warn('이미지 프리로드 배치 실패:', error);
        }
      }
    }
  }, [files, currentIndex, getFileType, preloadImage, preloadedImages]);

  // 현재 인덱스 변경 시 다음 이미지들 프리로드
  useEffect(() => {
    if (testStarted) {
      preloadNextImages();
    }
  }, [currentIndex, testStarted, preloadNextImages]);

  // 파일 로드 (간소화)
  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/contents/order.json');
      const data = await response.json();
      const loadedFiles = data.order || [];
      setFiles(loadedFiles);
      setSoundSections(data.soundSections || []); // soundSections 로드
      
      // 첫 번째 이미지 즉시 프리로드
      if (loadedFiles.length > 0) {
        const firstFile = loadedFiles[0];
        if (typeof firstFile === 'string' && getFileType(firstFile) === 'image') {
          preloadImage(firstFile).catch(console.warn);
        } else if (typeof firstFile === 'object' && firstFile.background) {
          preloadImage(firstFile.background).catch(console.warn);
        }
      }
      
      setError(null);
    } catch (err) {
      setError('파일을 불러오는데 실패했습니다.');
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  }, [getFileType, preloadImage]);

  useEffect(() => {
    loadFiles();
    
    // 서비스 워커 등록
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('서비스 워커 등록 성공:', registration);
        })
        .catch((error) => {
          console.log('서비스 워커 등록 실패:', error);
        });
    }
  }, [loadFiles]);

  // 컴포넌트 언마운트 시 오디오 정리
  useEffect(() => {
    return () => {
      if (currentAudioRef) {
        currentAudioRef.pause();
        currentAudioRef.currentTime = 0;
      }
    };
  }, [currentAudioRef]);

  // 오디오 초기화
  useEffect(() => {
    if (userInteracted && !audioInitialized) {
      setAudioInitialized(true);
    }
  }, [userInteracted, audioInitialized]);

  // 현재 인덱스에 따른 배경음 재생
  useEffect(() => {
    if (!audioInitialized || !soundSections.length || !testStarted) return;

    // 현재 인덱스에 해당하는 사운드 섹션 찾기
    const currentSection = soundSections.find(section => {
      const start = section.start;
      const end = section.end === -1 ? files.length - 1 : section.end;
      return currentIndex >= start && currentIndex <= end;
    });

    // 현재 섹션의 사운드가 바뀌었을 때만 처리
    const newSoundFile = currentSection ? currentSection.sound : null;
    
    if (newSoundFile !== currentAudio) {
      // 이전 오디오 정리
      if (currentAudioRef) {
        currentAudioRef.pause();
        currentAudioRef.currentTime = 0;
        setCurrentAudioRef(null);
      }

      setCurrentAudio(newSoundFile);

      // 새 오디오 재생 (음소거가 아닐 때만)
      if (newSoundFile && !isMuted) {
        const audio = new Audio(`/contents/sounds/${newSoundFile}`);
        audio.loop = true;
        audio.volume = 0.3;
        
        audio.play().then(() => {
          setCurrentAudioRef(audio);
          console.log(`사운드 재생 시작: ${newSoundFile} (인덱스: ${currentIndex})`);
        }).catch(error => {
          console.log('오디오 재생 실패:', error);
        });
      }
    }
  }, [currentIndex, audioInitialized, soundSections, currentAudio, isMuted, testStarted, files.length, currentAudioRef]);

  // 음소거 토글
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      
      if (newMuted) {
        // 음소거 - 현재 재생 중인 오디오 일시정지
        if (currentAudioRef) {
          currentAudioRef.pause();
        }
      } else {
        // 음소거 해제 - 현재 섹션의 오디오 재생
        if (currentAudio && !currentAudioRef) {
          const audio = new Audio(`/contents/sounds/${currentAudio}`);
          audio.loop = true;
          audio.volume = 0.3;
          
          audio.play().then(() => {
            setCurrentAudioRef(audio);
            console.log(`음소거 해제 - 사운드 재생: ${currentAudio}`);
          }).catch(error => {
            console.log('오디오 재생 실패:', error);
          });
        } else if (currentAudioRef) {
          // 이미 오디오 객체가 있으면 재생 재개
          currentAudioRef.play().catch(error => {
            console.log('오디오 재생 재개 실패:', error);
          });
        }
      }
      
      return newMuted;
    });
  }, [currentAudio, currentAudioRef]);

  // 현재 아이템 상태 관리 (간소화)
  useEffect(() => {
    if (!testStarted || !files.length || currentIndex >= files.length) return;

    const currentItem = files[currentIndex];
    
    // 모든 상태 초기화
    setShowQuiz(false);
    setShowChoice(false);
    setShowCrossroad(false);
    setShowChoiceSummary(false);

    if (typeof currentItem === 'object' && currentItem.type) {
      switch (currentItem.type) {
        case 'quiz':
          setShowQuiz(true);
          break;
        case 'choice':
          setShowChoice(true);
          break;
        case 'crossroad':
          // crossroad 화면 표시 (자동으로 넘어가지 않음)
          setShowCrossroad(true);
          break;
        case 'choice_summary':
          setShowChoiceSummary(true);
          break;
        default:
          break;
      }
    }
  }, [currentIndex, files, testStarted]);

  // 네비게이션
  const nextFile = useCallback(() => {
    setUserInteracted(true);
    if (showQuiz || showChoice || showCrossroad || showChoiceSummary) return;
    setCurrentIndex(prev => Math.min(prev + 1, files.length - 1));
  }, [files.length, showQuiz, showChoice, showCrossroad, showChoiceSummary]);

  const prevFile = useCallback(() => {
    setUserInteracted(true);
    if (showQuiz || showChoice || showCrossroad || showChoiceSummary) return;
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  }, [showQuiz, showChoice, showCrossroad, showChoiceSummary]);

  // 퀴즈 처리 (간소화)
  const handleQuizSubmit = useCallback((quizData, selectedOption) => {
    const quizIndex = currentIndex;
    
    // 로컬 스토리지에 저장
    const quizResult = {
      quiz_number: quizIndex + 1,
      question: quizData.question,
      selected_option_index: selectedOption,
      selected_option: quizData.options[selectedOption] || '',
      timestamp: new Date().toISOString()
    };
    
    try {
      const existingResults = JSON.parse(localStorage.getItem('skSiltronQuizResults') || '{"results": []}');
      existingResults.results = existingResults.results.filter(r => r.quiz_number !== quizResult.quiz_number);
      existingResults.results.push(quizResult);
      localStorage.setItem('skSiltronQuizResults', JSON.stringify(existingResults));
    } catch (error) {
      console.error('퀴즈 답변 저장 실패:', error);
    }
    
    setQuizAnswers(prev => ({ ...prev, [quizIndex]: selectedOption }));
    
    setTimeout(() => {
      setShowQuiz(false);
      setCurrentIndex(prev => Math.min(prev + 1, files.length - 1));
    }, 1000);
  }, [currentIndex]);

  // 선택지 처리 (간소화)
  const handleChoiceSelect = useCallback((choiceData, selectedChoiceId, choiceArrayIndex) => {
    const selectedChoice = choiceData.choices[choiceArrayIndex];
    
    if (!selectedChoice || selectedChoice.id !== selectedChoiceId) {
      console.error('Choice mismatch!');
      return;
    }
    
    // 선택 답변 저장
    setChoiceAnswers(prev => {
      const newAnswers = { ...prev };
      choiceData.choices.forEach(choice => {
        delete newAnswers[choice.id];
      });
      return { ...newAnswers, [selectedChoiceId]: selectedChoiceId };
    });
    
    // 로컬 스토리지에 저장
    const cacheData = {
      userChoices: {
        timestamp: new Date().toISOString(),
        choices: { [`choice_${currentIndex}`]: selectedChoiceId }
      }
    };
    
    try {
      localStorage.setItem('skSiltronChoices', JSON.stringify(cacheData));
    } catch (error) {
      console.error('선택지 저장 실패:', error);
    }
    
    // 결과 이미지가 있으면 다음에 삽입
    if (selectedChoice.results) {
      const newFiles = [...files];
      newFiles.splice(currentIndex + 1, 0, selectedChoice.results);
      setFiles(newFiles);
    }
    
    setShowChoice(false);
    setCurrentIndex(prev => Math.min(prev + 1, files.length - 1));
  }, [currentIndex, files]);

  // 키보드 이벤트
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (showQuiz || showChoice || showCrossroad || showChoiceSummary) return;
      if (event.key === 'ArrowRight') nextFile();
      else if (event.key === 'ArrowLeft') prevFile();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextFile, prevFile, showQuiz, showChoice, showCrossroad, showChoiceSummary]);

  // 터치 이벤트 (간소화)
  const handleTouchStart = (e) => {
    if (showQuiz || showChoice || showCrossroad || showChoiceSummary) return;
    const touchX = e.touches[0].clientX;
    
    const handleTouchEnd = (endEvent) => {
      const endX = endEvent.changedTouches[0].clientX;
      const diff = touchX - endX;
      
      if (Math.abs(diff) > 50) {
        if (diff > 0) nextFile();
        else prevFile();
      }
      
      document.removeEventListener('touchend', handleTouchEnd);
    };
    
    document.addEventListener('touchend', handleTouchEnd);
  };

  // 렌더링 함수들
  const renderMedia = (fileName) => {
    const fileType = getFileType(fileName);
    
    if (fileType === 'image') {
      const isPreloaded = preloadedImages.has(fileName);
      const { primary: optimizedUrl, fallback: fallbackUrl } = getOptimizedImageUrl(fileName);
      
      return (
        <div className="image-container">
          {!isPreloaded && (
            <div className="image-loading">
              <div className="loading-spinner"></div>
              <span>이미지 로딩 중...</span>
            </div>
          )}
          <picture>
            {fallbackUrl && (
              <source srcSet={optimizedUrl} type="image/webp" />
            )}
            <img 
              src={fallbackUrl || optimizedUrl}
              alt={fileName} 
              className={`media-content ${isPreloaded ? 'loaded' : 'loading'}`}
              loading="eager"
              onLoad={() => {
                if (!preloadedImages.has(fileName)) {
                  setPreloadedImages(prev => new Set([...prev, fileName]));
                }
              }}
              onError={(e) => {
                // WebP 실패 시 fallback 이미지로 전환
                if (fallbackUrl && e.target.src !== fallbackUrl) {
                  e.target.src = fallbackUrl;
                }
              }}
              style={{
                opacity: isPreloaded ? 1 : 0,
                transition: 'opacity 0.3s ease-in-out'
              }}
            />
          </picture>
        </div>
      );
    } else if (fileType === 'video') {
      const fileUrl = `/contents/${fileName}`;
      return (
        <video 
          key={fileName} // 파일이 바뀔 때마다 새로운 비디오 엘리먼트 생성
          controls 
          autoPlay
          muted
          playsInline
          preload="auto"
          className="media-content"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
          onError={(e) => {
            console.error('비디오 로딩 에러:', e.target.error);
            console.error('비디오 파일 경로:', fileUrl);
            console.error('에러 코드:', e.target.error?.code);
            console.error('에러 메시지:', e.target.error?.message);
            
            // 파일 존재 여부 확인
            fetch(fileUrl, { method: 'HEAD' })
              .then(response => {
                if (!response.ok) {
                  console.error('파일이 존재하지 않습니다:', fileUrl);
                } else {
                  console.log('파일은 존재하지만 재생할 수 없습니다:', fileUrl);
                  console.log('Content-Type:', response.headers.get('content-type'));
                }
              })
              .catch(err => console.error('파일 확인 실패:', err));
          }}
          onLoadStart={() => {
            console.log('비디오 로딩 시작:', fileUrl);
          }}
          onLoadedMetadata={(e) => {
            console.log('비디오 메타데이터 로딩 완료:', fileUrl);
            console.log('비디오 길이:', e.target.duration);
            console.log('비디오 크기:', e.target.videoWidth, 'x', e.target.videoHeight);
          }}
          onLoadedData={() => {
            console.log('비디오 데이터 로딩 완료:', fileUrl);
          }}
          onCanPlay={(e) => {
            console.log('비디오 재생 준비 완료:', fileUrl);
            console.log('비디오 준비 상태:', e.target.readyState);
            console.log('비디오 일시정지 상태:', e.target.paused);
            console.log('비디오 음소거 상태:', e.target.muted);
            
            // 재생 시도
            const playPromise = e.target.play();
            if (playPromise !== undefined) {
              playPromise.then(() => {
                console.log('비디오 자동 재생 성공:', fileUrl);
              }).catch(error => {
                console.error('자동 재생 실패:', error);
                console.error('에러 이름:', error.name);
                console.error('에러 메시지:', error.message);
                
                // 사용자 상호작용 후 재시도
                if (error.name === 'NotAllowedError') {
                  console.log('사용자 상호작용이 필요합니다. 클릭 후 재생됩니다.');
                  
                  // 사용자 클릭 이벤트 리스너 추가
                  const handleUserClick = () => {
                    e.target.play().then(() => {
                      console.log('사용자 클릭 후 비디오 재생 성공:', fileUrl);
                    }).catch(err => {
                      console.error('사용자 클릭 후에도 재생 실패:', err);
                    });
                    document.removeEventListener('click', handleUserClick);
                  };
                  document.addEventListener('click', handleUserClick, { once: true });
                }
              });
            }
          }}
          onPlay={() => {
            console.log('비디오 재생 시작:', fileUrl);
          }}
          onPause={() => {
            console.log('비디오 일시정지:', fileUrl);
          }}
          onEnded={() => {
            console.log('비디오 재생 완료:', fileUrl);
          }}
          onTimeUpdate={(e) => {
            // 재생 시간 업데이트 (5초마다만 로그)
            const currentTime = Math.floor(e.target.currentTime);
            if (currentTime % 5 === 0 && currentTime !== Math.floor(e.target.currentTime - 1)) {
              console.log(`비디오 재생 중: ${currentTime}초 / ${Math.floor(e.target.duration)}초`);
            }
          }}
          onClick={(e) => {
            console.log('비디오 클릭됨');
            // 비디오 클릭 시 사용자 상호작용으로 간주하고 재생 시도
            if (!userInteracted) {
              setUserInteracted(true);
            }
            
            // 일시정지 상태라면 재생 시도
            if (e.target.paused) {
              e.target.play().then(() => {
                console.log('클릭으로 비디오 재생 시작:', fileUrl);
              }).catch(error => {
                console.error('클릭 재생 실패:', error);
              });
            }
          }}
        >
          <source src={fileUrl} type="video/webm" />
          <source src={fileUrl.replace('.webm', '.mp4')} type="video/mp4" />
          브라우저가 비디오를 지원하지 않습니다.
        </video>
      );
    }
    
    return <div className="media-content">지원하지 않는 파일 형식입니다.</div>;
  };

  const renderQuiz = (quizData) => {
    const selectedAnswer = quizAnswers[currentIndex];
    
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

  const renderChoice = (choiceData) => {
    const isBackgroundPreloaded = preloadedImages.has(choiceData.background);
    
    return (
      <div className="choice-screen">
        {!isBackgroundPreloaded && (
          <div className="choice-loading">
            <div className="loading-spinner"></div>
            <span>배경 이미지 로딩 중...</span>
          </div>
        )}
        <img 
          src={`/contents/${choiceData.background}`} 
          alt="배경" 
          className={`choice-background ${isBackgroundPreloaded ? 'loaded' : 'loading'}`}
          loading="eager"
          onLoad={() => {
            if (!preloadedImages.has(choiceData.background)) {
              setPreloadedImages(prev => new Set([...prev, choiceData.background]));
            }
          }}
          style={{
            opacity: isBackgroundPreloaded ? 1 : 0,
            transition: 'opacity 0.3s ease-in-out'
          }}
        />
        {choiceData.choices.map((choice, index) => {
          // 정사각형 배경 기준으로 위치와 크기 계산
          const squareSize = Math.min(window.innerWidth, window.innerHeight);
          const offsetX = (window.innerWidth - squareSize) / 2;
          const offsetY = (window.innerHeight - squareSize) / 2;
          
          // 선택지 위치와 크기 계산
          const left = offsetX + (choice.position.x * squareSize);
          const top = offsetY + (choice.position.y * squareSize);
          const width = choice.size.width * squareSize; // 정사각형 배경 대비 비율로 적용
          const height = choice.size.height * squareSize;
          
          const isChoiceImagePreloaded = preloadedImages.has(choice.image);
          
          return (
            <img
              key={choice.id}
              src={`/contents/${choice.image}`}
              alt={choice.id}
              className={`choice-option choice-option-${index} ${isChoiceImagePreloaded ? 'loaded' : 'loading'}`}
              loading="eager"
              onLoad={() => {
                if (!preloadedImages.has(choice.image)) {
                  setPreloadedImages(prev => new Set([...prev, choice.image]));
                }
              }}
              style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
                zIndex: 10 + index,
                // 이미지 원본 비율 유지하면서 order.json의 size 비율 그대로 적용
                maxWidth: `${width}px`,
                maxHeight: `${height}px`,
                width: 'auto',
                height: 'auto',
                transition: 'transform 0.3s ease, opacity 0.3s ease-in-out',
                display: 'block',
                opacity: isChoiceImagePreloaded ? 1 : 0.3
              }}
              onClick={() => handleChoiceSelect(choiceData, choice.id, index)}
              onMouseEnter={(e) => {
                if (isChoiceImagePreloaded) {
                  e.target.style.transform = 'translate(-50%, -50%) scale(1.1)';
                  e.target.style.zIndex = 100;
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translate(-50%, -50%) scale(1)';
                e.target.style.zIndex = 10 + index;
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderCrossroad = (crossroadData) => {
    const handlePrevious = () => {
      // previousText 클릭 시 - 이전 choice로 돌아가기
      const lastChoiceIndex = files.findLastIndex((file, index) => 
        index < currentIndex && typeof file === 'object' && file.type === 'choice'
      );
      
      if (lastChoiceIndex !== -1) {
        // choice 결과 이미지 제거 (있다면)
        const newFiles = [...files];
        const choiceItem = files[lastChoiceIndex];
        
        // choice 다음에 결과 이미지가 있는지 확인하고 제거
        if (lastChoiceIndex + 1 < files.length) {
          const nextItem = files[lastChoiceIndex + 1];
          if (typeof nextItem === 'string' && choiceItem.choices) {
            const isResultImage = choiceItem.choices.some(choice => choice.results === nextItem);
            if (isResultImage) {
              newFiles.splice(lastChoiceIndex + 1, 1);
              setFiles(newFiles);
            }
          }
        }
        
        setCurrentIndex(lastChoiceIndex);
        setShowCrossroad(false);
      }
    };
    
    const handleNext = () => {
      // nextText 클릭 시 - 다음으로 이동
      setShowCrossroad(false);
      setCurrentIndex(prev => Math.min(prev + 1, files.length - 1));
    };
    
    return (
      <div className="crossroad-overlay">
        <div className="crossroad-popup">
          <h2>{crossroadData.question}</h2>
          <div className="crossroad-buttons">
            <button 
              className="crossroad-button previous"
              onClick={handlePrevious}
            >
              {crossroadData.previousText}
            </button>
            <button 
              className="crossroad-button next"
              onClick={handleNext}
            >
              {crossroadData.nextText}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderChoiceSummary = () => {
    // 장소와 아이템 이름 매핑
    const locationMap = {
      'fap': '팹',
      'emergency': '상황실',
      'promote': '홍보실',
      'QC': 'QC',
      'research': '연구실',
      'tech': '공정기술실'
    };

    const itemMap = {
      'eye': '눈',
      'hammer': '망치',
      'book': '책',
      'note': '노트',
      'hands': '악수',
      'pallete': '팔레트'
    };

    // 선택된 아이템들의 결과 이미지 경로를 찾기
    const collectedItems = [];
    
    // files 배열에서 choice 타입을 찾아서 선택된 아이템의 results 이미지를 수집
    files.forEach(file => {
      if (typeof file === 'object' && file.type === 'choice' && file.choices) {
        file.choices.forEach(choice => {
          if (choiceAnswers[choice.id] && choice.results) {
            const [location, item] = choice.id.split('_'); // 'fap_eye' -> ['fap', 'eye']
            const locationName = locationMap[location] || location;
            const itemName = itemMap[item] || item;
            
            collectedItems.push({
              id: choice.id,
              image: choice.results,
              location: locationName,
              item: itemName,
              displayName: `${locationName} / ${itemName}`
            });
          }
        });
      }
    });

    return (
      <div className="choice-summary-overlay">
        <div className="choice-summary-popup">
          <h2>당신이 선택한 아이템들</h2>
          <p>여정을 통해 수집한 소중한 아이템들입니다.</p>
          <div className="collected-items">
            {collectedItems.length > 0 ? (
              collectedItems.map((item, index) => (
                <div key={item.id} className="collected-item">
                  <img 
                    src={`/contents/${item.image}`} 
                    alt={item.displayName}
                    className="collected-item-image"
                  />
                  <span className="collected-item-location">{item.location}</span>
                  <span className="collected-item-name">{item.item}</span>
                </div>
              ))
            ) : (
              <p>선택된 아이템이 없습니다.</p>
            )}
          </div>

        </div>
      </div>
    );
  };

  // 시작 화면
  const renderStartScreen = (startData) => (
    <div className="start-screen">
      <img src={`/contents/${startData.background}`} alt="배경" className="start-background" />
      <div className="start-content">
        <h1>{startData.title}</h1>
        <p>{startData.subtitle}</p>
        <button 
          className="start-button"
          onClick={() => {
            setTestStarted(true);
            setUserInteracted(true);
            setCurrentIndex(1);
          }}
        >
          {startData.buttonText}
        </button>
      </div>
    </div>
  );

  // 메인 렌더링
  if (loading) {
    return <div className="loading">로딩 중...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!files.length) {
    return <div className="error">파일이 없습니다.</div>;
  }

  const currentItem = files[currentIndex];

  return (
    <div className="app" onTouchStart={handleTouchStart}>
      <div className="media-container">
        {/* 시작 화면 */}
        {!testStarted && typeof currentItem === 'object' && currentItem.type === 'start_button' && 
          renderStartScreen(currentItem)
        }
        
        {/* 일반 미디어 */}
        {testStarted && typeof currentItem === 'string' && renderMedia(currentItem)}
        
        {/* 퀴즈 */}
        {showQuiz && typeof currentItem === 'object' && currentItem.type === 'quiz' && 
          renderQuiz(currentItem)
        }
        
        {/* 선택지 */}
        {showChoice && typeof currentItem === 'object' && currentItem.type === 'choice' && 
          renderChoice(currentItem)
        }
        
        {/* 교차로 */}
        {showCrossroad && typeof currentItem === 'object' && currentItem.type === 'crossroad' && 
          renderCrossroad(currentItem)
        }
        
        {/* 선택 요약 */}
        {showChoiceSummary && renderChoiceSummary()}
      </div>
      
      {/* 음소거 버튼 */}
      {testStarted && (
        <button 
          className="mute-button"
          onClick={toggleMute}
          title={isMuted ? "음소거 해제" : "음소거"}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      )}
      
      {/* 네비게이션 버튼 */}
      {testStarted && !showQuiz && !showChoice && !showCrossroad && !showChoiceSummary && (
        <div className="navigation">
          <button onClick={prevFile} disabled={currentIndex === 0}>이전</button>
          <span>{currentIndex + 1} / {files.length}</span>
          <button onClick={nextFile} disabled={currentIndex === files.length - 1}>다음</button>
        </div>
      )}
    </div>
  );
}

export default App;