import { createClient } from '@supabase/supabase-js';
import { determineShowStatus, pruneMetadata, type WatchStatus } from '../src/lib/watchlist-shared';
import type { TMDBMedia } from '../src/lib/tmdb';

/**
 * Refresh API Handler
 * Called by Vercel Cron to refresh watchlist metadata.
 * Protected by CRON_SECRET - requests without valid authorization are rejected.
 * 
 * Note: Vercel Cron on free tier has 10s timeout, so this is kept for manual testing only.
 * Primary refresh runs via GitHub Actions (6-hour timeout).
 */

// Timing-safe comparison to prevent timing attacks
async function secureCompare(a: string, b: string): Promise<boolean> {
    if (!a || !b || a.length !== b.length) return false;
    
    try {
        const { timingSafeEqual } = await import('crypto');
        return timingSafeEqual(
            Buffer.from(a, 'utf8'),
            Buffer.from(b, 'utf8')
        );
    } catch {
        return false;
    }
}

// --- Handler ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(request: any, response: any) {
    // 1. Security Check - CRON_SECRET is REQUIRED
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
        console.error('[Refresh] CRITICAL: CRON_SECRET is not configured');
        return response.status(500).json({ error: 'Server misconfiguration: CRON_SECRET not set' });
    }
    
    const authHeader = request.headers['authorization'] || '';
    const expectedAuth = `Bearer ${cronSecret}`;
    
    if (!(await secureCompare(authHeader, expectedAuth))) {
        console.warn('[Refresh] Unauthorized request attempt');
        return response.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Validate environment variables
    const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY;
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!TMDB_API_KEY) {
        console.error('[Refresh] Missing VITE_TMDB_API_KEY');
        return response.status(500).json({ error: 'Missing TMDB API key' });
    }
    
    if (!SUPABASE_URL) {
        console.error('[Refresh] Missing VITE_SUPABASE_URL');
        return response.status(500).json({ error: 'Missing Supabase URL' });
    }
    
    if (!SUPABASE_SERVICE_ROLE_KEY) {
        console.error('[Refresh] Missing SUPABASE_SERVICE_ROLE_KEY');
        return response.status(500).json({ error: 'Missing Supabase service role key' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const region = 'IN';

    try {
        // 3. Fetch stale items (candidates for refresh)
        const { data: candidates, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .in('status', ['movie_coming_soon', 'movie_on_ott', 'show_returning', 'show_ongoing', 'show_watching', 'show_new', 'show_watched'])
            .order('updated_at', { ascending: true })
            .limit(5);

        if (fetchError) {
            console.error('[Refresh] Failed to fetch candidates:', fetchError);
            throw fetchError;
        }

        if (!candidates || candidates.length === 0) {
            return response.status(200).json({ status: 'ok', count: 0, message: 'No items to refresh' });
        }

        // 4. Process items in parallel to beat the 10-second timeout
        const results = await Promise.all((candidates || []).map(async (item) => {
            try {
                const tmdbType = item.type === 'show' ? 'tv' : 'movie';
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                
                // Fetch from TMDB
                const detailsRes = await fetch(
                    `https://api.themoviedb.org/3/${tmdbType}/${item.tmdb_id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers,videos,external_ids,release_dates`,
                    { signal: controller.signal }
                );
                
                clearTimeout(timeoutId);
                
                if (!detailsRes.ok) {
                    console.error(`[Refresh] TMDB fetch failed for ${item.title}:`, detailsRes.status);
                    return { title: item.title, success: false, error: `TMDB ${detailsRes.status}` };
                }
                
                const details = await detailsRes.json();

                // Calculate new status
                let newStatus = item.status as WatchStatus;
                if (item.type === 'show') {
                    newStatus = determineShowStatus(details as TMDBMedia, item.last_watched_season || 0, item.progress || 0);
                } else {
                    // Movie logic - check providers, digital dates, and global availability
                    const providers = details['watch/providers']?.results?.[region];
                    const hasProviders = (providers?.flatrate?.length > 0) || (providers?.ads?.length > 0);
                    
                    // Extract digital release date from release_dates
                    let digitalDate: string | null = null;
                    if (details.release_dates?.results) {
                        const regionData = details.release_dates.results.find((r: any) => r.iso_3166_1 === region);
                        if (regionData?.release_dates) {
                            // Priority: Digital (Type 4) -> Physical (Type 5)
                            const digital = regionData.release_dates.find((d: any) => d.type === 4) || 
                                          regionData.release_dates.find((d: any) => d.type === 5);
                            digitalDate = digital?.release_date || null;
                        }
                    }
                    
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const digitalDateObj = digitalDate ? new Date(digitalDate) : null;
                    const releaseDateObj = details.release_date ? new Date(details.release_date) : null;
                    const hasFutureDigitalDate = digitalDateObj && digitalDateObj > today;
                    const isReleased = !releaseDateObj || releaseDateObj <= today;
                    const hasValidDigitalTransition = item.status === 'movie_coming_soon' && isReleased && !!digitalDateObj;
                    
                    // Check if movie is old (>1 year) or globally available (>6 months)
                    let isOldOrGloballyAvailable = false;
                    if (releaseDateObj) {
                        const oneYearAgo = new Date();
                        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                        const sixMonthsAgo = new Date();
                        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                        
                        if (releaseDateObj < oneYearAgo) {
                            isOldOrGloballyAvailable = true;
                        } else if (releaseDateObj < sixMonthsAgo) {
                            // Check global availability
                            const allProviders = details['watch/providers']?.results || {};
                            for (const r in allProviders) {
                                const p = allProviders[r];
                                if ((p.flatrate || []).length > 0 || (p.rent || []).length > 0 || (p.buy || []).length > 0) {
                                    isOldOrGloballyAvailable = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Apply "Gatekeeper Rule" from MOVIE_LOGIC.md - only upgrade to movie_on_ott from movie_coming_soon
                    if (item.status === 'movie_coming_soon') {
                        if (hasProviders || hasFutureDigitalDate || hasValidDigitalTransition || isOldOrGloballyAvailable) {
                            newStatus = 'movie_on_ott';
                        }
                    }
                    // Keep movie_on_ott status if already set
                    else if (item.status === 'movie_on_ott') {
                        newStatus = 'movie_on_ott';
                    }
                }

                const updatedMeta = {
                    ...(item.metadata || {}),
                    ...details,
                    last_updated_at: Date.now()
                };
                const pruned = pruneMetadata(updatedMeta, region);

                // Save back to Supabase
                const { error: updateError } = await supabase
                    .from('watchlist')
                    .update({ 
                        metadata: pruned, 
                        status: newStatus,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', item.id);

                if (updateError) {
                    console.error(`[Refresh] Failed to update ${item.title}:`, updateError);
                    return { title: item.title, success: false, error: 'DB update failed' };
                }

                return { 
                    title: item.title, 
                    oldStatus: item.status, 
                    newStatus, 
                    success: true 
                };
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                console.error(`[Refresh] Error processing ${item.title}:`, errorMessage);
                return { title: item.title, success: false, error: errorMessage };
            }
        }));

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        return response.status(200).json({ 
            status: 'ok', 
            count: results.length,
            successful: successful.length,
            failed: failed.length,
            processed: successful.map(r => r.title),
            errors: failed.map(r => ({ title: r.title, error: r.error }))
        });
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Refresh] Job failed:', errorMessage);
        return response.status(500).json({ error: errorMessage });
    }
}
