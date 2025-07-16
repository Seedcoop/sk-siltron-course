import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function App() {
  const [files, setFiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentChoiceIndex, setCurrentChoiceIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preloading, setPreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [preloadedMedia, setPreloadedMedia] = useState(new Map());
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [mouseDown, setMouseDown] = useState(false);
  const [mouseStart, setMouseStart] = useState(null);
  const [mouseEnd, setMouseEnd] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [showQuiz, setShowQuiz] = useState(false);
  const [choiceAnswers, setChoiceAnswers] = useState({});
  const [showChoice, setShowChoice] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [showCrossroad, setShowCrossroad] = useState(false);
  const [crossroadPending, setCrossroadPending] = useState(false);
  const [showReturnToChoice, setShowReturnToChoice] = useState(false);
  const [soundSections, setSoundSections] = useState([]);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showChoiceSummary, setShowChoiceSummary] = useState(false);
  const [progressiveImages, setProgressiveImages] = useState(new Map());
  const [isMobile, setIsMobile] = useState(false);
  const [connectionSpeed, setConnectionSpeed] = useState('fast');
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const [testStarted, setTestStarted] = useState(false); // <-- NEW STATE
  const containerRef = useRef(null);
  const audioRef = useRef(null);

  // 모바일 및 연결 속도 감지
  useEffect(() => {
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
      
      // 연결 속도 감지 (Network Information API)
      if ('connection' in navigator) {
        const connection = navigator.connection;
        const effectiveType = connection.effectiveType;
        
        if (effectiveType === 'slow-2g' || effectiveType === '2g') {
          setConnectionSpeed('slow');
        } else if (effectiveType === '3g') {
          setConnectionSpeed('medium');
        } else {
          setConnectionSpeed('fast');
        }
        
        console.log(`📱 Device: ${mobile ? 'Mobile' : 'Desktop'}, Connection: ${effectiveType}`);
      }
    };
    
    checkMobile();
  }, []);

  // 윈도우 크기 변경 감지 (choice 화면 반응형 대응)
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const safeEncodeURI = useCallback((path) => {
    return path.split('/').map(encodeURIComponent).join('/');
  }, []);

  const getFileType = useCallback((filename) => {
    const ext = filename.toLowerCase().split('.').pop();
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'avi', 'mov', 'wmv', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    return 'unknown';
  }, []);

  // Progressive Loading 함수 (Hook이 아님)
  const startProgressiveLoading = useCallback((src) => {
    const fileType = getFileType(src);
    if (fileType !== 'image') {
      return;
    }

    // 이미 처리 중이거나 완료된 이미지는 건너뛰기
    if (progressiveImages.has(src)) {
      return;
    }

    // 썸네일과 원본 이미지 로딩
    const loadProgressiveImage = async () => {
      try {
        // 초기 로딩 상태 설정
        setProgressiveImages(prev => new Map(prev).set(src, { 
          src: null, 
          loading: true,
          isThumb: false 
        }));

        // 1단계: 모바일 최적화 썸네일 로드
        const thumbSize = isMobile ? 150 : 200;
        const thumbQuality = connectionSpeed === 'slow' ? 50 : (connectionSpeed === 'medium' ? 60 : 70);
        const thumbSrc = `${API_BASE_URL}/api/thumbnail/${safeEncodeURI(src)}?size=${thumbSize}&quality=${thumbQuality}`;
        
        const thumbImg = new Image();
        
        const thumbPromise = new Promise((resolve) => {
          thumbImg.onload = () => {
            setProgressiveImages(prev => new Map(prev).set(src, { 
              src: thumbSrc, 
              loading: true,
              isThumb: true 
            }));
            resolve(thumbSrc);
          };
          thumbImg.onerror = () => {
            resolve(null);
          };
        });

        thumbImg.src = thumbSrc;
        const thumbResult = await thumbPromise;

        if (!thumbResult) {
          // 썸네일 로드 실패 시 원본으로 바로 시도
          const fallbackSrc = `${API_BASE_URL}/static/${safeEncodeURI(src)}`;
          setProgressiveImages(prev => new Map(prev).set(src, { 
            src: fallbackSrc, 
            loading: false,
            isThumb: false 
          }));
          return;
        }

        // 2단계: 원본 이미지 백그라운드 로드
        const fullSrc = `${API_BASE_URL}/static/${safeEncodeURI(src)}`;
        
        const fullImg = new Image();
        
        const fullPromise = new Promise((resolve) => {
          fullImg.onload = () => {
            setProgressiveImages(prev => new Map(prev).set(src, { 
              src: fullSrc, 
              loading: false,
              isThumb: false 
            }));
            resolve(fullSrc);
          };
          fullImg.onerror = () => {
            // 원본 로드 실패 시 썸네일 유지
            setProgressiveImages(prev => new Map(prev).set(src, { 
              src: thumbSrc, 
              loading: false,
              isThumb: true 
            }));
            resolve(thumbSrc);
          };
        });

        fullImg.src = fullSrc;
        await fullPromise;

      } catch (error) {
        const fallbackSrc = `${API_BASE_URL}/static/${safeEncodeURI(src)}`;
        setProgressiveImages(prev => new Map(prev).set(src, { 
          src: fallbackSrc, 
          loading: false,
          isThumb: false 
        }));
      }
    };

    // 비동기 로딩 시작
    loadProgressiveImage();
  }, [getFileType, safeEncodeURI, isMobile, connectionSpeed]);

  const preloadingRef = useRef(false);

  const preloadMedia = useCallback(async (mediaFiles) => {
    if (mediaFiles.length === 0) return;
    
    if (preloadingRef.current) {
      console.log('⏭️ Preloading already in progress, skipping');
      return;
    }
    
    preloadingRef.current = true;
    setPreloading(true);
    setPreloadProgress(0);
    const mediaMap = new Map();
    let loadedCount = 0;
    const totalMedia = mediaFiles.length;
    console.log(`🚀 미디어 ${totalMedia}개 로딩 시작!`);

    const loadFullMedia = (fileName) => {
      return new Promise((resolve) => {
        const fileType = getFileType(fileName);
        const fileUrl = `${API_BASE_URL}/static/${safeEncodeURI(fileName)}`;
        
        const handleLoad = (element, type) => {
          mediaMap.set(fileName, { url: fileUrl, element, type, loaded: 'complete', preloaded: true });
          loadedCount++;
          setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
          console.log(`✅ ${type} 로딩 완료: ${fileName} (${loadedCount}/${totalMedia})`);
          resolve();
        };

        const handleError = (type) => {
          console.error(`❌ ${type} 로딩 실패: ${fileName}`);
          loadedCount++;
          setPreloadProgress(Math.round((loadedCount / totalMedia) * 100));
          resolve();
        };

        const actualUrl = isMobile && fileType === 'image' 
          ? `${API_BASE_URL}/api/thumbnail/${safeEncodeURI(fileName)}?size=${connectionSpeed === 'slow' ? 300 : 400}&quality=85`
          : fileUrl;

        if (fileType === 'image') {
          const img = new Image();
          img.onload = () => handleLoad(img, 'image');
          img.onerror = () => handleError('image');
          img.src = actualUrl;
        } else if (fileType === 'video' && !isMobile) {
          const video = document.createElement('video');
          video.preload = connectionSpeed === 'slow' ? 'metadata' : 'auto';
          video.oncanplaythrough = () => handleLoad(video, 'video');
          video.onerror = () => handleError('video');
          video.src = fileUrl;
        } else {
          handleLoad(null, fileType);
        }
      });
    };

    const maxConcurrent = isMobile ? 2 : 4;
    const chunkSize = connectionSpeed === 'slow' ? 1 : (connectionSpeed === 'medium' ? 2 : maxConcurrent);
    
    const filteredFiles = isMobile 
      ? mediaFiles.filter(file => getFileType(file) === 'image').slice(0, 10)
      : mediaFiles;
    
    for (let i = 0; i < filteredFiles.length; i += chunkSize) {
      const chunk = filteredFiles.slice(i, i + chunkSize);
      await Promise.all(chunk.map(loadFullMedia));
      
      if (connectionSpeed === 'slow' && i + chunkSize < filteredFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    setPreloadedMedia(mediaMap);
    setPreloading(false);
    setInitialLoadComplete(true);
    preloadingRef.current = false;
    console.log(`🎉 ${isMobile ? '모바일' : '데스크톱'} ${filteredFiles.length}개 파일 로딩 완료!`);
  }, [getFileType, safeEncodeURI, isMobile, connectionSpeed, API_BASE_URL]);

  const preloadSingleMedia = useCallback(async (fileName) => {
    if (preloadedMedia.has(fileName)) return;

    const fileType = getFileType(fileName);
    if (fileType !== 'image' && fileType !== 'video') {
        return;
    }
    
    const fileUrl = `${API_BASE_URL}/static/${safeEncodeURI(fileName)}`;

    return new Promise((resolve) => {
        const handleLoad = (element, type) => {
            setPreloadedMedia(prevMap => new Map(prevMap).set(fileName, { url: fileUrl, element, type, loaded: 'complete', preloaded: true }));
            resolve();
        };

        const handleError = (type) => {
            resolve();
        };

        if (fileType === 'image') {
            const img = new Image();
            img.onload = () => handleLoad(img, 'image');
            img.onerror = () => handleError('image');
            img.src = fileUrl;
        } else if (fileType === 'video') {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.oncanplaythrough = () => handleLoad(video, 'video');
            video.onerror = () => handleError('video');
            video.src = fileUrl;
        }
    });
  }, [preloadedMedia, getFileType, safeEncodeURI]);

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      const [filesResponse, orderResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/files`),
        axios.get(`${API_BASE_URL}/api/order`)
      ]);
      setFiles(filesResponse.data);
      setSoundSections(orderResponse.data.soundSections || []);
      const mediaFiles = filesResponse.data.filter(item => typeof item === 'string' && getFileType(item) !== 'unknown');
      if (mediaFiles.length > 0) {
        // 모바일에서는 이미지만 초기 로딩 (비디오 제외)
        if (isMobile) {
          const imageFiles = mediaFiles.filter(file => getFileType(file) === 'image').slice(0, 8);
          if (imageFiles.length > 0) {
            await preloadMedia(imageFiles);
          }
          // 모바일에서는 이미지 프리로딩 후 즉시 완료 체크
          setInitialLoadComplete(true);
        } else {
          await preloadMedia(mediaFiles);
        }
      }
      setError(null);
    } catch (err) {
      setError('파일을 불러오는데 실패했습니다.');
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  }, [preloadMedia, getFileType, isMobile]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // 오디오 초기화 및 사용자 상호작용 처리
  const initializeAudio = useCallback(() => {
    if (!audioInitialized && userInteracted) {
      setAudioInitialized(true);
    }
  }, [audioInitialized, userInteracted]);

  useEffect(() => {
    initializeAudio();
  }, [initializeAudio]);

  // 뮤트 토글
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      if (audioRef.current) {
        audioRef.current.volume = newMuted ? 0 : 0.3;
      }
      return newMuted;
    });
  }, []);

  // 현재 인덱스에 따른 사운드 재생
  const playBackgroundSound = useCallback((index) => {
    if (!audioInitialized || !soundSections.length) return;

    const currentSection = soundSections.find(section => 
      index >= section.start && (section.end === -1 || index <= section.end)
    );

    if (currentSection && currentSection.sound !== currentAudio) {
      // 이전 오디오 정지
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // 새 오디오 재생
      const audioUrl = `${API_BASE_URL}/static/sounds/${currentSection.sound}`;
      const audio = new Audio(audioUrl);
      audio.loop = true;
      audio.volume = isMuted ? 0 : 0.3;
      
      audio.play().then(() => {
        setCurrentAudio(currentSection.sound);
        audioRef.current = audio;
      }).catch(() => {
      });
    }
  }, [audioInitialized, soundSections, currentAudio, isMuted, API_BASE_URL]);

  useEffect(() => {
    if (audioInitialized) {
      playBackgroundSound(currentIndex);
    }
  }, [currentIndex, audioInitialized, playBackgroundSound]);

  // 모바일에서는 스마트 프리로딩 비활성화
  const smartPreload = useCallback((index) => {
    if (!files.length || isMobile) return; // 모바일에서는 완전 비활성화

    const preloadRange = 3;
    const startIndex = Math.max(0, index - 1);
    const endIndex = Math.min(files.length, index + preloadRange + 1);
    
    const mediaToPreload = [];
    
    for (let i = startIndex; i < endIndex; i++) {
      const file = files[i];
      if (typeof file === 'string' && !preloadedMedia.has(file)) {
        const fileType = getFileType(file);
        if (fileType === 'image' || fileType === 'video') {
          mediaToPreload.push(file);
        }
      }
    }

    if (mediaToPreload.length > 0) {
      preloadMedia(mediaToPreload);
    }
  }, [files, getFileType, preloadedMedia, preloadMedia, isMobile]);

  // 현재 인덱스 변경 시 스마트 프리로딩 실행 (debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      smartPreload(currentIndex);
    }, 100); // 100ms 지연으로 연속 호출 방지

    return () => clearTimeout(timer);
  }, [currentIndex, smartPreload]);

  // 뮤트 상태 변경 시 현재 오디오 볼륨 조정
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : 0.3;
    }
  }, [isMuted]);

  useEffect(() => {
    if (!testStarted) return; // 테스트가 시작되지 않으면 아무것도 하지 않음

    setShowQuiz(false);
    setShowChoice(false);
    setShowCrossroad(false);
    setShowChoiceSummary(false);

    if (files.length > 0 && currentIndex < files.length) {
      const currentItem = files[currentIndex];
      
      if (typeof currentItem === 'object') {
        switch (currentItem.type) {
          case 'quiz':
            setShowQuiz(true);
            break;
          case 'choice':
            setShowChoice(true);
            break;
          case 'crossroad':
            let skipIndex = currentIndex + 1;
            while (skipIndex < files.length) {
              const skipFile = files[skipIndex];
              if (typeof skipFile === 'string' || (typeof skipFile === 'object' && skipFile.type !== 'crossroad')) {
                setCurrentIndex(skipIndex);
                break;
              }
              skipIndex++;
            }
            break;
          case 'return_to_choice':
            setShowReturnToChoice(true);
            break;
          case 'choice_summary':
            setShowChoiceSummary(true);
            break;
          default:
            break;
        }
      } else {
        if (!isMobile && typeof currentItem === 'string' && !preloadedMedia.has(currentItem)) {
          preloadMedia([currentItem]);
        }
      }
    }
  }, [currentIndex, files, testStarted, isMobile, preloadMedia]);

  const saveToBrowserCache = useCallback((cacheData) => {
    try {
      localStorage.setItem('skSiltronChoices', JSON.stringify(cacheData));
      console.log('브라우저 캐시에 저장 완료:', cacheData);
    } catch (error) {
      console.error('브라우저 캐시 저장 실패:', error);
    }
  }, []);

  // 클릭음 재생
  const playClickSound = useCallback(() => {
    if (audioInitialized && !isMuted) {
      const clickAudio = new Audio(`${API_BASE_URL}/static/sounds/클릭음.webm`);
      clickAudio.volume = 0.5;
      clickAudio.play().catch(err => console.log('클릭음 재생 실패:', err));
    }
  }, [audioInitialized, isMuted, API_BASE_URL]);

  const nextFile = useCallback(() => {
    setUserInteracted(true);
    playClickSound();
    if (showQuiz || showChoice || showCrossroad || crossroadPending || showChoiceSummary) return;
    setCurrentIndex(prev => (prev < files.length - 1 ? prev + 1 : prev));
  }, [files.length, showQuiz, showChoice, showCrossroad, crossroadPending, showChoiceSummary, playClickSound]);

  const prevFile = useCallback(() => {
    setUserInteracted(true);
    playClickSound();
    if (showQuiz || showChoice || showCrossroad || crossroadPending || showChoiceSummary) return;
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : prev));
  }, [showQuiz, showChoice, showCrossroad, crossroadPending, showChoiceSummary, playClickSound]);

  const handleChoiceSelect = useCallback((choiceData, selectedChoiceId) => {
    playClickSound();
    
    setCurrentChoiceIndex(currentIndex);
    
    setChoiceAnswers(prev => ({
      ...prev,
      [selectedChoiceId]: selectedChoiceId
    }));
    
    const selectedChoice = choiceData.choices.find(c => c.id === selectedChoiceId);
    
    if (selectedChoice && selectedChoice.results) {
      const resultImage = selectedChoice.results;
      
      const loadResultImage = async () => {
        if (!preloadedMedia.has(resultImage)) {
          await preloadSingleMedia(resultImage);
        }
        
        const tempFiles = [...files];
        tempFiles.splice(currentIndex + 1, 0, resultImage);
        setFiles(tempFiles);
        
        setShowChoice(false);
        setCurrentIndex(currentIndex + 1);
        setCrossroadPending(true);
        
        let crossroadDelay = 5000;
        const crossroadObj = files.slice(currentIndex + 1).find(item => typeof item === 'object' && item.type === 'crossroad');
        if (crossroadObj && crossroadObj.delay) {
          crossroadDelay = crossroadObj.delay;
        }
        
        setTimeout(() => {
          setShowCrossroad(true);
        }, crossroadDelay);
      };
      
      loadResultImage();
    } else {
      setShowChoice(false);
      setCurrentIndex(prev => (prev < files.length - 1 ? prev + 1 : prev));
    }
    
    const choiceId = `choice_${currentIndex}`;
    axios.post(`${API_BASE_URL}/api/save-choice`, {
      choice_id: choiceId,
      selected_id: selectedChoiceId,
      choice_index: currentIndex
    })
    .then(response => {
      if (response.data.cacheData) {
        saveToBrowserCache(response.data.cacheData);
      }
    })
    .catch(error => {
      console.error('선택지 저장 실패 (백그라운드):', error);
    });
  }, [files, currentIndex, saveToBrowserCache, preloadedMedia, preloadSingleMedia, playClickSound, API_BASE_URL]);

  const handleQuizSubmit = useCallback(async (quizData, selectedOption) => {
    playClickSound();
    const quizIndex = currentIndex;
    try {
      await axios.post(`${API_BASE_URL}/api/save-quiz-answer`, {
        quiz_item: quizData,
        selected_option_index: selectedOption
      });
      setQuizAnswers(prev => ({ ...prev, [quizIndex]: selectedOption }));
      setTimeout(() => {
        setShowQuiz(false);
        setCurrentIndex(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('퀴즈 답변 저장 실패:', error);
      setQuizAnswers(prev => ({ ...prev, [quizIndex]: selectedOption }));
      setTimeout(() => {
        setShowQuiz(false);
        setCurrentIndex(prev => prev + 1);
      }, 1000);
    }
  }, [currentIndex, playClickSound, API_BASE_URL]);

  const minSwipeDistance = 50;
  const onTouchStart = (e) => {
    if (showQuiz || showChoice || showCrossroad || crossroadPending || showChoiceSummary) return;
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e) => {
    if (showQuiz || showChoice || showCrossroad || crossroadPending || showChoiceSummary) return;
    setTouchEnd(e.targetTouches[0].clientX);
  };
  const onTouchEnd = () => {
    if (showQuiz || showChoice || showCrossroad || crossroadPending || showChoiceSummary) return;
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) nextFile();
    else if (distance < -minSwipeDistance) prevFile();
  };

  const onMouseDown = (e) => {
    if (showQuiz || showChoice || showCrossroad || crossroadPending || showChoiceSummary) return;
    setMouseDown(true);
    setMouseEnd(null);
    setMouseStart(e.clientX);
  };
  const onMouseMove = (e) => {
    if (showQuiz || showChoice || showCrossroad || crossroadPending || showChoiceSummary) return;
    if (!mouseDown) return;
    setMouseEnd(e.clientX);
  };
  const onMouseUp = () => {
    if (showQuiz || showChoice || showCrossroad || crossroadPending || showChoiceSummary) return;
    if (!mouseStart || !mouseEnd) {
      setMouseDown(false);
      return;
    }
    const distance = mouseStart - mouseEnd;
    if (distance > minSwipeDistance) nextFile();
    else if (distance < -minSwipeDistance) prevFile();
    setMouseDown(false);
  };
  const onMouseLeave = () => {
    if (mouseDown) onMouseUp();
  };

  const handleReturnToChoice = () => {
    playClickSound();
    const lastChoiceIndex = files.findLastIndex(file => typeof file === 'object' && file.type === 'choice');
    if (lastChoiceIndex !== -1) {
      const choiceItem = files[lastChoiceIndex];
      if (lastChoiceIndex + 1 < files.length) {
        const nextItemAfterChoice = files[lastChoiceIndex + 1];
        if (typeof nextItemAfterChoice === 'string' && choiceItem.choices) {
          const isResultImage = choiceItem.choices.some(choice => choice.results === nextItemAfterChoice);
          if (isResultImage) {
            const newFiles = [...files];
            newFiles.splice(lastChoiceIndex + 1, 1);
            setFiles(newFiles);
          }
        }
      }
      setCurrentIndex(lastChoiceIndex);
    }
    setShowReturnToChoice(false);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (showQuiz || showChoice || showCrossroad || crossroadPending || showChoiceSummary) return;
      if (event.key === 'ArrowRight') nextFile();
      else if (event.key === 'ArrowLeft') prevFile();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextFile, prevFile, showQuiz, showChoice, showCrossroad, crossroadPending, showChoiceSummary]);

  const renderQuizPopup = (quizData, quizIndex) => {
    const selectedAnswer = quizAnswers[quizIndex];
    return (
      <div className="quiz-overlay">
        <div className="quiz-popup">
          <h2 className="quiz-question">{quizData.question}</h2>
          <div className="quiz-options">
            {quizData.options.map((option, index) => (
              <button key={index} className={`quiz-option ${selectedAnswer === index ? 'selected' : ''}`} onClick={() => handleQuizSubmit(quizData, index)}>
                {option}
              </button>
            ))}
          </div>
          {selectedAnswer !== undefined && <div className="quiz-selected-message">답변이 저장되었습니다. 잠시 후 다음으로 이동합니다...</div>}
        </div>
      </div>
    );
  };

  const renderChoiceScreen = (choiceData, choiceIndex) => {
    const backgroundUrl = `${API_BASE_URL}/static/${safeEncodeURI(choiceData.background)}`;
    
    const calculateResponsiveProperties = (position, size) => {
      const minDimension = Math.min(windowDimensions.width, windowDimensions.height);
      
      let squareSize, offsetX, offsetY;
      
      if (windowDimensions.width > windowDimensions.height) {
        squareSize = windowDimensions.height;
        offsetX = (windowDimensions.width - squareSize) / 2;
        offsetY = 0;
      } else {
        squareSize = windowDimensions.width;
        offsetX = 0;
        offsetY = (windowDimensions.height - squareSize) / 2;
      }
      
      const scaleFactor = isMobile ? 1.2 : 1.0;
      
      const absoluteX = offsetX + (position.x * squareSize);
      const absoluteY = offsetY + (position.y * squareSize);
      
      const elementWidth = size.width * squareSize * scaleFactor;
      const elementHeight = size.height * squareSize * scaleFactor;
      
      return {
        position: {
          left: `${absoluteX}px`,
          top: `${absoluteY}px`
        },
        size: {
          width: `${elementWidth}px`,
          height: `${elementHeight}px`
        }
      };
    };
    
    return (
      <div className="choice-screen">
        <img src={backgroundUrl} alt="배경" className="choice-background" />
        <h2 className="choice-question">{choiceData.question}</h2>
        <div className="choice-container">
          {choiceData.choices.map((choice) => {
            const imageUrl = `${API_BASE_URL}/static/${safeEncodeURI(choice.image)}`;
            const responsiveProps = calculateResponsiveProperties(choice.position, choice.size);
            const positionStyle = {
              left: responsiveProps.position.left,
              top: responsiveProps.position.top,
              width: responsiveProps.size.width,
              height: responsiveProps.size.height,
              transform: 'translate(-50%, -50%)',
              position: 'absolute'
            };
            return (
              <div key={choice.id} className="choice-item" style={positionStyle} onClick={(e) => { e.stopPropagation(); handleChoiceSelect(choiceData, choice.id); }}>
                <img src={imageUrl} alt={`선택 ${choice.id}`} className="choice-image" />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCrossroadPopup = useCallback((crossroadData) => {
    const question = crossroadData?.question || '어디로 가시겠습니까?';
    const nextText = crossroadData?.nextText || '다음으로';
    const previousText = crossroadData?.previousText || '이전으로';
    const handleAction = (direction) => {
      playClickSound();
      if (direction === 'next') {
        let nextIndex = currentIndex + 1;
        
        while (nextIndex < files.length) {
          const nextFile = files[nextIndex];
          if (typeof nextFile === 'string' || (typeof nextFile === 'object' && nextFile.type !== 'crossroad')) {
            const loadNextMedia = async () => {
              if (typeof nextFile === 'string' && !preloadedMedia.has(nextFile)) {
                await preloadSingleMedia(nextFile);
              }
              setShowCrossroad(false);
              setCrossroadPending(false);
              setCurrentIndex(nextIndex);
            };
            loadNextMedia();
            return;
          }
          nextIndex++;
        }
        
        if (nextIndex >= files.length) {
          setShowCrossroad(false);
          setCrossroadPending(false);
        }
      } else {
        if (currentChoiceIndex !== null && currentChoiceIndex < files.length) {
          const newFiles = [...files];
          const resultsIndex = currentIndex;
          
          if (resultsIndex >= 0 && resultsIndex < newFiles.length) {
            newFiles.splice(resultsIndex, 1);
            setFiles(newFiles);
          }
          
          setShowCrossroad(false);
          setCrossroadPending(false);
          setCurrentIndex(currentChoiceIndex);
          
          setTimeout(() => {
            setShowChoice(true);
          }, 50);
        } else {
          const newFiles = [...files];
          if (currentIndex >= 0 && currentIndex < newFiles.length) {
            newFiles.splice(currentIndex, 1);
            setFiles(newFiles);
          }
          
          const choiceIndex = newFiles.findIndex(item => typeof item === 'object' && item.type === 'choice');
          
          if (choiceIndex !== -1) {
            setShowCrossroad(false);
            setCrossroadPending(false);
            setCurrentIndex(choiceIndex);
            setTimeout(() => {
              setShowChoice(true);
            }, 50);
          } else {
            setShowCrossroad(false);
            setCrossroadPending(false);
            setCurrentIndex(0);
          }
        }
      }
    };
    return (
      <div className="crossroad-overlay">
        <div className="crossroad-popup">
          <h2 className="crossroad-question">{question}</h2>
          <div className="crossroad-buttons">
            <button className="crossroad-btn prev" onClick={() => handleAction('prev')}>{previousText}</button>
            <button className="crossroad-btn next" onClick={() => handleAction('next')}>{nextText}</button>
          </div>
        </div>
      </div>
    );
  }, [currentIndex, files, preloadedMedia, preloadSingleMedia, currentChoiceIndex, playClickSound]);

  const SimpleImage = ({ fileName }) => {
    const preloadedItem = preloadedMedia.get(fileName);
    const progressiveData = progressiveImages.get(fileName);
    
    useEffect(() => {
      if (!isMobile && getFileType(fileName) === 'image' && !progressiveImages.has(fileName)) {
        startProgressiveLoading(fileName);
      }
    }, [fileName, startProgressiveLoading, isMobile]);
    
    if (isMobile) {
      if (preloadedItem && preloadedItem.preloaded) {
        return <img src={preloadedItem.element.src} alt={fileName} className="media-content" style={{ opacity: 1, transition: 'none' }} />;
      }
      return <img src={`${API_BASE_URL}/static/${safeEncodeURI(fileName)}`} alt={fileName} className="media-content" style={{ opacity: 1, transition: 'none' }} />;
    }

    if (preloadedItem && preloadedItem.preloaded) {
      return <img src={preloadedItem.element.src} alt={fileName} className="media-content" />;
    }

    if (!progressiveData || !progressiveData.src) {
      return (
        <div className="media-loading">
          <div className="loading-spinner">🖼️</div>
          <div>이미지 로딩 중...</div>
        </div>
      );
    }

    return <img src={progressiveData.src} alt={fileName} className="media-content" style={{ filter: progressiveData.isThumb ? 'blur(0.5px)' : 'none', transition: 'filter 0.3s ease' }} />;
  };

  const renderMedia = useCallback((fileName) => {
    const fileType = getFileType(fileName);
    
    if (isMobile) {
      if (fileType === 'image') {
        return <img src={`${API_BASE_URL}/static/${safeEncodeURI(fileName)}`} alt={fileName} className="media-content" style={{ opacity: 1, transition: 'none' }} onClick={(e) => e.stopPropagation()} />;
      }
      if (fileType === 'video') {
        return <video src={`${API_BASE_URL}/static/${safeEncodeURI(fileName)}`} controls autoPlay={userInteracted} muted={isMuted} className="media-content" style={{ opacity: 1, transition: 'none' }} onClick={(e) => e.stopPropagation()} />;
      }
    }
    
    if (!isMobile && fileType === 'image') {
      const preloadedItem = preloadedMedia.get(fileName);
      if (preloadedItem && preloadedItem.preloaded) {
        return <img src={preloadedItem.element.src} alt={fileName} className="media-content" onClick={(e) => e.stopPropagation()} />;
      }
      return <SimpleImage fileName={fileName} />;
    }
    
    const videoPreloadedItem = preloadedMedia.get(fileName);
    if (!videoPreloadedItem || !videoPreloadedItem.preloaded) {
      return <div className="media-loading"><div className="loading-spinner">⏳</div><div>미디어 준비 중...</div></div>;
    }
    
    if (fileType === 'video') {
      return <video src={videoPreloadedItem.url || `${API_BASE_URL}/static/${safeEncodeURI(fileName)}`} controls autoPlay={userInteracted} muted={isMuted} className="media-content" preload="auto" onClick={(e) => e.stopPropagation()} onLoadedData={(e) => { if (userInteracted && e.target.paused) e.target.play().catch(console.error); }} />;
    }
    
    return <div className="unsupported">지원하지 않는 파일 형식입니다.</div>;
  }, [preloadedMedia, getFileType, safeEncodeURI, userInteracted, isMobile, API_BASE_URL, isMuted]);

  const getSelectedChoices = useCallback(() => {
    const choiceLabels = { 'book': '책', 'note': '노트', 'hands': '악수', 'hammer': '망치', 'pallete': '팔레트', 'eye': '눈' };
    const selectedItems = Object.keys(choiceAnswers).filter(key => choiceAnswers[key]);
    const uniqueItems = [...new Set(selectedItems)];
    return uniqueItems.map(item => ({ id: item, label: choiceLabels[item] || item }));
  }, [choiceAnswers]);

  const renderChoiceSummary = useCallback((summaryData) => {
    const selectedChoices = getSelectedChoices();
    return (
      <div className="choice-summary-overlay">
        <div className="choice-summary-popup">
          <h2 className="choice-summary-title">{summaryData.title}</h2>
          <p className="choice-summary-description">{summaryData.description}</p>
          <div className="selected-items">
            {selectedChoices.length > 0 ? (
              selectedChoices.map((choice) => (
                <div key={choice.id} className="selected-item">
                  <span className="item-icon">📦</span>
                  <span className="item-label">{choice.label}</span>
                </div>
              ))
            ) : (
              <div className="no-items">선택된 아이템이 없습니다.</div>
            )}
          </div>
          <button className="choice-summary-close-btn" onClick={() => { playClickSound(); setShowChoiceSummary(false); if (currentIndex < files.length - 1) { setCurrentIndex(prev => prev + 1); } }}>
            완료
          </button>
        </div>
      </div>
    );
  }, [getSelectedChoices, playClickSound, currentIndex, files.length]);

  const renderReturnToChoicePopup = (data) => {
    const handleNext = () => {
      playClickSound();
      const nextPageIndex = files.findIndex(file => file === data.nextPage);
      if (nextPageIndex !== -1) {
        setCurrentIndex(nextPageIndex);
      }
      setShowReturnToChoice(false);
    };

    return (
      <div className="return-to-choice-overlay">
        <div className="return-to-choice-popup">
          <h2 className="return-to-choice-question">{data.question}</h2>
          <div className="return-to-choice-buttons">
            <button className="return-to-choice-btn prev" onClick={handleReturnToChoice}>{data.previousText}</button>
            <button className="return-to-choice-btn next" onClick={handleNext}>{data.nextText}</button>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (error) return <div className="error-screen">{error}</div>;
    if (files.length === 0 && !loading) return <div className="no-files">contents 폴더에 미디어 파일이 없습니다.</div>;

    if (loading && !initialLoadComplete) return (
      <div className="loading-screen">
        <div className="loading-spinner">🚀</div>
        <div>{isMobile ? '로딩 중...' : '콘텐츠를 준비하는 중...'}</div>
        {preloading && (
          <div className="progress-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{width: `${preloadProgress}%`}}></div>
            </div>
            <div className="progress-text">{preloadProgress}%</div>
          </div>
        )}
      </div>
    );

    if (currentIndex < 0 || currentIndex >= files.length) {
      if (files.length > 0) {
        setCurrentIndex(0);
        return <div className="loading-screen"><div className="loading-spinner">⚙️</div><div>인덱스를 보정하는 중...</div></div>;
      }
      return <div className="loading-screen"><div className="loading-spinner">⚠️</div><div>콘텐츠를 표시할 수 없습니다.</div></div>;
    }

    const currentItem = files[currentIndex];
    
    if (typeof currentItem === 'object') {
      if (currentItem.type === 'choice') return renderChoiceScreen(currentItem, currentIndex);
      if (currentItem.type === 'quiz') {
        for (let i = currentIndex - 1; i >= 0; i--) {
          if (typeof files[i] === 'string') return renderMedia(files[i]);
        }
        return <div></div>; 
      }
      if (currentItem.type === 'crossroad') return null; 
      if (currentItem.type === 'choice_summary') return renderChoiceSummary(currentItem);
    }
    if (typeof currentItem === 'string') {
      return renderMedia(currentItem);
    }
    
    return <div className="loading-screen"><div className="loading-spinner">❓</div><div>알 수 없는 콘텐츠 형식입니다.</div></div>;
  };

  const startTest = useCallback(() => {
    setUserInteracted(true);
    playClickSound();
    setTestStarted(true);
    initializeAudio();
  }, [playClickSound, initializeAudio]);

  if (!testStarted) {
    return (
      <div className="app">
        <div className="start-screen">
          <h1 className="start-title">반도체 진로성향검사</h1>
          <p className="start-description">나의 직무 성향과 딱 맞는 반도체 커리어를 찾아보세요!</p>
          <button onClick={startTest} className="start-button" disabled={loading}>
            {loading ? `콘텐츠 로딩 중... ${preloadProgress}%` : '검사 시작하기'}
          </button>
          {loading && (
            <div className="progress-container-start">
              <div className="progress-bar">
                <div className="progress-fill" style={{width: `${preloadProgress}%`}}></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app" ref={containerRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}>
      <div className="media-container">
        {renderContent()}
        {showQuiz && renderQuizPopup(files[currentIndex], currentIndex)}
        {showCrossroad && renderCrossroadPopup({
          question: '어디로 가시겠습니까?',
          nextText: '다음 장소는 어디일까?',
          previousText: '다시 선택하고 싶어요.'
        })}
        {showReturnToChoice && renderReturnToChoicePopup(files[currentIndex])}
        
        <button className="mute-button" onClick={toggleMute} aria-label={isMuted ? "음소거 해제" : "음소거"}>
          {isMuted ? "🔇" : "🔊"}
        </button>
      </div>
      <div className="controls">
        <button onClick={prevFile} className="nav-button prev-button" disabled={currentIndex === 0 || showChoice || showCrossroad || crossroadPending}>⟨</button>
        <div className="control-center">
          <span className="swipe-hint">스와이프하여 이동하세요</span>
          <span className="file-counter">{currentIndex + 1} / {files.length}</span>
        </div>
        <button onClick={nextFile} className="nav-button next-button" disabled={currentIndex === files.length - 1 || showChoice || showCrossroad || crossroadPending}>⟩</button>
      </div>
    </div>
  );
}

export default App;
