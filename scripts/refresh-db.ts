import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { determineShowStatus, pruneMetadata, type WatchStatus } from '../src/lib/watchlist-shared';
import type { TMDBMedia } from '../src/lib/tmdb';

// --- DNS Bypass for TMDB (ISP Blocking Workaround) ---

let TMDB_IP: string | null = null;

/**
 * Resolves TMDB IP using Google DNS to bypass ISP blocking
 * Caches result for the script lifetime
 */
async function resolveTMDBIP(): Promise<string | null> {
    if (TMDB_IP) return TMDB_IP; // Return cached IP
    
    try {
        console.log('[DNS] Resolving api.themoviedb.org via Google DNS...');
        const res = await fetch('https://dns.google/resolve?name=api.themoviedb.org');
        const data = await res.json() as { Answer?: { type: number; data: string }[] };
        const ip = data.Answer?.find(a => a.type === 1)?.data; // Type 1 is A Record
        
        if (ip && typeof ip === 'string') {
            TMDB_IP = ip.trim();
            console.log(`[DNS] Resolved TMDB to: ${TMDB_IP}`);
            return TMDB_IP;
        }
    } catch (e) {
        console.warn('[DNS] Google DNS resolution failed, will use hostname:', e);
    }
    
    return null;
}

/**
 * Fetch wrapper that uses resolved TMDB IP if available
 * Falls back to normal fetch if DNS resolution fails
 */
async function fetchTMDB(url: string, options: RequestInit = {}): Promise<Response> {
    const urlObj = new URL(url);
    
    // Only apply DNS bypass for TMDB domains
    if (!urlObj.hostname.includes('themoviedb.org')) {
        return fetch(url, options);
    }
    
    // Try direct hostname first (works if DNS is functional)
    try {
        return await fetch(url, options);
    } catch (directError) {
        console.warn('[DNS] Direct hostname failed, trying Google DNS bypass...');
        
        // Fallback: Resolve via Google DNS and try IP
        const tmdbIP = await resolveTMDBIP();
        
        if (tmdbIP) {
            const directUrl = url.replace(urlObj.hostname, tmdbIP);
            return fetch(directUrl, {
                ...options,
                headers: {
                    ...options.headers,
                    'Host': urlObj.hostname
                }
            });
        }
        
        // Re-throw original error if everything fails
        throw directError;
    }
}

// --- Helper Functions ---

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapWatchmodeSource = (s: any) => ({
    provider_id: s.source_id,
    provider_name: s.name,
    logo_path: null,
    display_priority: 10
});

let currentWMKeyIndex = 0;
let watchmodeCallsThisRun = 0;
const MAX_WATCHMODE_CALLS_PER_RUN = 20; // Limit to ~20 calls per refresh (40 API requests total)

const fetchWatchmodeFallback = async (tmdbId: number, type: 'movie' | 'tv', region: string, apiKeys: string[]) => {
    if (!apiKeys || apiKeys.length === 0) return null;

    for (let i = 0; i < apiKeys.length; i++) {
        const index = (currentWMKeyIndex + i) % apiKeys.length;
        const apiKey = apiKeys[index];
        
        try {
            const searchField = type === 'movie' ? 'tmdb_movie_id' : 'tmdb_tv_id';
            const searchUrl = `https://api.watchmode.com/v1/search/?apiKey=${apiKey}&search_field=${searchField}&search_value=${tmdbId}`;
            const searchRes = await fetch(searchUrl);
            
            if (searchRes.status === 402 || searchRes.status === 429) {
                console.warn(`[Watchmode Script] Key index ${index} exhausted. Trying next...`);
                continue;
            }

            if (!searchRes.ok) return null;
            const searchData = await searchRes.json();
            const watchmodeId = searchData.title_results?.[0]?.id;
            if (!watchmodeId) return null;

            const sourcesUrl = `https://api.watchmode.com/v1/title/${watchmodeId}/sources/?apiKey=${apiKey}&regions=${region}`;
            const sourcesRes = await fetch(sourcesUrl);
            
            if (sourcesRes.status === 402 || sourcesRes.status === 429) {
                console.warn(`[Watchmode Script] Key index ${index} exhausted during sources fetch. Trying next...`);
                continue;
            }

            if (!sourcesRes.ok) return null;
            const sourcesData = await sourcesRes.json();
            const sources = Array.isArray(sourcesData) ? sourcesData : [];

            // Update global index so next calls start here
            currentWMKeyIndex = index;

            return {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                flatrate: sources.filter((s: any) => s.type === 'sub').map(mapWatchmodeSource),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                rent: sources.filter((s: any) => s.type === 'rent').map(mapWatchmodeSource),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                buy: sources.filter((s: any) => s.type === 'buy').map(mapWatchmodeSource),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                free: sources.filter((s: any) => s.type === 'free').map(mapWatchmodeSource)
            };
        } catch (e) {
            console.error(`[Watchmode Fallback Error] Key index ${index}:`, e);
            if (i === apiKeys.length - 1) return null;
        }
    }
    return null;
};

// --- Job Lock Functions (Database Table-Based) ---

/**
 * Acquires a database table-based lock to prevent concurrent refresh jobs
 * Uses INSERT with ON CONFLICT to atomically check and acquire locks
 * @param supabase - Supabase client instance
 * @returns true if lock acquired, false if another job is running
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function acquireRefreshLock(supabase: any): Promise<boolean> {
    const LOCK_NAME = 'refresh_job';
    const TIMEOUT_MINUTES = 60; // Lock expires after 1 hour
    
    try {
        const { data, error } = await supabase.rpc('try_acquire_job_lock', {
            p_lock_name: LOCK_NAME,
            p_timeout_minutes: TIMEOUT_MINUTES
        } as any);
        
        if (error) {
            console.error('[Lock] Failed to acquire lock:', error);
            return false;
        }
        
        return data === true;
    } catch (e) {
        console.error('[Lock] Exception while acquiring lock:', e);
        return false;
    }
}

/**
 * Releases the database table-based lock
 * @param supabase - Supabase client instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function releaseRefreshLock(supabase: any): Promise<void> {
    const LOCK_NAME = 'refresh_job';
    
    try {
        const { error } = await supabase.rpc('release_job_lock', {
            p_lock_name: LOCK_NAME
        } as any);
        
        if (error) {
            console.error('[Lock] Failed to release lock:', error);
        }
    } catch (e) {
        console.error('[Lock] Exception while releasing lock:', e);
    }
}


// --- Main Execution ---

async function runRefresh() {
    console.log('--- Starting Refresh Job ---');
    
    const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY;
    const WATCHMODE_RAW = process.env.VITE_WATCHMODE_API_KEY || process.env.WATCHMODE_API_KEY || '';
    const WATCHMODE_API_KEYS = WATCHMODE_RAW.split(',').map(k => k.trim()).filter(Boolean);
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const region = 'IN';

    if (!TMDB_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Missing environment variables. Ensure VITE_TMDB_API_KEY, VITE_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are set.');
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Acquire advisory lock to prevent concurrent refresh jobs
    console.log('Attempting to acquire refresh lock...');
    const lockAcquired = await acquireRefreshLock(supabase);
    if (!lockAcquired) {
        console.log('[Refresh] Another refresh job is running. Exiting.');
        process.exit(0);
    }
    console.log('Lock acquired successfully.');

    try {
        console.log('Fetching items to refresh from Supabase...');
        const { data: allItems, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .order('created_at', { ascending: true });

        if (fetchError) throw fetchError;
        if (!allItems || allItems.length === 0) {
            console.log('No items found for refresh.');
            return;
        }

        // Filter candidates: Include all shows except truly ended ones
        // For movies: only coming_soon and on_ott need updates
        const candidates = allItems.filter(item => {
            // Movies: Only refresh if coming_soon, on_ott, or status is reset (NULL)
            if (item.type === 'movie') {
                return !item.status || ['movie_coming_soon', 'movie_on_ott'].includes(item.status);
            }
            
            // Shows: Refresh ALL unless TMDB status is "Ended" or "Canceled"
            if (item.type === 'show') {
                const tmdbStatus = item.metadata?.status || item.metadata?.tmdb_status;
                
                // Always refresh if not ended/canceled
                if (tmdbStatus !== 'Ended' && tmdbStatus !== 'Canceled') {
                    return true;
                }
                
                // For ended/canceled shows, still refresh periodically to catch:
                // 1. Revivals/uncancelations (status change to "Returning Series")
                // 2. Final episode count corrections
                // 3. Reboots or continuation announcements
                const lastUpdated = item.metadata?.last_updated_at || 0;
                const daysSinceUpdate = (Date.now() - lastUpdated) / (1000 * 60 * 60 * 24);
                
                // Refresh ended/canceled shows every 14 days (catches revivals faster than 30 days)
                // Still respects rate limits while being responsive to status changes
                if (daysSinceUpdate > 14) {
                    return true;
                }
                
                // Also refresh if the show has future seasons announced (revival indicator)
                // Even if TMDB status still shows "Ended", there might be new season data
                const hasFutureSeasons = item.metadata?.seasons?.some((s: any) => {
                    if (s.season_number === 0) return false; // Skip specials
                    const airDate = s.air_date ? new Date(s.air_date) : null;
                    return airDate && airDate > new Date(); // Future air date
                });
                
                if (hasFutureSeasons) {
                    return true; // Likely a revival - refresh it
                }
                
                return false; // Skip if ended, recently updated, and no future seasons
            }
            
            return false;
        });

        console.log(`Found ${candidates.length} items to process (${allItems.length} total in watchlist).`);

        // Priority-based sorting: Process items that need updates most urgently
        const prioritizedCandidates = candidates.sort((a, b) => {
            // Priority 1: movies_coming_soon with recent release dates (likely released)
            const aIsComingSoon = a.status === 'movie_coming_soon';
            const bIsComingSoon = b.status === 'movie_coming_soon';
            if (aIsComingSoon !== bIsComingSoon) return aIsComingSoon ? -1 : 1;
            
            // Priority 2: Items not updated recently (staleness)
            const aUpdated = new Date(a.updated_at || a.created_at).getTime();
            const bUpdated = new Date(b.updated_at || b.created_at).getTime();
            const staleness = aUpdated - bUpdated;
            if (Math.abs(staleness) > 7 * 24 * 60 * 60 * 1000) return staleness; // 7 days diff
            
            // Priority 3: Release date proximity (upcoming releases)
            const aMetadata = a.metadata as { release_date?: string } | null;
            const bMetadata = b.metadata as { release_date?: string } | null;
            const aRelease = aMetadata?.release_date ? new Date(aMetadata.release_date).getTime() : Infinity;
            const bRelease = bMetadata?.release_date ? new Date(bMetadata.release_date).getTime() : Infinity;
            const now = Date.now();
            const aProximity = Math.abs(aRelease - now);
            const bProximity = Math.abs(bRelease - now);
            
            return aProximity - bProximity; // Closer release dates first
        });

        console.log(`[Priority] Top item: ${prioritizedCandidates[0]?.title} (${prioritizedCandidates[0]?.status})`);


        const BATCH_SIZE = 10;
        const DELAY_MS = 60000; // 1 minute between batches
        let processedCount = 0;
        let successCount = 0;

        for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
            const batch = candidates.slice(i, i + BATCH_SIZE);
            console.log(`\n--- Processing Batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items) ---`);

            const batchResults = await Promise.all(batch.map(async (item) => {
                try {
                    const tmdbType = item.type === 'show' ? 'tv' : 'movie';
                    console.log(`[Processing] ${tmdbType.toUpperCase()}: ${item.title || 'Unknown'}`);
                    
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout (increased for reliability)
                    
                    const detailsRes = await fetchTMDB(
                        `https://api.themoviedb.org/3/${tmdbType}/${item.tmdb_id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers,videos,external_ids,release_dates`,
                        { signal: controller.signal }
                    );
                    clearTimeout(timeoutId);
                    if (!detailsRes.ok) throw new Error(`TMDB Fetch Failed`);
                    
                    const details = await detailsRes.json();

                    let newStatus = item.status as WatchStatus;
                    // Declare date variables at this scope so they're accessible in the metadata merge
                    let digitalDate: string | null = null;
                    let digitalNote: string | null = null;
                    let theatricalDate: string | null = null;

                    if (item.type === 'show') {
                        newStatus = determineShowStatus(details as TMDBMedia, item.last_watched_season || 0, item.progress || 0, item.status as WatchStatus);
                    } else {
                        // Movie logic - check providers, digital dates, and global availability
                        const providers = details['watch/providers']?.results?.[region];
                        let hasProviders = (providers?.flatrate?.length > 0) || (providers?.ads?.length > 0);
                        
                        // Watchmode fallback ONLY for movies that:
                        // 1. Have no TMDB providers AND
                        // 2. Are recently released (< 1 year old) AND  
                        // 3. Haven't exhausted our call limit this run
                        const releaseDate = details.release_date;
                        const isRecentRelease = releaseDate && (new Date().getTime() - new Date(releaseDate).getTime()) < 365 * 24 * 60 * 60 * 1000;
                        
                        if (!hasProviders && WATCHMODE_API_KEYS.length > 0 && isRecentRelease && watchmodeCallsThisRun < MAX_WATCHMODE_CALLS_PER_RUN) {
                            watchmodeCallsThisRun++;
                            console.log(`[Watchmode] Calling for recent movie (${watchmodeCallsThisRun}/${MAX_WATCHMODE_CALLS_PER_RUN})`);
                            const wmProviders = await fetchWatchmodeFallback(item.tmdb_id, item.type as 'movie' | 'tv', region, WATCHMODE_API_KEYS);
                            if (wmProviders) {
                                details['watch/providers'] = { results: { [region]: wmProviders } };
                                hasProviders = (wmProviders.flatrate.length > 0) || (wmProviders.free?.length > 0);
                            }
                        }

                        // Extract digital and theatrical release dates from release_dates
                        // (Mirroring getEnrichedMetadata logic from watchlist-shared.ts)
                        if (details.release_dates?.results) {
                            const regionData = details.release_dates.results.find((r: any) => r.iso_3166_1 === region);
                            if (regionData?.release_dates) {
                                // Theatrical: Type 3 (Theatrical) -> Type 2 (Limited)
                                const theatrical = regionData.release_dates.find((d: any) => d.type === 3) ||
                                                  regionData.release_dates.find((d: any) => d.type === 2);
                                theatricalDate = theatrical?.release_date || null;
                                // Digital: Type 4 (Digital) -> Type 5 (Physical)
                                const digital = regionData.release_dates.find((d: any) => d.type === 4) || 
                                              regionData.release_dates.find((d: any) => d.type === 5);
                                digitalDate = digital?.release_date || null;
                                digitalNote = digital?.note || null;
                            }
                            
                            // Global theatrical fallback (same as getEnrichedMetadata)
                            if (!theatricalDate) {
                                let earliestDate: string | null = null;
                                for (const res of details.release_dates.results) {
                                    if (!res.release_dates || !Array.isArray(res.release_dates)) continue;
                                    for (const d of res.release_dates) {
                                        if ((d.type === 2 || d.type === 3 || d.type === 4) && d.release_date) {
                                            if (!earliestDate || d.release_date < earliestDate) {
                                                earliestDate = d.release_date;
                                            }
                                        }
                                    }
                                }
                                if (earliestDate) theatricalDate = earliestDate;
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
                        
                        // Apply Categorization Logic from MOVIE_LOGIC.md
                        if (!item.status) {
                            // 1. Initial categorization for reset/new movies
                            if (hasProviders) {
                                newStatus = 'movie_unwatched';
                            } else if (hasFutureDigitalDate) {
                                newStatus = 'movie_on_ott';
                            } else if (isOldOrGloballyAvailable) {
                                newStatus = 'movie_unwatched';
                            } else {
                                newStatus = 'movie_coming_soon';
                            }
                        } else if (item.status === 'movie_coming_soon') {
                            // 2. Refresh Logic Gatekeeper: only upgrade to on_ott from coming_soon
                            if (hasProviders || hasFutureDigitalDate || hasValidDigitalTransition || isOldOrGloballyAvailable) {
                                newStatus = 'movie_on_ott';
                            }
                        }
                        // Keep movie_on_ott status if already set
                        else if (item.status === 'movie_on_ott') {
                            newStatus = 'movie_on_ott';
                        }
                    }

                    // For shows: detect new season announcements to restore to Upcoming
                    let dismissedFromUpcoming = item.metadata?.dismissed_from_upcoming;
                    if (item.type === 'show' && dismissedFromUpcoming) {
                        const oldSeasonsCount = item.metadata?.number_of_seasons || 0;
                        const newSeasonsCount = details.number_of_seasons || 0;
                        if (newSeasonsCount > oldSeasonsCount) {
                            console.log(`[Auto-Restore] New season detected for ${item.title} (${oldSeasonsCount} -> ${newSeasonsCount}). Restoring to Upcoming.`);
                            dismissedFromUpcoming = false;
                        }
                    }

                    const updatedMeta = {
                        ...(item.metadata || {}),
                        ...details,
                        last_updated_at: Date.now(),
                        dismissed_from_upcoming: dismissedFromUpcoming,
                        // For movies: store extracted app-specific date fields (mirroring getEnrichedMetadata)
                        ...(item.type === 'movie' ? {
                            digital_release_date: digitalDate || (item.metadata?.manual_date_override ? item.metadata?.digital_release_date : undefined),
                            digital_release_note: digitalDate ? digitalNote : (item.metadata?.manual_date_override ? item.metadata?.digital_release_note : undefined),
                            theatrical_release_date: theatricalDate || item.metadata?.theatrical_release_date,
                            manual_date_override: digitalDate ? false : !!item.metadata?.manual_date_override,
                        } : {})
                    };
                    const pruned = pruneMetadata(updatedMeta, region);

                    const { error: updateError } = await supabase
                        .from('watchlist')
                        .update({ metadata: pruned, status: newStatus })
                        .eq('id', item.id);

                    if (updateError) throw updateError;
                    console.log(`[Success] ${item.title}: ${item.status} -> ${newStatus}`);
                    return true;
                } catch (err: unknown) {
                    console.error(`[Error] Failed to process ${item.title}:`, err instanceof Error ? err.message : String(err));
                    return false;
                }
            }));

            successCount += batchResults.filter(r => r).length;
            processedCount += batch.length;

            if (i + BATCH_SIZE < candidates.length) {
                console.log(`Waiting ${DELAY_MS / 1000} seconds before next batch...`);
                await sleep(DELAY_MS);
            }
        }

        console.log(`\n--- Refresh Job Complete: ${successCount}/${processedCount} successful ---`);

    } catch (err: unknown) {
        console.error('CRITICAL: Refresh Job Failed:', err);
        process.exit(1);
    } finally {
        // Always release the lock
        console.log('Releasing refresh lock...');
        await releaseRefreshLock(supabase);
    }
}

runRefresh();
