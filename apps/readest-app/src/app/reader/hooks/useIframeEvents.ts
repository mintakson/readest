import { useEffect, useRef } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { debounce } from '@/utils/debounce';
import { ScrollSource } from './usePagination';
import { useEnv } from '@/context/EnvContext';
import { saveViewSettings } from '@/helpers/settings';

export const useMouseEvent = (
  bookKey: string,
  handlePageFlip: (msg: MessageEvent | React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
  handleContinuousScroll: (source: ScrollSource, delta: number, threshold: number) => void,
) => {
  const { hoveredBookKey } = useReaderStore();
  const debounceScroll = debounce(handleContinuousScroll, 500);
  const debounceFlip = debounce(handlePageFlip, 100);
  const handleMouseEvent = (msg: MessageEvent | React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (msg instanceof MessageEvent) {
      if (msg.data && msg.data.bookKey === bookKey) {
        if (msg.data.type === 'iframe-wheel') {
          debounceScroll('mouse', -msg.data.deltaY, 0);
        }
        if (msg.data.type === 'iframe-wheel') {
          debounceFlip(msg);
        } else {
          handlePageFlip(msg);
        }
      }
    } else if (msg.type === 'wheel') {
      const event = msg as React.WheelEvent<HTMLDivElement>;
      debounceScroll('mouse', -event.deltaY, 0);
    } else {
      handlePageFlip(msg);
    }
  };

  useEffect(() => {
    window.addEventListener('message', handleMouseEvent);
    return () => {
      window.removeEventListener('message', handleMouseEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey, hoveredBookKey]);

  return {
    onClick: handlePageFlip,
    onWheel: handleMouseEvent,
  };
};

interface IframeTouch {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
}

interface IframeTouchEvent {
  timeStamp: number;
  targetTouches: IframeTouch[];
}

export const useTouchEvent = (
  bookKey: string,
  handlePageFlip: (msg: CustomEvent) => void,
  handleContinuousScroll: (source: ScrollSource, delta: number, threshold: number) => void,
) => {
  const { envConfig } = useEnv();
  const { getBookData } = useBookDataStore();
  const { hoveredBookKey, setHoveredBookKey, getViewSettings, getView, setViewSettings } = useReaderStore();

  const touchStartRef = useRef<IframeTouch | null>(null);
  const touchEndRef = useRef<IframeTouch | null>(null);
  const touchStartTimeRef = useRef<number | null>(null);
  const touchEndTimeRef = useRef<number | null>(null);

  // Pinch-to-zoom state
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomLevelRef = useRef<number | null>(null);
  const isPinchingRef = useRef<boolean>(false);
  const lastZoomSaveRef = useRef<number>(Date.now());

  // Calculate distance between two touch points
  const getDistance = (touch1: IframeTouch, touch2: IframeTouch): number => {
    const dx = touch2.screenX - touch1.screenX;
    const dy = touch2.screenY - touch1.screenY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Apply zoom level with constraints (50% - 500%)
  const applyZoom = (newZoomLevel: number, persist: boolean = false) => {
    const viewSettings = getViewSettings(bookKey);
    const bookData = getBookData(bookKey);
    if (!viewSettings || !bookData || !bookData.isFixedLayout) return;

    // Clamp zoom level between 50 and 500
    const clampedZoom = Math.max(50, Math.min(500, Math.round(newZoomLevel)));

    viewSettings.zoomLevel = clampedZoom;
    viewSettings.zoomMode = 'custom';
    setViewSettings(bookKey, viewSettings);

    const view = getView(bookKey);
    view?.renderer.setAttribute('scale-factor', clampedZoom);
    view?.renderer.setAttribute('zoom', 'custom');

    // Persist zoom level (debounced during continuous pinch gestures)
    if (persist) {
      const now = Date.now();
      // Only save every 500ms during continuous zooming to avoid excessive writes
      if (now - lastZoomSaveRef.current > 500) {
        saveViewSettings(envConfig, bookKey, 'zoomLevel', clampedZoom, true, false);
        saveViewSettings(envConfig, bookKey, 'zoomMode', 'custom', true, false);
        lastZoomSaveRef.current = now;
      }
    }
  };

  const onTouchStart = (e: IframeTouchEvent | React.TouchEvent<HTMLDivElement>) => {
    const touches = e.targetTouches;
    if (!touches || touches.length === 0) return;

    const touch = touches[0];
    touchStartRef.current = touch;
    touchStartTimeRef.current = 'timeStamp' in e ? e.timeStamp : Date.now();

    // Detect pinch gesture (two fingers)
    if (touches.length === 2) {
      const bookData = getBookData(bookKey);
      const viewSettings = getViewSettings(bookKey);

      // Only enable pinch-to-zoom for fixed layout books (PDF, CBZ)
      if (bookData?.isFixedLayout && viewSettings) {
        isPinchingRef.current = true;
        initialPinchDistanceRef.current = getDistance(touches[0], touches[1]);
        initialZoomLevelRef.current = viewSettings.zoomLevel;
      }
    } else {
      isPinchingRef.current = false;
    }
  };

  const onTouchMove = (e: IframeTouchEvent | React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;

    const touches = e.targetTouches;
    if (!touches || touches.length === 0) return;

    // Handle pinch-to-zoom for two-finger gestures
    if (isPinchingRef.current && touches.length === 2) {
      const currentDistance = getDistance(touches[0], touches[1]);

      if (initialPinchDistanceRef.current && initialZoomLevelRef.current) {
        // Calculate zoom scale based on distance change
        const scale = currentDistance / initialPinchDistanceRef.current;
        const newZoomLevel = initialZoomLevelRef.current * scale;
        applyZoom(newZoomLevel, true); // Apply and persist zoom
      }
      return; // Don't process other touch gestures during pinch
    }

    const touch = touches[0];
    if (touch) {
      touchEndRef.current = touch;
      touchEndTimeRef.current = 'timeStamp' in e ? e.timeStamp : Date.now();
    }
    const { current: touchStart } = touchStartRef;
    const { current: touchEnd } = touchEndRef;
    if (hoveredBookKey && touchEnd) {
      const viewSettings = getViewSettings(bookKey)!;
      const deltaY = touchEnd.screenY - touchStart.screenY;
      const deltaX = touchEnd.screenX - touchStart.screenX;
      if (!viewSettings!.scrolled && !viewSettings!.vertical) {
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
          setHoveredBookKey(null);
        }
      } else {
        setHoveredBookKey(null);
      }
    }
  };

  const onTouchEnd = (e: IframeTouchEvent | React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;

    // If pinch gesture just ended, save final zoom level and reset state
    if (isPinchingRef.current) {
      // Save the final zoom level immediately when pinch ends
      const viewSettings = getViewSettings(bookKey);
      if (viewSettings) {
        saveViewSettings(envConfig, bookKey, 'zoomLevel', viewSettings.zoomLevel, true, false);
        saveViewSettings(envConfig, bookKey, 'zoomMode', 'custom', true, false);
      }

      isPinchingRef.current = false;
      initialPinchDistanceRef.current = null;
      initialZoomLevelRef.current = null;
      touchStartRef.current = null;
      touchEndRef.current = null;
      return;
    }

    const touch = e.targetTouches[0];
    if (touch) {
      touchEndRef.current = touch;
      touchEndTimeRef.current = 'timeStamp' in e ? e.timeStamp : Date.now();
    }

    const windowWidth = window.innerWidth;
    const { current: touchStart } = touchStartRef;
    const { current: touchEnd } = touchEndRef;
    const { current: touchStartTime } = touchStartTimeRef;
    const { current: touchEndTime } = touchEndTimeRef;
    if (touchEnd) {
      const viewSettings = getViewSettings(bookKey)!;
      const bookData = getBookData(bookKey)!;
      const deltaY = touchEnd.screenY - touchStart.screenY;
      const deltaX = touchEnd.screenX - touchStart.screenX;
      const deltaT = touchEndTime && touchStartTime ? touchEndTime - touchStartTime : 0;
      // also check for deltaX to prevent swipe page turn from triggering the toggle
      if (
        deltaY < -10 &&
        Math.abs(deltaY) > Math.abs(deltaX) * 2 &&
        Math.abs(deltaX) < windowWidth * 0.3
      ) {
        // swipe up to toggle the header bar and the footer bar, only for horizontal page mode
        if (
          !viewSettings!.scrolled && // not scrolled
          !viewSettings!.vertical && // not vertical
          (!bookData.isFixedLayout || viewSettings.zoomLevel <= 100) // for fixed layout, not when zoomed in
        ) {
          setHoveredBookKey(hoveredBookKey ? null : bookKey);
        }
      } else {
        if (hoveredBookKey) {
          setHoveredBookKey(null);
        }
      }
      handlePageFlip(
        new CustomEvent('touch-swipe', {
          detail: {
            deltaX,
            deltaY,
            deltaT,
            startX: touchStart.screenX,
            startY: touchStart.screenY,
            endX: touchEnd.screenX,
            endY: touchEnd.screenY,
          },
        }),
      );
      handleContinuousScroll('touch', deltaY, 30);
    }

    touchStartRef.current = null;
    touchEndRef.current = null;
  };

  const handleTouch = (msg: MessageEvent) => {
    if (msg.data && msg.data.bookKey === bookKey) {
      if (msg.data.type === 'iframe-touchstart') {
        onTouchStart(msg.data);
      } else if (msg.data.type === 'iframe-touchmove') {
        onTouchMove(msg.data);
      } else if (msg.data.type === 'iframe-touchend') {
        onTouchEnd(msg.data);
      }
    }
  };

  useEffect(() => {
    window.addEventListener('message', handleTouch);
    return () => {
      window.removeEventListener('message', handleTouch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredBookKey]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
};
