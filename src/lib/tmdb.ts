const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
import { fetchWatchmodeDetails } from './watchmode';
import { TIMEOUTS } from '../constants/timeouts';
const BASE_URL = '/api/tmdb';

if (!TMDB_API_KEY) {
    console.error("Missing TMDB API Key! Check .env");
}

// Logic to determine Auth type:
// V4 Read Access Tokens are long JWTs (usually start with eyJ)
// V3 API Keys are shorter hex strings (~32 chars)
const isBearerToken = TMDB_API_KEY && TMDB_API_KEY.length > 60;

// Initialize Region from LocalStorage (User Preference)
// This will be synced with user_metadata on login
// DEPRECATED: Use PreferencesContext
// export let TMDB_REGION = localStorage.getItem('tmdb_region') || 'IN';

export const REGIONS = [
    { code: 'IN', name: 'India', flag: '🇮🇳' },
    { code: 'US', name: 'United States', flag: '🇺🇸' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'AE', name: 'UAE', flag: '🇦🇪' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵' },
    { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
    { code: 'IE', name: 'Ireland', flag: '🇮🇪' },
    { code: 'IT', name: 'Italy', flag: '🇮🇹' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪' },
    { code: 'FR', name: 'France', flag: '🇫🇷' },
    { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
    { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
    { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
    { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
    { code: 'PH', name: 'Philippines', flag: '🇵🇱' }, // Flag fix
    { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
    { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
    { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
    { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
    { code: 'BG', name: 'Bulgaria', flag: '🇧🇬' },
    { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
    { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
    { code: 'FI', name: 'Finland', flag: '🇫🇮' },
    { code: 'GR', name: 'Greece', flag: '🇬🇷' },
    { code: 'HU', name: 'Hungary', flag: '🇭🇺' },
    { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
    { code: 'NO', name: 'Norway', flag: '🇳🇴' },
    { code: 'PL', name: 'Poland', flag: '🇵🇱' },
    { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
    { code: 'RU', name: 'Russia', flag: '🇷🇺' },
    { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
    { code: 'TW', name: 'Taiwan', flag: '🇹🇼' },
].filter((v, i, a) => a.findIndex(t => (t.code === v.code)) === i);

const getHeaders = () => {
    const headers: Record<string, string> = {
        accept: 'application/json',
    };
    if (isBearerToken) {
        headers.Authorization = `Bearer ${TMDB_API_KEY}`;
    }
    return headers;
};

// Helper for fetching
async function fetchTMDB(endpoint: string, params: Record<string, string> = {}, region: string) {
    const queryParams: Record<string, string> = {
        region: region,
        ...params,
    };

    // Key is injected by Vite Proxy
    // if (!isBearerToken && TMDB_API_KEY) {
    //     queryParams.api_key = TMDB_API_KEY;
    // }

    const query = new URLSearchParams(queryParams).toString();
    const url = `${BASE_URL}${endpoint}?${query}`;
    const safeUrl = url.replace(/api_key=[^&]*&?/i, 'api_key=HIDDEN&');
    console.log(`[TMDB] Fetching: ${safeUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.API_STANDARD); // 10s for user requests

    try {
        const res = await fetch(url, {
            headers: getHeaders(),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            // Log the full error for debugging
            console.error('[TMDB] Request Failed:', res.status, res.statusText, errBody);
            throw new Error(`TMDB Error: ${res.status} ${res.statusText} - ${errBody.status_message || ''}`);
        }

        return res.json();
    } catch (error: unknown) {
        clearTimeout(timeoutId);
        console.error('[TMDB] Network/Fetch Error:', error);
        if (error instanceof Error && error.name === 'AbortError') {
            const safeUrl = url.replace(/api_key=[^&]*&?/i, 'api_key=HIDDEN&');
            throw new Error(`Request timed out for: ${safeUrl}`);
        }
        throw error;
    }
}

export interface WatchProvider {
    provider_id: number;
    provider_name: string;
    logo_path: string;
}

export interface Video {
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
}

export interface TMDBMedia {
    id: number;
    title?: string;
    name?: string;
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    overview: string;
    release_date?: string;
    first_air_date?: string;
    media_type?: 'movie' | 'tv';
    runtime?: number;
    episode_run_time?: number[];
    number_of_episodes?: number;
    number_of_seasons?: number;
    last_episode_to_air?: {
        runtime: number;
        season_number: number;
        episode_number: number;
        air_date: string;
        episode_type?: string;
    } | null;
    next_episode_to_air?: {
        season_number: number;
        episode_number: number;
        air_date: string;
        episode_type?: string;
    } | null;
    external_ids?: {
        imdb_id?: string;
        facebook_id?: string;
        instagram_id?: string;
        twitter_id?: string;
    };
    tvmaze_runtime?: number;
    status?: string;
    tmdb_status?: string; // Original TMDB status (e.g., 'Ended', 'Returning Series') for logic when status is overwritten by Supabase status
    'watch/providers'?: {
        results: Record<string, { link: string; flatrate?: WatchProvider[]; rent?: WatchProvider[]; buy?: WatchProvider[]; ads?: WatchProvider[]; free?: WatchProvider[] }>;
    };
    genres?: { id: number; name: string }[];
    seasons?: {
        id: number;
        name: string;
        overview: string;
        poster_path: string | null;
        season_number: number;
        episode_count: number;
        air_date: string | null;
    }[];
    videos?: {
        results: Video[];
    };
    countdown?: number; // UI propery for upcoming
    digital_release_date?: string;
    digital_release_note?: string | null;
    theatrical_release_date?: string;
    // App-Specific Overrides
    type?: 'movie' | 'show' | 'tv' | 'Miniseries'; // Added Miniseries
    manual_date_override?: boolean;
    manual_release_date?: string | null;
    manual_ott_name?: string | null;
    moved_to_library?: boolean;
    dismissed_from_upcoming?: boolean;
    last_updated_at?: number;
    last_watched_season?: number; // Added
    progress?: number; // Added
    // UI Transient Properties
    tmdbMediaType?: 'movie' | 'tv' | 'show'; // 'show' is legacy alias for 'tv'
    tabCategory?: 'ott' | 'theatrical' | 'coming_soon' | 'other';
    seasonInfo?: string;
    vote_count?: number;
    credits?: unknown;
    production_companies?: { id: number; name: string }[];
    images?: unknown;
    reviews?: unknown;
    created_at?: string; // Added for sorting
}



export const tmdb = {
    getTrending: async (type: 'movie' | 'tv' | 'all' = 'movie', timeWindow: 'day' | 'week' = 'week', region: string = 'IN'): Promise<{ results: TMDBMedia[] }> => {
        return fetchTMDB(`/trending/${type}/${timeWindow}`, {}, region);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    search: async (query: string, type: 'movie' | 'tv' | 'multi', _region: string = 'IN', page: number = 1): Promise<{ results: TMDBMedia[]; total_pages?: number; page?: number }> => {
        console.log(`[TMDB] search called: query="${query}", type="${type}", page=${page}`);
        if (!query.trim()) return { results: [] };

        // Explicitly constructing URL as requested by user:
        // https://api.themoviedb.org/3/search/tv?query={user_entry}&api_key={api_key}
        // Proxy handles Key
        // Removing region param to avoid localized release date filtering which causes incorrect years (e.g. 1987 vs 2013)
        const url = `${BASE_URL}/search/${type}?query=${encodeURIComponent(query)}&page=${page}`;
        const safeUrl = url.replace(/api_key=[^&]*&?/i, 'api_key=HIDDEN&');

        console.log(`[TMDB] Fetching explicitly: ${safeUrl}`);

        try {
            const res = await fetch(url);
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                console.error('[TMDB] Search Request Failed:', res.status, errBody);
                throw new Error(`TMDB Search Error: ${res.status}`);
            }
            const data = await res.json();

            // Smart Filter (User Request)
            // 1. Unreleased (Future) -> Keep
            // 2. Released (Past/Null) -> Filter if (No Poster AND No Votes)
            if (data.results && Array.isArray(data.results)) {
                const today = new Date();
                data.results = data.results.filter((item: TMDBMedia) => {
                    // Check date
                    const releaseDate = item.release_date || item.first_air_date;
                    const isFuture = releaseDate ? new Date(releaseDate) > today : false;

                    if (isFuture) return true; // Keep all upcoming

                    // For passed/unknown dates, filter out "junk"
                    const hasPoster = !!item.poster_path;
                    const hasVotes = (item.vote_count ?? 0) > 0;

                    // Keep if it has at least one indicator of quality
                    return hasPoster || hasVotes;
                });
            }
            return data;
        } catch (error) {
            console.error('[TMDB] Search Network Error:', error);
            throw error;
        }
    },

    getDetails: async (id: number, type: 'movie' | 'tv', region: string = 'IN'): Promise<TMDBMedia> => {
        const data = await fetchTMDB(`/${type}/${id}`, {
            append_to_response: 'watch/providers,external_ids,videos'
        }, region);

        // Check if TMDB has provider data for the user's region
        const tmdbProviders = (data as TMDBMedia)['watch/providers']?.results?.[region];
        const hasProviders = tmdbProviders && (tmdbProviders.flatrate || tmdbProviders.rent || tmdbProviders.buy || tmdbProviders.ads || tmdbProviders.free);

        if (!hasProviders) {
            console.log(`[TMDB] No providers found for ${region}. Checking Watchmode...`);
            try {
                // Determine TYPE carefully (TMDB vs App Types)
                // getDetails argument 'type' is 'movie' | 'tv' strictly
                const fallback = await fetchWatchmodeDetails(id, type, region);

                if (fallback) {
                    if (!data['watch/providers']) data['watch/providers'] = { results: {} };
                    if (!data['watch/providers'].results) data['watch/providers'].results = {};
                    data['watch/providers'].results[region] = fallback;
                    console.log(`[Watchmode] Fallback successful for ${region}`);
                } else {
                    console.log(`[Watchmode] No data found.`);
                }
            } catch (e) {
                console.warn("[Watchmode] Fallback failed", e);
            }
        }

        return data;
    },

    getReleaseDates: async (id: number): Promise<{ results: { iso_3166_1: string; release_dates: { type: number; release_date: string; note?: string }[] }[] }> => {
        // Release dates are global, but maybe we should filter? No, standard API returns all.
        // We do not need region param here necessarily, unless we want to filter on server side.
        // For now, keep it simple.
        // Passing 'US' as default just to satisfy fetchTMDB signature if we change it.
        // But simpler:
        return fetchTMDB(`/movie/${id}/release_dates`, {}, 'US');
    }
};

// Helper to safely calculate total runtime (Binge Time) for sorting and display
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const calculateMediaRuntime = (media: any): number => {
    // 1. Handle Movies (Simple) or explicit runtime
    if (media.type === 'movie' || media.tmdb_type === 'movie' || media.media_type === 'movie') {
        return media.runtime || 0;
    }

    // 2. Handle Shows (Complex)
    // Check for nested metadata if passed a watchlist item
    const data = media.metadata || media;

    // Safety check for TV type (though logic below is safe regardless)
    let avgRuntime = 0;

    // Priority 1: TVMaze (Most accurate average)
    if (data.tvmaze_runtime) {
        avgRuntime = data.tvmaze_runtime;
    }
    // Priority 2: TMDB Episode Runtime (Min or Average)
    else if (data.episode_run_time && data.episode_run_time.length > 0) {
        // Use minimum length to be conservative
        avgRuntime = Math.min(...data.episode_run_time);
    }
    // Priority 3: Last Episode Fallback (Good for shows with 0 avg)
    else if (data.last_episode_to_air?.runtime) {
        avgRuntime = data.last_episode_to_air.runtime;
    }
    // Priority 4: Generic Runtime property
    else if (data.runtime) {
        avgRuntime = data.runtime;
    }

    const episodes = data.number_of_episodes || 0;

    // If we found a runtime and have episodes, return total
    if (avgRuntime && episodes) {
        return avgRuntime * episodes;
    }

    // Fallback: If no episodes count but we have runtime, return just runtime (better than 0)
    return avgRuntime || 0;
};
