/**
 * Memory management utilities
 * Provides memory cleanup, monitoring, and optimization for tablets and low-memory devices
 */

import { performanceMonitor } from './performance';

export interface MemoryStatus {
  isLowMemory: boolean;
  usedPercentage: number;
  availableMemory?: number;
  totalMemory?: number;
}

class MemoryManager {
  private cleanupCallbacks: Set<() => void> = new Set();
  private monitoringInterval?: NodeJS.Timeout;
  private lowMemoryThreshold = 0.85; // 85% of heap limit
  private criticalMemoryThreshold = 0.95; // 95% of heap limit

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupLowMemoryDetection();
    }
  }

  /**
   * Setup low memory detection
   */
  private setupLowMemoryDetection(): void {
    // Monitor memory every 10 seconds
    this.monitoringInterval = setInterval(() => {
      const status = this.getMemoryStatus();

      if (status.isLowMemory) {
        console.warn(
          `Low memory detected: ${status.usedPercentage.toFixed(1)}% of heap used`
        );
        this.performCleanup();
      }

      // Critical memory - force garbage collection if available
      if (status.usedPercentage > this.criticalMemoryThreshold) {
        console.error(
          `Critical memory level: ${status.usedPercentage.toFixed(1)}% of heap used`
        );
        this.forcedCleanup();
      }
    }, 10000);
  }

  /**
   * Get current memory status
   */
  getMemoryStatus(): MemoryStatus {
    if (typeof window === 'undefined' || !(performance as any).memory) {
      return {
        isLowMemory: false,
        usedPercentage: 0,
      };
    }

    const memory = (performance as any).memory;
    const usedPercentage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

    return {
      isLowMemory: usedPercentage > this.lowMemoryThreshold * 100,
      usedPercentage,
      availableMemory: memory.jsHeapSizeLimit - memory.usedJSHeapSize,
      totalMemory: memory.jsHeapSizeLimit,
    };
  }

  /**
   * Register cleanup callback
   */
  registerCleanupCallback(callback: () => void): () => void {
    this.cleanupCallbacks.add(callback);

    // Return unregister function
    return () => {
      this.cleanupCallbacks.delete(callback);
    };
  }

  /**
   * Perform memory cleanup
   */
  performCleanup(): void {
    console.log('Performing memory cleanup...');

    // Call all registered cleanup callbacks
    this.cleanupCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('Error in cleanup callback:', error);
      }
    });

    // Clear caches
    this.clearCaches();

    // Take memory snapshot after cleanup
    performanceMonitor.takeMemorySnapshot();
  }

  /**
   * Forced cleanup for critical memory situations
   */
  private forcedCleanup(): void {
    this.performCleanup();

    // Request garbage collection if available (Chrome DevTools)
    if (typeof window !== 'undefined' && (window as any).gc) {
      try {
        (window as any).gc();
        console.log('Forced garbage collection');
      } catch (e) {
        // GC not available
      }
    }
  }

  /**
   * Clear various browser caches
   */
  private clearCaches(): void {
    // Clear URL.createObjectURL blobs
    if (typeof URL !== 'undefined' && URL.revokeObjectURL) {
      // Blobs are tracked elsewhere, this is just a placeholder
      // In practice, you'd track created URLs and revoke them
    }

    // Clear image caches (for old browsers)
    if (typeof document !== 'undefined') {
      const images = document.querySelectorAll('img[src^="blob:"]');
      images.forEach((img) => {
        const src = img.getAttribute('src');
        if (src) {
          URL.revokeObjectURL(src);
        }
      });
    }
  }

  /**
   * Optimize for tablets and low-memory devices
   */
  optimizeForDevice(): {
    maxConcurrentBooks: number;
    enableAnimations: boolean;
    imageQuality: 'high' | 'medium' | 'low';
    cacheStrategy: 'aggressive' | 'moderate' | 'minimal';
  } {
    const status = this.getMemoryStatus();
    const totalMemory = status.totalMemory || 0;

    // Heuristics based on available memory
    // Modern devices typically have 2GB+ heap limit
    const isLowEndDevice = totalMemory < 500 * 1024 * 1024; // < 500MB
    const isMidRangeDevice =
      totalMemory >= 500 * 1024 * 1024 && totalMemory < 1024 * 1024 * 1024; // 500MB - 1GB

    if (isLowEndDevice) {
      return {
        maxConcurrentBooks: 1,
        enableAnimations: false,
        imageQuality: 'low',
        cacheStrategy: 'minimal',
      };
    } else if (isMidRangeDevice) {
      return {
        maxConcurrentBooks: 2,
        enableAnimations: true,
        imageQuality: 'medium',
        cacheStrategy: 'moderate',
      };
    } else {
      return {
        maxConcurrentBooks: 4,
        enableAnimations: true,
        imageQuality: 'high',
        cacheStrategy: 'aggressive',
      };
    }
  }

  /**
   * Check if device can handle operation
   */
  canHandleOperation(estimatedMemoryMB: number): boolean {
    const status = this.getMemoryStatus();

    if (!status.availableMemory) {
      // Can't determine, allow it
      return true;
    }

    const estimatedBytes = estimatedMemoryMB * 1024 * 1024;
    const availableAfterOperation = status.availableMemory - estimatedBytes;

    // Ensure at least 20% of heap remains free
    const minFreeMemory = (status.totalMemory || 0) * 0.2;

    return availableAfterOperation > minFreeMemory;
  }

  /**
   * Estimate book memory usage
   */
  estimateBookMemoryUsage(fileSizeBytes: number, format: string): number {
    // Rough estimates based on format
    // EPUB: 3-5x file size (decompression + DOM)
    // PDF: 4-8x file size (page rendering)
    // MOBI: 3-5x file size
    // CBZ: 2-3x file size (images)

    const multipliers: Record<string, number> = {
      EPUB: 4,
      PDF: 6,
      MOBI: 4,
      AZW: 4,
      AZW3: 4,
      CBZ: 2.5,
      FB2: 3,
      FBZ: 3,
    };

    const multiplier = multipliers[format] || 4;
    return (fileSizeBytes * multiplier) / (1024 * 1024); // Return MB
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.cleanupCallbacks.clear();
  }
}

// Singleton instance
export const memoryManager = new MemoryManager();

/**
 * Hook for React components to register cleanup
 * Note: Import React in your component to use this hook
 */
export function useMemoryCleanup(callback: () => void): () => void {
  return memoryManager.registerCleanupCallback(callback);
}

/**
 * Track blob URLs for cleanup
 */
export class BlobURLTracker {
  private urls: Set<string> = new Set();

  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  revoke(url: string): void {
    if (this.urls.has(url)) {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }
  }

  revokeAll(): void {
    this.urls.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.urls.clear();
  }

  getTrackedCount(): number {
    return this.urls.size;
  }
}

export default memoryManager;
