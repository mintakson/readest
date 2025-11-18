/**
 * Crash tracking and error recovery service
 * Tracks application crashes, freezes, and provides recovery mechanisms
 */

import { performanceMonitor } from '@/utils/performance';

export interface CrashReport {
  timestamp: number;
  type: 'crash' | 'freeze' | 'error' | 'memory';
  message: string;
  stack?: string;
  metadata?: Record<string, any>;
  userAgent?: string;
  platform?: string;
  memoryUsage?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
}

export interface FreezeDetection {
  startTime: number;
  duration: number;
  recovered: boolean;
}

class CrashTracker {
  private crashes: CrashReport[] = [];
  private freezeDetectionInterval?: NodeJS.Timeout;
  private lastHeartbeat: number = Date.now();
  private freezeThreshold = 5000; // 5 seconds
  private maxCrashHistory = 50;
  private isMonitoring = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeTracking();
    }
  }

  /**
   * Initialize crash tracking
   */
  private initializeTracking(): void {
    // Track unhandled errors
    window.addEventListener('error', (event) => {
      this.reportCrash({
        type: 'error',
        message: event.message,
        stack: event.error?.stack,
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.reportCrash({
        type: 'error',
        message: `Unhandled promise rejection: ${event.reason}`,
        stack: event.reason?.stack,
        metadata: {
          reason: String(event.reason),
        },
      });
    });

    // Check for previous crash on startup
    this.checkForPreviousCrash();

    // Start freeze detection
    this.startFreezeDetection();
  }

  /**
   * Report a crash
   */
  reportCrash(crash: Omit<CrashReport, 'timestamp' | 'userAgent' | 'platform'>): void {
    const report: CrashReport = {
      ...crash,
      timestamp: Date.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
    };

    // Add memory usage if available
    if (typeof window !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      report.memoryUsage = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      };
    }

    this.crashes.push(report);

    // Limit history
    if (this.crashes.length > this.maxCrashHistory) {
      this.crashes.shift();
    }

    // Log to performance monitor
    performanceMonitor.logError(crash.message, crash.stack);

    // Log to console
    console.error('[Crash Tracker]', report);

    // Store in localStorage for crash recovery
    this.persistCrashReport(report);

    // Send to analytics (if available)
    this.sendToAnalytics(report);
  }

  /**
   * Start freeze detection
   */
  private startFreezeDetection(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.lastHeartbeat = Date.now();

    // Heartbeat on main thread
    const heartbeat = () => {
      this.lastHeartbeat = Date.now();
      requestAnimationFrame(heartbeat);
    };
    requestAnimationFrame(heartbeat);

    // Monitor heartbeat from worker
    this.freezeDetectionInterval = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;

      if (timeSinceLastHeartbeat > this.freezeThreshold) {
        this.reportCrash({
          type: 'freeze',
          message: `Application freeze detected: ${timeSinceLastHeartbeat}ms`,
          metadata: {
            duration: timeSinceLastHeartbeat,
            recovered: true,
          },
        });

        performanceMonitor.logWarning(
          `Application recovered from freeze: ${timeSinceLastHeartbeat}ms`
        );
      }
    }, 1000);
  }

  /**
   * Stop freeze detection
   */
  stopFreezeDetection(): void {
    if (this.freezeDetectionInterval) {
      clearInterval(this.freezeDetectionInterval);
      this.freezeDetectionInterval = undefined;
    }
    this.isMonitoring = false;
  }

  /**
   * Check for previous crash
   */
  private checkForPreviousCrash(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const lastCrash = localStorage.getItem('readest_last_crash');
      const cleanShutdown = localStorage.getItem('readest_clean_shutdown');

      if (lastCrash && !cleanShutdown) {
        const report = JSON.parse(lastCrash) as CrashReport;
        console.warn('[Crash Tracker] Previous session crashed:', report);

        // You could prompt user to restore state or clear cache here
        this.crashes.push({
          ...report,
          metadata: {
            ...report.metadata,
            previousSession: true,
          },
        });
      }

      // Mark clean shutdown as false
      localStorage.removeItem('readest_clean_shutdown');
    } catch (e) {
      console.error('Error checking previous crash:', e);
    }
  }

  /**
   * Persist crash report for recovery
   */
  private persistCrashReport(report: CrashReport): void {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem('readest_last_crash', JSON.stringify(report));
    } catch (e) {
      console.error('Error persisting crash report:', e);
    }
  }

  /**
   * Mark clean shutdown
   */
  markCleanShutdown(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem('readest_clean_shutdown', 'true');
      localStorage.removeItem('readest_last_crash');
    } catch (e) {
      console.error('Error marking clean shutdown:', e);
    }
  }

  /**
   * Send crash report to analytics
   */
  private sendToAnalytics(report: CrashReport): void {
    // Integration with existing analytics (PostHog, etc.)
    if (typeof window !== 'undefined' && (window as any).posthog) {
      try {
        (window as any).posthog.capture('app_crash', {
          crash_type: report.type,
          message: report.message,
          platform: report.platform,
          memory_used_mb: report.memoryUsage?.usedJSHeapSize
            ? (report.memoryUsage.usedJSHeapSize / 1024 / 1024).toFixed(2)
            : undefined,
          ...report.metadata,
        });
      } catch (e) {
        console.error('Error sending crash to analytics:', e);
      }
    }
  }

  /**
   * Get all crash reports
   */
  getCrashReports(): CrashReport[] {
    return [...this.crashes];
  }

  /**
   * Get crash statistics
   */
  getStatistics(): {
    totalCrashes: number;
    crashesByType: Record<string, number>;
    recentCrashes: CrashReport[];
    averageMemoryUsage?: number;
  } {
    const crashesByType: Record<string, number> = {};

    for (const crash of this.crashes) {
      crashesByType[crash.type] = (crashesByType[crash.type] || 0) + 1;
    }

    const recentCrashes = this.crashes.slice(-10);

    const memoryUsages = this.crashes
      .filter((c) => c.memoryUsage?.usedJSHeapSize)
      .map((c) => c.memoryUsage!.usedJSHeapSize!);

    const averageMemoryUsage =
      memoryUsages.length > 0
        ? memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length
        : undefined;

    return {
      totalCrashes: this.crashes.length,
      crashesByType,
      recentCrashes,
      averageMemoryUsage,
    };
  }

  /**
   * Clear crash history
   */
  clear(): void {
    this.crashes = [];
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('readest_last_crash');
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopFreezeDetection();
    this.markCleanShutdown();
  }
}

// Singleton instance
export const crashTracker = new CrashTracker();

// Mark clean shutdown on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    crashTracker.markCleanShutdown();
  });
}

export default crashTracker;
