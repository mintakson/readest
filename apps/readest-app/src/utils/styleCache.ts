/**
 * Stylesheet transformation cache
 * Memoizes transformed stylesheets to prevent repeated expensive computations
 */

interface CacheEntry {
  result: string;
  timestamp: number;
  hits: number;
}

class StylesheetCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 100;
  private maxAge = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate cache key from parameters
   */
  private getCacheKey(vw: number, vh: number, css: string): string {
    // Use hash of CSS content + viewport dimensions
    // For production, consider using a proper hash function
    const cssHash = this.simpleHash(css);
    return `${vw}x${vh}-${cssHash}`;
  }

  /**
   * Simple hash function for strings
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get cached transformation result
   */
  get(vw: number, vh: number, css: string): string | null {
    const key = this.getCacheKey(vw, vh, css);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry is stale
    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    // Update hit count
    entry.hits++;
    return entry.result;
  }

  /**
   * Store transformation result
   */
  set(vw: number, vh: number, css: string, result: string): void {
    const key = this.getCacheKey(vw, vh, css);

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Evict oldest or least used entries
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Prefer evicting old entries with low hit counts
      const score = entry.timestamp / (entry.hits + 1);
      if (score < oldestTime) {
        oldestTime = score;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    entries: Array<{ age: number; hits: number }>;
  } {
    const entries: Array<{ age: number; hits: number }> = [];
    const now = Date.now();

    for (const entry of this.cache.values()) {
      entries.push({
        age: now - entry.timestamp,
        hits: entry.hits,
      });
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries,
    };
  }
}

// Singleton instance
export const stylesheetCache = new StylesheetCache();

export default stylesheetCache;
