/**
 * Performance monitoring and profiling utilities
 * Tracks memory usage, loading times, and performance metrics
 */

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface MemorySnapshot {
  timestamp: number;
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

export interface PerformanceReport {
  metrics: PerformanceMetric[];
  memorySnapshots: MemorySnapshot[];
  errors: Array<{ timestamp: number; error: string; stack?: string }>;
  warnings: Array<{ timestamp: number; message: string }>;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completedMetrics: PerformanceMetric[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private errors: Array<{ timestamp: number; error: string; stack?: string }> = [];
  private warnings: Array<{ timestamp: number; message: string }> = [];
  private memoryCheckInterval?: NodeJS.Timeout;
  private maxMetricsHistory = 100;
  private maxMemorySnapshots = 50;

  constructor() {
    if (typeof window !== 'undefined') {
      // Start memory monitoring
      this.startMemoryMonitoring();

      // Monitor long tasks
      this.observeLongTasks();

      // Monitor layout shifts
      this.observeLayoutShifts();
    }
  }

  /**
   * Start tracking a performance metric
   */
  start(name: string, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata,
    };
    this.metrics.set(name, metric);
  }

  /**
   * End tracking a performance metric
   */
  end(name: string, additionalMetadata?: Record<string, any>): number | undefined {
    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Performance metric "${name}" was not started`);
      return undefined;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    if (additionalMetadata) {
      metric.metadata = { ...metric.metadata, ...additionalMetadata };
    }

    this.completedMetrics.push(metric);
    this.metrics.delete(name);

    // Limit history size
    if (this.completedMetrics.length > this.maxMetricsHistory) {
      this.completedMetrics.shift();
    }

    // Log slow operations
    if (metric.duration > 1000) {
      console.warn(`Slow operation detected: ${name} took ${metric.duration.toFixed(2)}ms`, metric.metadata);
    }

    return metric.duration;
  }

  /**
   * Measure a synchronous function
   */
  measure<T>(name: string, fn: () => T, metadata?: Record<string, any>): T {
    this.start(name, metadata);
    try {
      const result = fn();
      this.end(name);
      return result;
    } catch (error) {
      this.end(name, { error: String(error) });
      throw error;
    }
  }

  /**
   * Measure an async function
   */
  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    this.start(name, metadata);
    try {
      const result = await fn();
      this.end(name);
      return result;
    } catch (error) {
      this.end(name, { error: String(error) });
      throw error;
    }
  }

  /**
   * Take a memory snapshot
   */
  takeMemorySnapshot(): MemorySnapshot | null {
    if (typeof window === 'undefined' || !('performance' in window)) {
      return null;
    }

    const memory = (performance as any).memory;
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
    };

    if (memory) {
      snapshot.usedJSHeapSize = memory.usedJSHeapSize;
      snapshot.totalJSHeapSize = memory.totalJSHeapSize;
      snapshot.jsHeapSizeLimit = memory.jsHeapSizeLimit;
    }

    this.memorySnapshots.push(snapshot);

    // Limit snapshots
    if (this.memorySnapshots.length > this.maxMemorySnapshots) {
      this.memorySnapshots.shift();
    }

    return snapshot;
  }

  /**
   * Start automatic memory monitoring
   */
  private startMemoryMonitoring(): void {
    // Take snapshot every 30 seconds
    this.memoryCheckInterval = setInterval(() => {
      const snapshot = this.takeMemorySnapshot();

      // Check for memory leaks (growing heap)
      if (snapshot && this.memorySnapshots.length >= 5) {
        const recent = this.memorySnapshots.slice(-5);
        const isGrowing = recent.every((s, i) => {
          if (i === 0) return true;
          return (s.usedJSHeapSize || 0) > (recent[i - 1].usedJSHeapSize || 0);
        });

        if (isGrowing && snapshot.usedJSHeapSize && snapshot.jsHeapSizeLimit) {
          const percentUsed = (snapshot.usedJSHeapSize / snapshot.jsHeapSizeLimit) * 100;
          if (percentUsed > 80) {
            this.logWarning(`High memory usage: ${percentUsed.toFixed(1)}% of heap limit`);
          }
        }
      }
    }, 30000);
  }

  /**
   * Observe long tasks (>50ms)
   */
  private observeLongTasks(): void {
    if (typeof window === 'undefined') return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            this.logWarning(`Long task detected: ${entry.duration.toFixed(2)}ms`);
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Long task API not supported
    }
  }

  /**
   * Observe layout shifts
   */
  private observeLayoutShifts(): void {
    if (typeof window === 'undefined') return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as any;
          if (layoutShift.value > 0.1) {
            this.logWarning(`Significant layout shift: ${layoutShift.value.toFixed(3)}`);
          }
        }
      });
      observer.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      // Layout shift API not supported
    }
  }

  /**
   * Log an error
   */
  logError(error: Error | string, stack?: string): void {
    const errorEntry = {
      timestamp: Date.now(),
      error: typeof error === 'string' ? error : error.message,
      stack: stack || (typeof error === 'object' && error.stack),
    };
    this.errors.push(errorEntry);
    console.error('[Performance Monitor]', errorEntry);
  }

  /**
   * Log a warning
   */
  logWarning(message: string): void {
    const warning = {
      timestamp: Date.now(),
      message,
    };
    this.warnings.push(warning);
    console.warn('[Performance Monitor]', warning);
  }

  /**
   * Get performance report
   */
  getReport(): PerformanceReport {
    return {
      metrics: [...this.completedMetrics],
      memorySnapshots: [...this.memorySnapshots],
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }

  /**
   * Get metrics by name pattern
   */
  getMetrics(pattern?: string | RegExp): PerformanceMetric[] {
    if (!pattern) return [...this.completedMetrics];

    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return this.completedMetrics.filter((m) => regex.test(m.name));
  }

  /**
   * Get average duration for a metric
   */
  getAverageDuration(name: string): number | null {
    const metrics = this.getMetrics(name);
    if (metrics.length === 0) return null;

    const total = metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    return total / metrics.length;
  }

  /**
   * Clear all metrics and snapshots
   */
  clear(): void {
    this.metrics.clear();
    this.completedMetrics = [];
    this.memorySnapshots = [];
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
    this.clear();
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator for measuring method performance
 */
export function measurePerformance(metricName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const name = metricName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return performanceMonitor.measureAsync(name, () => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}

/**
 * Hook for React components to measure render performance
 */
export function usePerformanceMetric(componentName: string) {
  if (typeof window === 'undefined') return;

  const metricName = `render:${componentName}`;
  performanceMonitor.start(metricName);

  // Use effect cleanup to end metric
  if (typeof React !== 'undefined') {
    React.useEffect(() => {
      performanceMonitor.end(metricName);
      return () => {
        // Component unmounted
      };
    });
  }
}

/**
 * Get Web Vitals metrics
 */
export function getWebVitals(): {
  FCP?: number;
  LCP?: number;
  FID?: number;
  CLS?: number;
  TTFB?: number;
} {
  if (typeof window === 'undefined') return {};

  const vitals: any = {};

  try {
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find((e) => e.name === 'first-contentful-paint');
    if (fcpEntry) {
      vitals.FCP = fcpEntry.startTime;
    }

    const navEntry = performance.getEntriesByType('navigation')[0] as any;
    if (navEntry) {
      vitals.TTFB = navEntry.responseStart - navEntry.requestStart;
    }
  } catch (e) {
    // Not supported
  }

  return vitals;
}

export default performanceMonitor;
