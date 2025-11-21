import { useEffect } from 'react';
import { performanceMonitor, detectLongTasks } from '@/utils/performance';

/**
 * Hook to enable performance monitoring in the application
 * Tracks UI freezes, memory usage, and long tasks
 */
export function usePerformanceMonitoring(options?: {
  enableFreezeDetection?: boolean;
  enableLongTaskDetection?: boolean;
  enableMemoryWarnings?: boolean;
  memoryCheckInterval?: number;
}) {
  const {
    enableFreezeDetection = true,
    enableLongTaskDetection = true,
    enableMemoryWarnings = true,
    memoryCheckInterval = 30000, // 30 seconds
  } = options || {};

  useEffect(() => {
    console.log('[Performance] Initializing performance monitoring');

    // Start freeze detection
    if (enableFreezeDetection) {
      performanceMonitor.startFreezeDetection();
    }

    // Start long task detection
    if (enableLongTaskDetection) {
      detectLongTasks();
    }

    // Periodic memory checks
    let memoryCheckTimer: NodeJS.Timeout | null = null;
    if (enableMemoryWarnings) {
      memoryCheckTimer = setInterval(() => {
        if (performanceMonitor.isMemoryCritical()) {
          console.warn(
            '[Performance] Memory usage is critically high. Consider closing unused books.',
          );
          performanceMonitor.logMemoryUsage('periodic-check');

          // Try to free memory
          performanceMonitor.requestGC();
        }
      }, memoryCheckInterval);
    }

    // Cleanup
    return () => {
      if (enableFreezeDetection) {
        performanceMonitor.stopFreezeDetection();
      }
      if (memoryCheckTimer) {
        clearInterval(memoryCheckTimer);
      }
    };
  }, [enableFreezeDetection, enableLongTaskDetection, enableMemoryWarnings, memoryCheckInterval]);

  return {
    getReport: () => performanceMonitor.getReport(),
    logMemory: (context?: string) => performanceMonitor.logMemoryUsage(context),
    clearMetrics: () => performanceMonitor.clearMetrics(),
  };
}
