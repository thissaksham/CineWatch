import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { determineShowStatus, pruneMetadata, type WatchStatus } from '../src/lib/watchlist-shared';
import type { TMDBMedia } from '../src/lib/tmdb';

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

    try {
        console.log('Fetching items to refresh from Supabase...');
        const { data: candidates, error: fetchError } = await supabase
            .from('watchlist')
            .select('*')
            .in('status', ['movie_coming_soon', 'movie_on_ott', 'show_returning', 'show_ongoing', 'show_watching', 'show_new', 'show_watched'])
            .order('created_at', { ascending: true }); // No limit, fetch all

        if (fetchError) throw fetchError;
        if (!candidates || candidates.length === 0) {
            console.log('No items found for refresh.');
            return;
        }

        console.log(`Found ${candidates.length} items to process.`);

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
                    console.log(`[Processing] ${item.type.toUpperCase()}: ${item.title}`);
                    
                    const detailsRes = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${item.tmdb_id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers,videos,external_ids,release_dates`);
                    if (!detailsRes.ok) throw new Error(`TMDB Fetch Failed`);
                    
                    const details = await detailsRes.json();

                    let newStatus = item.status as WatchStatus;
                    if (item.type === 'show') {
                        newStatus = determineShowStatus(details as TMDBMedia, item.last_watched_season || 0, item.progress || 0);
                    } else {
                        // Movie logic - check providers, digital dates, and global availability
                        const providers = details['watch/providers']?.results?.[region];
                        let hasProviders = (providers?.flatrate?.length > 0) || (providers?.ads?.length > 0);
                        
                        // Watchmode fallback for providers
                        if (!hasProviders && WATCHMODE_API_KEYS.length > 0) {
                            const wmProviders = await fetchWatchmodeFallback(item.tmdb_id, item.type as 'movie' | 'tv', region, WATCHMODE_API_KEYS);
                            if (wmProviders) {
                                details['watch/providers'] = { results: { [region]: wmProviders } };
                                hasProviders = (wmProviders.flatrate.length > 0) || (wmProviders.free?.length > 0);
                            }
                        }

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

                    const updatedMeta = { ...(item.metadata || {}), ...details, last_updated_at: Date.now() };
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
    }
}

runRefresh();
