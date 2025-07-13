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
  const containerRef = useRef(null);
  const audioRef = useRef(null);

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

  const preloadMedia = useCallback(async (mediaFiles) => {
    if (mediaFiles.length === 0) return;
    setPreloading(true);
    setPreloadProgress(0);
    const mediaMap = new Map();
    let loadedCount = 0;
    const totalMedia = mediaFiles.length;
    console.log(`🚀 모든 미디어 ${totalMedia}개 한 번에 로딩 시작!`);

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
        } else {
          handleLoad(null, fileType);
        }
      });
    };

    await Promise.all(mediaFiles.map(loadFullMedia));
    setPreloadedMedia(mediaMap);
    setPreloading(false);
    console.log(`🎉 전체 ${mediaFiles.length}개 파일 완전 로딩 완료!`);
  }, [getFileType, safeEncodeURI]);

  const preloadSingleMedia = useCallback(async (fileName) => {
    if (preloadedMedia.has(fileName)) return;

    console.log(`🚀 동적 로딩 시작: ${fileName}`);
    const fileType = getFileType(fileName);
    if (fileType !== 'image' && fileType !== 'video') {
        console.log(`- 동적 로딩 건너뜀 (미지원 형식): ${fileName}`);
        return;
    }
    
    const fileUrl = `${API_BASE_URL}/static/${safeEncodeURI(fileName)}`;

    return new Promise((resolve) => {
        const handleLoad = (element, type) => {
            setPreloadedMedia(prevMap => new Map(prevMap).set(fileName, { url: fileUrl, element, type, loaded: 'complete', preloaded: true }));
            console.log(`✅ 동적 로딩 완료: ${fileName}`);
            resolve();
        };

        const handleError = (type) => {
            console.error(`❌ 동적 로딩 실패: ${fileName}`);
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
        await preloadMedia(mediaFiles);
      }
      setError(null);
    } catch (err) {
      setError('파일을 불러오는데 실패했습니다.');
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  }, [preloadMedia, getFileType]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // 오디오 초기화 및 사용자 상호작용 처리
  const initializeAudio = useCallback(() => {
    if (!audioInitialized && userInteracted) {
      setAudioInitialized(true);
      console.log('🎵 오디오 시스템 초기화됨');
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
      console.log(newMuted ? '🔇 오디오 음소거' : '🔊 오디오 음소거 해제');
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
        console.log(`🎵 배경음악 재생: ${currentSection.sound}`);
        setCurrentAudio(currentSection.sound);
        audioRef.current = audio;
      }).catch(err => {
        console.error('오디오 재생 실패:', err);
      });
    }
  }, [audioInitialized, soundSections, currentAudio, isMuted]);

  useEffect(() => {
    if (audioInitialized) {
      playBackgroundSound(currentIndex);
    }
  }, [currentIndex, audioInitialized, playBackgroundSound]);

  // 뮤트 상태 변경 시 현재 오디오 볼륨 조정
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : 0.3;
    }
  }, [isMuted]);

  useEffect(() => {
    setShowQuiz(false);
    setShowChoice(false);
    setShowCrossroad(false);
    setShowChoiceSummary(false);

    if (files.length > 0 && currentIndex < files.length) {
      const currentItem = files[currentIndex];
      console.log('Current item at index', currentIndex, ':', currentItem);
      console.log('Next few items:', files.slice(currentIndex + 1, currentIndex + 4));
      
      if (typeof currentItem === 'object') {
        console.log('Object type detected:', currentItem.type);
        console.log('Full object:', currentItem);
        switch (currentItem.type) {
          case 'quiz':
            setShowQuiz(true);
            break;
          case 'choice':
            setShowChoice(true);
            break;
          case 'crossroad':
            // crossroad 객체에 직접 도달했을 때는 다음 미디어 파일로 자동 이동
            console.log('Crossroad object detected, skipping to next media file');
            let skipIndex = currentIndex + 1;
            while (skipIndex < files.length) {
              const skipFile = files[skipIndex];
              if (typeof skipFile === 'string') {
                // 미디어 파일을 찾았으므로 이동
                setCurrentIndex(skipIndex);
                break;
              } else if (typeof skipFile === 'object' && skipFile.type !== 'crossroad') {
                // crossroad가 아닌 다른 객체 타입이면 이동
                setCurrentIndex(skipIndex);
                break;
              } else {
                // crossroad 객체면 계속 건너뛰기
                skipIndex++;
              }
            }
            break;
          case 'return_to_choice':
            setShowReturnToChoice(true);
            break;
          case 'choice_summary':
            console.log('🎯 Choice summary detected! Setting showChoiceSummary to true');
            console.log('Current answers:', choiceAnswers);
            console.log('Summary data:', currentItem);
            setShowChoiceSummary(true);
            console.log('State should be updated now');
            break;
          default:
            break;
        }
      } else {
        console.log('Regular file:', currentItem);
        // 현재 파일이 미디어 파일이고 로딩되지 않았다면 즉시 preload
        if (typeof currentItem === 'string' && !preloadedMedia.has(currentItem)) {
          console.log('Current file not preloaded, loading now:', currentItem);
          preloadMedia([currentItem]).then(() => {
            console.log('Current file loaded successfully:', currentItem);
          });
        }
      }
    }
  }, [currentIndex, files, preloadedMedia, preloadMedia]);

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
  }, [audioInitialized, isMuted]);

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
    console.log('Choice selected:', selectedChoiceId);
    console.log('Current choice index:', currentIndex);
    
    // choice 화면을 먼저 닫음
    setShowChoice(false);
    setCurrentChoiceIndex(currentIndex); // choice 위치 저장
    
    const selectedChoice = choiceData.choices.find(c => c.id === selectedChoiceId);
    console.log('Selected choice object:', selectedChoice);
    
    if (selectedChoice) {
      const resultImage = selectedChoice.results;
      console.log('Result image from choice data:', resultImage);
      
      if (resultImage) {
        // results 이미지를 즉시 preload
        if (!preloadedMedia.has(resultImage)) {
          preloadMedia([resultImage]).then(() => {
            console.log('Result image preloaded:', resultImage);
          });
        }
        
        // 임시 파일 배열 생성 (choice 다음에 results 이미지 삽입)
        const tempFiles = [...files];
        tempFiles.splice(currentIndex + 1, 0, resultImage);
        setFiles(tempFiles);
        
        // results 이미지로 이동하고 crossroad 대기 상태 설정
        setCurrentIndex(currentIndex + 1);
        setCrossroadPending(true);
        console.log('Moving to results image at index:', currentIndex + 1);
        console.log('Crossroad pending - navigation disabled');
        
        // crossroad 표시 (설정된 delay 후)
        // files에서 crossroad 객체를 찾아 delay 값 가져오기
        let crossroadDelay = 5000; // 기본값 5초
        const crossroadObj = files.find(item => 
          typeof item === 'object' && item.type === 'crossroad'
        );
        if (crossroadObj && crossroadObj.delay) {
          crossroadDelay = crossroadObj.delay;
        }
        
        console.log(`Crossroad will show after ${crossroadDelay}ms`);
        setTimeout(() => {
          setShowCrossroad(true);
          console.log('Showing crossroad overlay on results image');
        }, crossroadDelay);
      } else {
        console.log('No results found, moving to next file');
        setCurrentIndex(prev => (prev < files.length - 1 ? prev + 1 : prev));
      }
    }
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
  }, [files, currentIndex, nextFile, saveToBrowserCache, preloadedMedia, preloadMedia, playClickSound]);

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
  }, [currentIndex, playClickSound]);

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
      // Check if the item immediately after the choice is a result image that was dynamically inserted
      if (lastChoiceIndex + 1 < files.length) {
        const nextItemAfterChoice = files[lastChoiceIndex + 1];
        if (typeof nextItemAfterChoice === 'string' && choiceItem.choices) {
          const isResultImage = choiceItem.choices.some(choice => choice.results === nextItemAfterChoice);
          if (isResultImage) {
            const newFiles = [...files];
            newFiles.splice(lastChoiceIndex + 1, 1); // Remove the inserted result image
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
      setShowCrossroad(false);
      setCrossroadPending(false);
      if (direction === 'next') {
        // 다음 콘텐츠로 진행 - crossroad 객체들을 건너뛰고 실제 미디어 파일로 이동
        let nextIndex = currentIndex + 1;
        
        // crossroad 타입 객체들을 건너뛰기
        while (nextIndex < files.length) {
          const nextFile = files[nextIndex];
          if (typeof nextFile === 'string') {
            // 미디어 파일을 찾았으므로 이동
            preloadMedia([nextFile]).then(() => {
              setCurrentIndex(nextIndex);
            });
            break;
          } else if (typeof nextFile === 'object' && nextFile.type !== 'crossroad') {
            // crossroad가 아닌 다른 객체 타입이면 이동
            setCurrentIndex(nextIndex);
            break;
          } else {
            // crossroad 객체면 건너뛰기
            nextIndex++;
          }
        }
        
        // 끝까지 도달한 경우
        if (nextIndex >= files.length) {
          console.log('Reached end of files');
        }
      } else {
        // choice로 돌아가기 - results 이미지를 제거하고 원본 choice로 복귀
        console.log('Returning to choice');
        
        if (currentChoiceIndex !== null && currentChoiceIndex < files.length) {
          // 현재 files에서 results 이미지를 제거 (임시로 삽입된 이미지)
          const newFiles = [...files];
          const resultsIndex = currentIndex; // 현재 위치가 results 이미지
          
          // results 이미지 제거
          if (resultsIndex >= 0 && resultsIndex < newFiles.length) {
            newFiles.splice(resultsIndex, 1);
            setFiles(newFiles);
          }
          
          // choice로 돌아가기
          console.log('Returning to choice at index:', currentChoiceIndex);
          setCurrentIndex(currentChoiceIndex);
          
          setTimeout(() => {
            setShowChoice(true);
            console.log('Restored to choice at index:', currentChoiceIndex);
          }, 50);
        } else {
          // 안전장치: currentChoiceIndex가 null이거나 유효하지 않은 경우
          console.log('CurrentChoiceIndex invalid, searching for choice');
          
          // results 이미지 제거 후 choice 찾기
          const newFiles = [...files];
          if (currentIndex >= 0 && currentIndex < newFiles.length) {
            newFiles.splice(currentIndex, 1); // results 이미지 제거
            setFiles(newFiles);
          }
          
          // 가장 가까운 choice 찾기
          const choiceIndex = newFiles.findIndex(item => 
            typeof item === 'object' && item.type === 'choice'
          );
          
          if (choiceIndex !== -1) {
            console.log('Found choice at index:', choiceIndex);
            setCurrentIndex(choiceIndex);
            setTimeout(() => {
              setShowChoice(true);
            }, 50);
          } else {
            console.log('No choice found, staying at current position');
            setCurrentIndex(0); // 첫 번째 아이템으로 이동
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
  }, [currentIndex, files, preloadMedia, currentChoiceIndex, loadFiles, playClickSound]);

  const renderMedia = (fileName) => {
    const preloadedItem = preloadedMedia.get(fileName);
    if (!preloadedItem || !preloadedItem.preloaded) {
      return <div className="media-loading"><div className="loading-spinner">⏳</div><div>미디어 준비 중...</div></div>;
    }
    const fileType = getFileType(fileName);
    if (fileType === 'image') {
      return <img src={preloadedItem.element.src} alt={fileName} className="media-content" />;
    }
    if (fileType === 'video') {
      return (
        <video src={`${API_BASE_URL}/static/${safeEncodeURI(fileName)}`} controls autoPlay={userInteracted} muted={userInteracted} loop className="media-content" preload="auto"
          onClick={(e) => { e.target.muted = false; if (e.target.paused) e.target.play().catch(console.error); }}
          onLoadedData={(e) => { if (userInteracted && e.target.paused) e.target.play().catch(console.error); }}
        />
      );
    }
    return <div className="unsupported">지원하지 않는 파일 형식입니다.</div>;
  };

  // 선택된 아이템 정리
  const getSelectedChoices = useCallback(() => {
    const choiceLabels = {
      'book': '책',
      'note': '노트', 
      'hands': '악수',
      'hammer': '망치',
      'pallete': '팔레트',
      'eye': '눈'
    };

    console.log('Getting selected choices. choiceAnswers:', choiceAnswers);
    const selectedItems = Object.values(choiceAnswers);
    console.log('Selected items:', selectedItems);
    const uniqueItems = [...new Set(selectedItems)]; // 중복 제거
    console.log('Unique items:', uniqueItems);
    
    const result = uniqueItems.map(item => ({
      id: item,
      label: choiceLabels[item] || item
    }));
    console.log('Final result:', result);
    
    return result;
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
              selectedChoices.map((choice, index) => (
                <div key={choice.id} className="selected-item">
                  <span className="item-icon">📦</span>
                  <span className="item-label">{choice.label}</span>
                </div>
              ))
            ) : (
              <div className="no-items">선택된 아이템이 없습니다.</div>
            )}
          </div>
          
          <button 
            className="choice-summary-close-btn"
            onClick={() => {
              playClickSound();
              setShowChoiceSummary(false);
              if (currentIndex < files.length - 1) {
                setCurrentIndex(prev => prev + 1);
              }
            }}
          >
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
    if (loading) return <div className="loading-screen">파일 목록을 불러오는 중...</div>;
    if (error) return <div className="error-screen">{error}</div>;
    if (files.length === 0) return <div className="no-files">contents 폴더에 미디어 파일이 없습니다.</div>;

    // 안전한 인덱스 체크
    if (currentIndex < 0 || currentIndex >= files.length) {
      console.log('Invalid currentIndex:', currentIndex, 'files.length:', files.length);
      // 유효한 인덱스로 자동 보정
      if (files.length > 0) {
        setCurrentIndex(0);
        return <div className="loading-screen">인덱스를 보정하는 중...</div>;
      }
      return <div className="loading-screen">콘텐츠를 표시할 수 없습니다.</div>;
    }

    const currentItem = files[currentIndex];
    console.log('Rendering item at index', currentIndex, ':', currentItem);
    
    if (typeof currentItem === 'object') {
      if (currentItem.type === 'choice') {
        return renderChoiceScreen(currentItem, currentIndex);
      }
      if (currentItem.type === 'quiz') {
        for (let i = currentIndex - 1; i >= 0; i--) {
          if (typeof files[i] === 'string') {
            return renderMedia(files[i]);
          }
        }
        return <div></div>; 
      } else if (currentItem.type === 'crossroad') {
        return null; 
      } else if (currentItem.type === 'choice_summary') {
        console.log('🎯 Rendering choice summary in renderContent');
        return renderChoiceSummary(currentItem);
      }
    }
    if (typeof currentItem === 'string') {
      return renderMedia(currentItem);
    }
    
    console.log('Unknown item type:', currentItem);
    return <div className="loading-screen">알 수 없는 콘텐츠 형식입니다.</div>;
  };

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
        
        {/* 뮤트 버튼 */}
        <button 
          className="mute-button"
          onClick={toggleMute}
          aria-label={isMuted ? "음소거 해제" : "음소거"}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      </div>
      <div className="controls">
        <button onClick={prevFile} className="nav-button prev-button" disabled={currentIndex === 0}>⟨</button>
        <div className="control-center">
          <span className="swipe-hint">{!userInteracted ? "클릭하거나 스와이프하여 시작하세요" : "스와이프하여 이동하세요"}</span>
          <span className="file-counter">{currentIndex + 1} / {files.length}</span>
        </div>
        <button onClick={nextFile} className="nav-button next-button" disabled={currentIndex === files.length - 1}>⟩</button>
      </div>
    </div>
  );
}

export default App;
