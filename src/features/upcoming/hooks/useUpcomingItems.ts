import { useMemo } from 'react';
import { useWatchlist } from '../../watchlist/context/WatchlistContext';
import { usePreferences } from '../../../context/PreferencesContext';
import { calculateMediaRuntime, type TMDBMedia } from '../../../lib/tmdb';
import { parseDateLocal } from '../../../lib/dateUtils';
import type { WatchlistItem } from '../../../types';

export interface UpcomingItem extends TMDBMedia {
    supabaseId: string;
    date: string;
    tmdbMediaType: 'movie' | 'tv';
    totalHours?: number | null;
    seasonInfo: string;
    providerLogo?: string | null;
    tabCategory: 'ott' | 'theatrical' | 'other';
    metadata?: TMDBMedia;
    last_updated_at?: number;
    countdown?: number;
}

import { isSeasonOngoing } from '../../../lib/watchlist-shared';

export const getDaysUntil = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

// Helper for processing media items into UpcomingItems
export const processUpcomingItem = (item: WatchlistItem, today: Date, region: string): UpcomingItem | null => {
    const meta = (item.metadata || {}) as TMDBMedia;

    // Include only items that should appear in upcoming (more robust than exclusion list)
    const upcomingStatuses = [
        'movie_on_ott', 'movie_coming_soon',
        'show_new', 'show_ongoing', 'show_returning', 'show_watching', 'show_watched'
    ];

    if (!upcomingStatuses.includes(item.status)) {
        return null;
    }

    // Special handling for shows
    if (item.type === 'show') {
        const nextEp = meta.next_episode_to_air;
        const nextDate = parseDateLocal(nextEp?.air_date);
        const lastEp = meta.last_episode_to_air;

        // For shows with NO watched seasons (unwatched), ONLY show if it is a Season Premiere
        const isUnwatched = (!item.last_watched_season || item.last_watched_season === 0) && (!item.progress || item.progress === 0);
        const hasProgress = !isUnwatched;
        
        // Check if show is actively airing (TMDB might just be slow to update)
        // Criteria: Last episode aired within last 30 days AND the season is still ongoing
        const isActivelyAiring = (() => {
            if (lastEp?.air_date) {
                // If the season is definitively finished, it's not actively airing anymore.
                if (!isSeasonOngoing(meta, lastEp.season_number)) {
                    return false;
                }
                const lastEpDate = parseDateLocal(lastEp.air_date);
                if (lastEpDate) {
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    return lastEpDate >= thirtyDaysAgo;
                }
            }
            return false;
        })();
        
        // If a show is marked as watched (caught up), ONLY show if there is a next episode scheduled.
        // We don't want to clutter Upcoming with everything we've already finished.
        if (item.status === 'show_watched') {
            if (!nextDate) return null;
        }

        // For shows in 'show_watching' status, allow through if actively airing
        // (to keep the "Latest Episode" visible while the season is ongoing).
        if (item.status === 'show_watching') {
            if (!nextDate) {
                // Only keep if has progress AND actively airing
                if (!hasProgress || !isActivelyAiring) return null;
            }
        }

        if (isUnwatched && nextEp && nextEp.episode_number !== 1) {
            return null;
        }

        // Hide active/backlog shows with no next episode info
        // Only keep if: has progress AND show is actively airing
        if (!nextEp && ['show_ongoing', 'show_returning', 'show_watching'].includes(item.status)) {
            if (!hasProgress || !isActivelyAiring) return null;
        }
    }

    if (meta.dismissed_from_upcoming) return null;

    let targetDate: Date | null = null;
    let seasonInfo = '';
    let providerLogo: string | null = null;

    const providerInfo = meta['watch/providers'];
    const regionData = providerInfo?.results?.[region];
    const flatrate = regionData?.flatrate || [];
    const allStreamingOrRental = [
        ...flatrate,
        ...(regionData?.ads || []),
        ...(regionData?.free || []),
        ...(regionData?.rent || []),
        ...(regionData?.buy || [])
    ];

    if (allStreamingOrRental.length > 0) {
        providerLogo = allStreamingOrRental[0].logo_path;
    }

    let category: 'ott' | 'theatrical' | 'other' = 'other';

    if (item.type === 'movie') {
        const dDate = parseDateLocal(meta.digital_release_date);
        const tDate = parseDateLocal(meta.theatrical_release_date);
        const rDate = parseDateLocal(meta.release_date);

        if (item.status === 'movie_on_ott' || item.status === 'movie_coming_soon') {
            category = item.status === 'movie_on_ott' ? 'ott' : 'theatrical';

            const manualDate = parseDateLocal(meta.manual_release_date);
            const ottName = meta.manual_ott_name || meta.digital_release_note;

            if (category === 'ott') {
                if (dDate) {
                    targetDate = dDate;
                    seasonInfo = (targetDate > today) ? (ottName ? `Coming to ${ottName}` : 'Coming to OTT') : (ottName ? `Streaming on ${ottName}` : 'Streaming Now');
                } else if (manualDate) {
                    targetDate = manualDate;
                    seasonInfo = ottName ? `Coming to ${ottName}` : 'Coming to OTT';
                } else {
                    targetDate = rDate || tDate;
                    seasonInfo = 'Date Pending';
                }
            } else {
                targetDate = tDate || rDate;
                if (targetDate) {
                    seasonInfo = targetDate > today ? 'Releasing in Theatres' : 'Released';
                }
            }

            if (!targetDate) {
                const fallbackYearMatch = meta.release_date?.match(/^\d{4}/);
                targetDate = fallbackYearMatch ? new Date(`${fallbackYearMatch[0]}-12-31`) : new Date('2099-12-31');
            }
        } else {
            if (dDate && dDate > today) { category = 'ott'; targetDate = dDate; }
            else { category = 'theatrical'; targetDate = tDate || rDate || today; seasonInfo = targetDate > today ? 'Releasing' : 'Released'; }
        }
    } else {
        category = 'ott';
        const nextEp = meta.next_episode_to_air;
        const lastEp = meta.last_episode_to_air;

        if (nextEp && nextEp.air_date) {
            targetDate = parseDateLocal(nextEp.air_date);
            if (targetDate && targetDate < today) seasonInfo = 'Streaming Now';
            else if (targetDate && targetDate.getTime() === today.getTime()) seasonInfo = 'Airs Today';
            else seasonInfo = 'New Episode';
        } else if (lastEp && lastEp.air_date) {
            targetDate = parseDateLocal(lastEp.air_date);
            seasonInfo = 'Latest Episode';
        } else if (meta.first_air_date || meta.release_date) {
            targetDate = parseDateLocal(meta.first_air_date || meta.release_date);
            seasonInfo = item.status === 'show_new' ? 'Premiere' : 'Released';
        } else {
            targetDate = today;
            seasonInfo = 'Streaming Now';
        }
    }

    if (!targetDate && item.type === 'movie') targetDate = today;
    if (!targetDate) return null;

    const runtime = calculateMediaRuntime(item);

    return {
        ...meta,
        id: item.tmdb_id,
        supabaseId: item.id,
        status: item.status,
        title: item.title,
        poster_path: item.poster_path,
        vote_average: item.vote_average,
        date: targetDate.toISOString(),
        tmdbMediaType: item.type === 'movie' ? 'movie' : 'tv',
        totalHours: runtime,
        seasonInfo,
        providerLogo,
        tabCategory: category
    } as UpcomingItem;
};

export const useUpcomingItems = (viewMode: 'On OTT' | 'Coming Soon') => {
    const { watchlist } = useWatchlist();
    const { region } = usePreferences();

    const upcomingItems = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const items = watchlist
            .map(item => processUpcomingItem(item, today, region))
            .filter((item): item is UpcomingItem => item !== null)
            .sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return (a.title || '').localeCompare(b.title || '');
            });

        return items.filter(item => {
            if (viewMode === 'On OTT') {
                return item.status === 'movie_on_ott' || item.tmdbMediaType === 'tv';
            }
            if (viewMode === 'Coming Soon') {
                return item.status === 'movie_coming_soon';
            }
            return true;
        });
    }, [watchlist, viewMode, region]);

    return { upcomingItems, totalCount: upcomingItems.length };
};
