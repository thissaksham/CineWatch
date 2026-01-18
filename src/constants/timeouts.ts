/**
 * Centralized Timeout Constants
 * 
 * Consistent timeout values across the application to prevent:
 * - UI freezing (frontend too long)
 * - Premature failures (backend too short)
 * - Serverless function timeouts
 */

export const TIMEOUTS = {
    /**
     * Quick API requests (search, filters)
     * Used for: User-initiated requests where speed matters
     */
    API_QUICK: 5000, // 5 seconds
    
    /**
     * Standard API requests (fetching details)
     * Used for: Most TMDB API calls, Watchmode lookups
     */
    API_STANDARD: 10000, // 10 seconds
    
    /**
     * Background/batch operations
     * Used for: Refresh jobs, bulk updates
     */
    BACKGROUND: 20000, // 20 seconds
    
    /**
     * Critical operations that can take longer
     * Used for: Initial data loads, complex aggregations
     */
    CRITICAL: 30000, // 30 seconds
} as const;

/**
 * Helper function to create abort controller with timeout
 * 
 * @example
 * const { controller, timeoutId } = createTimeoutController(TIMEOUTS.API_STANDARD);
 * try {
 *   const response = await fetch(url, { signal: controller.signal });
 * } finally {
 *   clearTimeout(timeoutId);
 * }
 */
export function createTimeoutController(timeoutMs: number) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    return {
        controller,
        timeoutId,
        cleanup: () => clearTimeout(timeoutId)
    };
}
