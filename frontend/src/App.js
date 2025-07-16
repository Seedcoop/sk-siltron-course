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
  
  // 프리로딩 관련 상태
  const [preloadedImages, setPreloadedImages] = useState(new Set());
  
  // 오디오 프리로딩 및 캐싱
  const [audioCache, setAudioCache] = useState(new Map());

  // 모바일 감지
  const isMobile = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768;
  }, []);

  // 파일 타입 확인
  const getFileType = useCallback((filename) => {
    const ext = filename.toLowerCase().split('.').pop();
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'avi', 'mov', 'wmv', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    return 'unknown';
  }, []);

  // 이미지 프리로딩 함수
  const preloadImage = useCallback((fileName) => {
    return new Promise((resolve, reject) => {
      if (preloadedImages.has(fileName)) {
        resolve(fileName);
        return;
      }

      const img = new Image();
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout loading ${fileName}`));
      }, 5000);
      
      img.onload = () => {
        clearTimeout(timeoutId);
        setPreloadedImages(prev => new Set([...prev, fileName]));
        console.log(`✅ 프리로드 완료: ${fileName}`);
        resolve(fileName);
      };
      
      img.onerror = (error) => {
        clearTimeout(timeoutId);
        console.warn(`❌ 프리로드 실패: ${fileName}`, error);
        reject(new Error(`Failed to preload ${fileName}`));
      };
      
      img.src = `/contents/${fileName}`;
    });
  }, [preloadedImages]);

  // 다음 이미지들 프리로딩
  const preloadNextImages = useCallback(async (startIndex, count = 3) => {
    const imagesToPreload = [];
    
    for (let i = startIndex; i < Math.min(startIndex + count, files.length); i++) {
      const file = files[i];
      
      if (typeof file === 'string' && getFileType(file) === 'image') {
        imagesToPreload.push(file);
      } else if (typeof file === 'object') {
        // 배경 이미지
        if (file.background && getFileType(file.background) === 'image') {
          imagesToPreload.push(file.background);
        }
        // choice 이미지들
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
    
    // 중복 제거
    const uniqueImages = [...new Set(imagesToPreload)];
    
    if (uniqueImages.length > 0) {
      console.log(`🔄 다음 ${uniqueImages.length}개 이미지 프리로딩 시작:`, uniqueImages);
      
      // 병렬로 프리로딩 (모바일에서는 2개씩, PC에서는 3개씩)
      const batchSize = isMobile() ? 2 : 3;
      for (let i = 0; i < uniqueImages.length; i += batchSize) {
        const batch = uniqueImages.slice(i, i + batchSize);
        try {
          await Promise.allSettled(batch.map(img => preloadImage(img)));
          // 배치 간 짧은 대기
          if (i + batchSize < uniqueImages.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.warn('배치 프리로딩 실패:', error);
        }
      }
    }
  }, [files, getFileType, preloadImage, isMobile]);

  // 파일 로드
  useEffect(() => {
    const loadFiles = async () => {
      try {
        setLoading(true);
        const response = await fetch('/contents/order.json');
        const data = await response.json();
        const loadedFiles = data.order || [];
        setFiles(loadedFiles);
        setSoundSections(data.soundSections || []);
        setError(null);
      } catch (err) {
        setError('파일을 불러오는데 실패했습니다.');
        console.error('Error loading files:', err);
      } finally {
        setLoading(false);
      }
    };

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
  }, []);

  // 현재 인덱스 변경 시 다음 이미지들 프리로딩
  useEffect(() => {
    if (testStarted && files.length > 0 && currentIndex >= 0) {
      // 현재 인덱스 + 1부터 3개 이미지 프리로딩
      preloadNextImages(currentIndex + 1, 3);
    }
  }, [currentIndex, testStarted, files.length, preloadNextImages]);

  // 오디오 프리로딩 함수
  const preloadAudio = useCallback((soundFile) => {
    return new Promise((resolve, reject) => {
      if (audioCache.has(soundFile)) {
        resolve(audioCache.get(soundFile));
        return;
      }

      const audio = new Audio(`/contents/sounds/${soundFile}`);
      audio.loop = true;
      audio.volume = 0.3;
      audio.preload = 'auto';
      
      // 모바일에서 더 짧은 타임아웃
      const timeoutId = setTimeout(() => {
        reject(new Error(`Audio timeout: ${soundFile}`));
      }, isMobile() ? 3000 : 5000);
      
      audio.oncanplaythrough = () => {
        clearTimeout(timeoutId);
        setAudioCache(prev => new Map([...prev, [soundFile, audio]]));
        console.log(`🎵 오디오 프리로드 완료: ${soundFile}`);
        resolve(audio);
      };
      
      audio.onerror = (error) => {
        clearTimeout(timeoutId);
        console.warn(`❌ 오디오 프리로드 실패: ${soundFile}`, error);
        reject(error);
      };
      
      // 모바일에서 즉시 로드 시작
      audio.load();
    });
  }, [audioCache, isMobile]);

  // 오디오 초기화 및 프리로딩
  useEffect(() => {
    if (userInteracted && !audioInitialized) {
      setAudioInitialized(true);
      
      // 모든 사운드 파일 프리로딩 (모바일 최적화)
      if (soundSections.length > 0) {
        console.log('🎵 오디오 프리로딩 시작...');
        const uniqueSounds = [...new Set(soundSections.map(section => section.sound))];
        
        // 모바일에서는 순차적으로, PC에서는 병렬로 프리로딩
        if (isMobile()) {
          // 모바일: 순차 프리로딩 (메모리 절약)
          uniqueSounds.reduce((promise, sound) => {
            return promise.then(() => {
              return preloadAudio(sound).catch(error => {
                console.warn(`모바일 오디오 프리로딩 실패: ${sound}`, error);
              });
            });
          }, Promise.resolve());
        } else {
          // PC: 병렬 프리로딩
          Promise.allSettled(uniqueSounds.map(sound => preloadAudio(sound)));
        }
      }
    }
  }, [userInteracted, audioInitialized, soundSections, preloadAudio, isMobile]);

  // 배경음 재생 - 모바일 최적화
  useEffect(() => {
    if (!audioInitialized || !soundSections.length || !testStarted) return;

    const currentSection = soundSections.find(section => {
      const start = section.start;
      const end = section.end === -1 ? files.length - 1 : section.end;
      return currentIndex >= start && currentIndex <= end;
    });

    const newSoundFile = currentSection ? currentSection.sound : null;
    
    if (newSoundFile !== currentAudio) {
      // 이전 오디오 정리
      if (currentAudioRef) {
        currentAudioRef.pause();
        currentAudioRef.currentTime = 0;
        setCurrentAudioRef(null);
      }

      setCurrentAudio(newSoundFile);

      if (newSoundFile && !isMuted) {
        // 캐시된 오디오 사용 (모바일 최적화)
        const cachedAudio = audioCache.get(newSoundFile);
        
        if (cachedAudio) {
          // 캐시된 오디오 사용 - 즉시 재생
          cachedAudio.currentTime = 0;
          cachedAudio.play().then(() => {
            setCurrentAudioRef(cachedAudio);
            console.log(`🎵 캐시된 사운드 재생: ${newSoundFile}`);
          }).catch(error => {
            console.log('캐시된 오디오 재생 실패:', error);
            // 캐시 실패 시 새로 생성
            createAndPlayAudio(newSoundFile);
          });
        } else {
          // 캐시되지 않은 경우 새로 생성
          createAndPlayAudio(newSoundFile);
        }
      }
    }
  }, [currentIndex, audioInitialized, soundSections, currentAudio, isMuted, testStarted, files.length, currentAudioRef, audioCache]);

  // 새 오디오 생성 및 재생 함수
  const createAndPlayAudio = useCallback((soundFile) => {
    const audio = new Audio(`/contents/sounds/${soundFile}`);
    audio.loop = true;
    audio.volume = 0.3;
    
    // 모바일에서 더 빠른 재생을 위한 설정
    if (isMobile()) {
      audio.preload = 'auto';
      audio.load();
    }
    
    audio.play().then(() => {
      setCurrentAudioRef(audio);
      console.log(`🎵 새 사운드 재생: ${soundFile}`);
      
      // 재생 성공 시 캐시에 저장
      setAudioCache(prev => new Map([...prev, [soundFile, audio]]));
    }).catch(error => {
      console.log('오디오 재생 실패:', error);
    });
  }, [isMobile]);

  // 음소거 토글
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      
      if (newMuted) {
        if (currentAudioRef) {
          currentAudioRef.pause();
        }
      } else {
        if (currentAudio && !currentAudioRef) {
          const audio = new Audio(`/contents/sounds/${currentAudio}`);
          audio.loop = true;
          audio.volume = 0.3;
          
          audio.play().then(() => {
            setCurrentAudioRef(audio);
          }).catch(error => {
            console.log('오디오 재생 실패:', error);
          });
        } else if (currentAudioRef) {
          currentAudioRef.play().catch(error => {
            console.log('오디오 재생 재개 실패:', error);
          });
        }
      }
      
      return newMuted;
    });
  }, [currentAudio, currentAudioRef]);

  // 현재 아이템 상태 관리
  useEffect(() => {
    if (!testStarted || !files.length || currentIndex >= files.length) return;

    const currentItem = files[currentIndex];
    
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

  // 퀴즈 처리
  const handleQuizSubmit = useCallback((quizData, selectedOption) => {
    const quizIndex = currentIndex;
    
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

  // 선택지 처리
  const handleChoiceSelect = useCallback((choiceData, selectedChoiceId, choiceArrayIndex) => {
    const selectedChoice = choiceData.choices[choiceArrayIndex];
    
    if (!selectedChoice || selectedChoice.id !== selectedChoiceId) {
      console.error('Choice mismatch!');
      return;
    }
    
    setChoiceAnswers(prev => {
      const newAnswers = { ...prev };
      choiceData.choices.forEach(choice => {
        delete newAnswers[choice.id];
      });
      return { ...newAnswers, [selectedChoiceId]: selectedChoiceId };
    });
    
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

  // 터치 이벤트
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

  // 미디어 렌더링 - 모바일 최적화
  const renderMedia = (fileName) => {
    const fileType = getFileType(fileName);
    
    if (fileType === 'image') {
      return (
        <div className="image-container">
          <img 
            src={`/contents/${fileName}`}
            alt={fileName} 
            className="media-content"
            loading="eager"
            onLoad={() => {
              console.log('이미지 로드 완료:', fileName);
            }}
            onError={(e) => {
              console.error('이미지 로드 실패:', fileName);
              
              // 모바일에서 강력한 재시도 로직
              const retryCount = parseInt(e.target.dataset.retryCount || '0');
              if (retryCount < 3) {
                console.log(`재시도 ${retryCount + 1}/3:`, fileName);
                e.target.dataset.retryCount = (retryCount + 1).toString();
                
                setTimeout(() => {
                  const timestamp = Date.now();
                  const randomParam = Math.random().toString(36).substring(7);
                  e.target.src = `/contents/${fileName}?retry=${retryCount + 1}&t=${timestamp}&r=${randomParam}`;
                }, (retryCount + 1) * 1000);
                return;
              }
              
              // 최종 실패 시 더미 이미지
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmYiPuydtOuvuOyngCDroZzrk5zsl6Dsl6E8L3RleHQ+PC9zdmc+';
            }}
          />
        </div>
      );
    } else if (fileType === 'video') {
      return (
        <video 
          key={fileName}
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
            console.error('비디오 로딩 에러:', fileName, e.target.error);
          }}
          onCanPlay={(e) => {
            console.log('비디오 재생 준비:', fileName);
            e.target.play().catch(error => {
              console.log('자동 재생 실패:', error);
            });
          }}
        >
          <source src={`/contents/${fileName}`} type="video/webm" />
          <source src={`/contents/${fileName.replace('.webm', '.mp4')}`} type="video/mp4" />
          브라우저가 비디오를 지원하지 않습니다.
        </video>
      );
    }
    
    return (
      <div className="media-content error-content">
        <h3>파일을 로드할 수 없습니다</h3>
        <p>{fileName}</p>
        <button onClick={() => window.location.reload()}>새로고침</button>
      </div>
    );
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
    return (
      <div className="choice-screen">
        <img 
          src={`/contents/${choiceData.background}`} 
          alt="배경" 
          className="choice-background"
          loading="eager"
        />
        {choiceData.choices.map((choice, index) => {
          // CSS와 완전히 동일한 계산: min(100vw, 100vh)
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          // 배경 이미지와 동일한 정사각형 크기 (CSS와 일치)
          const squareSize = Math.min(viewportWidth, viewportHeight);
          
          // 정사각형 배경의 중앙 정렬을 위한 오프셋
          const offsetX = (viewportWidth - squareSize) / 2;
          const offsetY = (viewportHeight - squareSize) / 2;
          
          // choice.position은 0~1 사이의 비율값 (정사각형 배경 기준)
          const absoluteX = offsetX + (choice.position.x * squareSize);
          const absoluteY = offsetY + (choice.position.y * squareSize);
          
          // choice.size도 0~1 사이의 비율값 (정사각형 배경 기준)
          const maxWidth = choice.size.width * squareSize;
          const maxHeight = choice.size.height * squareSize;
          
          // 디버깅 로그
          console.log(`Choice ${index} 위치 (CSS 일치):`, {
            device: isMobile() ? 'Mobile' : 'PC',
            viewportWidth,
            viewportHeight,
            squareSize,
            offsetX,
            offsetY,
            absoluteX,
            absoluteY,
            choicePosition: choice.position,
            choiceSize: choice.size
          });
          
          return (
            <img
              key={choice.id}
              src={`/contents/${choice.image}`}
              alt={choice.id}
              className={`choice-option choice-option-${index}`}
              loading="eager"
              style={{
                position: 'absolute',
                left: `${absoluteX}px`,
                top: `${absoluteY}px`,
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
                zIndex: 10 + index,
                maxWidth: `${maxWidth}px`,
                maxHeight: `${maxHeight}px`,
                width: 'auto',
                height: 'auto',
                transition: 'transform 0.3s ease'
              }}
              onClick={() => handleChoiceSelect(choiceData, choice.id, index)}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translate(-50%, -50%) scale(1.1)';
                e.target.style.zIndex = 100;
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
      const lastChoiceIndex = files.findLastIndex((file, index) => 
        index < currentIndex && typeof file === 'object' && file.type === 'choice'
      );
      
      if (lastChoiceIndex !== -1) {
        const newFiles = [...files];
        const choiceItem = files[lastChoiceIndex];
        
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

    const collectedItems = [];
    
    files.forEach(file => {
      if (typeof file === 'object' && file.type === 'choice' && file.choices) {
        file.choices.forEach(choice => {
          if (choiceAnswers[choice.id] && choice.results) {
            const [location, item] = choice.id.split('_');
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

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (currentAudioRef) {
        currentAudioRef.pause();
        currentAudioRef.currentTime = 0;
      }
    };
  }, [currentAudioRef]);

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
        {!testStarted && typeof currentItem === 'object' && currentItem.type === 'start_button' && 
          renderStartScreen(currentItem)
        }
        
        {testStarted && typeof currentItem === 'string' && renderMedia(currentItem)}
        
        {showQuiz && typeof currentItem === 'object' && currentItem.type === 'quiz' && 
          renderQuiz(currentItem)
        }
        
        {showChoice && typeof currentItem === 'object' && currentItem.type === 'choice' && 
          renderChoice(currentItem)
        }
        
        {showCrossroad && typeof currentItem === 'object' && currentItem.type === 'crossroad' && 
          renderCrossroad(currentItem)
        }
        
        {showChoiceSummary && renderChoiceSummary()}
      </div>
      
      {testStarted && (
        <button 
          className="mute-button"
          onClick={toggleMute}
          title={isMuted ? "음소거 해제" : "음소거"}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      )}
      
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