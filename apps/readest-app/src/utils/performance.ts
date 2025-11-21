import { captureException } from './analytics';

/**
 * Performance monitoring utility for tracking app performance and detecting issues
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface MemoryInfo {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 100;
  private freezeThreshold = 1000; // 1 second
  private memoryWarningThreshold = 0.9; // 90% of heap limit
  private lastFrameTime: number = performance.now();
  private frameDropCount = 0;
  private isMonitoring = false;

  /**
   * Start a performance measurement
   */
  startMeasure(name: string): () => void {
    const startTime = performance.now();
    const startMark = `${name}-start-${Date.now()}`;

    if (typeof performance.mark === 'function') {
      performance.mark(startMark);
    }

    return () => {
      const duration = performance.now() - startTime;
      const endMark = `${name}-end-${Date.now()}`;

      if (typeof performance.mark === 'function') {
        performance.mark(endMark);
      }

      this.recordMetric({
        name,
        duration,
        timestamp: Date.now(),
      });

      // Log slow operations
      if (duration > 1000) {
        console.warn(`[Performance] Slow operation detected: ${name} took ${duration.toFixed(2)}ms`);
      }

      return duration;
    };
  }

  /**
   * Measure an async operation
   */
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const endMeasure = this.startMeasure(name);
    try {
      const result = await fn();
      endMeasure();
      return result;
    } catch (error) {
      endMeasure();
      throw error;
    }
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Report to analytics if available
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('performance_metric', {
        metric_name: metric.name,
        duration_ms: metric.duration,
        ...metric.metadata,
      });
    }
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): MemoryInfo | null {
    if (typeof performance === 'undefined' || !(performance as any).memory) {
      return null;
    }

    const memory = (performance as any).memory as MemoryInfo;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
  }

  /**
   * Check if memory usage is critically high
   */
  isMemoryCritical(): boolean {
    const memory = this.getMemoryUsage();
    if (!memory || !memory.usedJSHeapSize || !memory.jsHeapSizeLimit) {
      return false;
    }

    const ratio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    return ratio > this.memoryWarningThreshold;
  }

  /**
   * Log current memory usage
   */
  logMemoryUsage(context?: string): void {
    const memory = this.getMemoryUsage();
    if (!memory) {
      console.log('[Performance] Memory API not available');
      return;
    }

    const usedMB = ((memory.usedJSHeapSize || 0) / 1024 / 1024).toFixed(2);
    const totalMB = ((memory.totalJSHeapSize || 0) / 1024 / 1024).toFixed(2);
    const limitMB = ((memory.jsHeapSizeLimit || 0) / 1024 / 1024).toFixed(2);

    const contextStr = context ? ` [${context}]` : '';
    console.log(
      `[Performance]${contextStr} Memory: ${usedMB}MB / ${totalMB}MB (limit: ${limitMB}MB)`,
    );

    if (this.isMemoryCritical()) {
      console.warn(`[Performance] Memory usage is critically high!`);
    }
  }

  /**
   * Start monitoring for UI freezes
   */
  startFreezeDetection(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    const checkFreeze = () => {
      const now = performance.now();
      const delta = now - this.lastFrameTime;

      if (delta > this.freezeThreshold) {
        console.warn(`[Performance] UI freeze detected: ${delta.toFixed(2)}ms`);

        // Capture freeze event
        if (typeof window !== 'undefined' && (window as any).posthog) {
          (window as any).posthog.capture('ui_freeze', {
            duration_ms: delta,
            frame_drops: this.frameDropCount,
          });
        }

        this.frameDropCount++;
      }

      this.lastFrameTime = now;

      if (this.isMonitoring) {
        requestAnimationFrame(checkFreeze);
      }
    };

    requestAnimationFrame(checkFreeze);
  }

  /**
   * Stop monitoring for UI freezes
   */
  stopFreezeDetection(): void {
    this.isMonitoring = false;
  }

  /**
   * Get recent metrics
   */
  getMetrics(count?: number): PerformanceMetric[] {
    return count ? this.metrics.slice(-count) : [...this.metrics];
  }

  /**
   * Get average duration for a specific metric
   */
  getAverageDuration(name: string): number {
    const filtered = this.metrics.filter((m) => m.name === name);
    if (filtered.length === 0) return 0;

    const total = filtered.reduce((sum, m) => sum + m.duration, 0);
    return total / filtered.length;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.frameDropCount = 0;
  }

  /**
   * Request garbage collection if available (Chrome DevTools)
   */
  requestGC(): void {
    if (typeof window !== 'undefined' && (window as any).gc) {
      console.log('[Performance] Requesting garbage collection');
      try {
        (window as any).gc();
      } catch (e) {
        console.warn('[Performance] GC not available');
      }
    }
  }

  /**
   * Get performance report
   */
  getReport(): {
    metrics: PerformanceMetric[];
    memory: MemoryInfo | null;
    frameDrops: number;
    averageDurations: Record<string, number>;
  } {
    const metricNames = [...new Set(this.metrics.map((m) => m.name))];
    const averageDurations: Record<string, number> = {};

    metricNames.forEach((name) => {
      averageDurations[name] = this.getAverageDuration(name);
    });

    return {
      metrics: this.getMetrics(20),
      memory: this.getMemoryUsage(),
      frameDrops: this.frameDropCount,
      averageDurations,
    };
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator for measuring function execution time
 */
export function measurePerformance(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const measureName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const endMeasure = performanceMonitor.startMeasure(measureName);
      try {
        const result = await originalMethod.apply(this, args);
        endMeasure();
        return result;
      } catch (error) {
        endMeasure();
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Utility to detect long tasks
 */
export function detectLongTasks(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          console.warn(
            `[Performance] Long task detected: ${entry.name} (${entry.duration.toFixed(2)}ms)`,
          );

          if (typeof window !== 'undefined' && (window as any).posthog) {
            (window as any).posthog.capture('long_task', {
              name: entry.name,
              duration_ms: entry.duration,
              start_time: entry.startTime,
            });
          }
        }
      }
    });

    observer.observe({ entryTypes: ['longtask', 'measure'] });
  } catch (e) {
    console.warn('[Performance] Long task detection not available');
  }
}

/**
 * Debounce function with performance tracking
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  name?: string,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      if (name) {
        const endMeasure = performanceMonitor.startMeasure(name);
        fn.apply(this, args);
        endMeasure();
      } else {
        fn.apply(this, args);
      }
    }, delay);
  };
}

/**
 * Throttle function with performance tracking
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  name?: string,
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      if (name) {
        const endMeasure = performanceMonitor.startMeasure(name);
        fn.apply(this, args);
        endMeasure();
      } else {
        fn.apply(this, args);
      }
    }
  };
}
