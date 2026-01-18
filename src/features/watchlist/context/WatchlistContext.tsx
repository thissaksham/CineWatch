import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useWatchlistData } from '../hooks/useWatchlistData';
import { useWatchlistMutations } from '../hooks/useWatchlistMutations';
import type { WatchlistItem, WatchStatus } from '../../../types';
import type { TMDBMedia } from '../../../lib/tmdb';

interface WatchlistContextType {
    watchlist: WatchlistItem[];
    addToWatchlist: (media: TMDBMedia, type: 'movie' | 'show') => Promise<void>;
    removeFromWatchlist: (tmdbId: number, type: 'movie' | 'show') => Promise<void>;
    markAsWatched: (tmdbId: number, type: 'movie' | 'show') => Promise<void>;
    markAsUnwatched: (tmdbId: number, type: 'movie' | 'show') => Promise<void>;
    moveToLibrary: (tmdbId: number, type: 'movie' | 'show') => Promise<void>;
    isInWatchlist: (tmdbId: number, type: 'movie' | 'show') => boolean;
    loading: boolean;
    watchedSeasons: never; // Deprecated
    markSeasonWatched: (tmdbId: number, seasonNumber: number) => Promise<void>;
    markSeasonUnwatched: (tmdbId: number, seasonNumber: number) => Promise<void>;
    dismissFromUpcoming: (tmdbId: number, type: 'movie' | 'show') => Promise<void>;
    restoreToUpcoming: (tmdbId: number, type: 'movie' | 'show') => Promise<void>;
    updateWatchlistItemMetadata: (tmdbId: number, type: 'movie' | 'show', newMetadata: TMDBMedia) => Promise<void>;
    updateStatus: (tmdbId: number, type: 'movie' | 'show', newStatus: WatchStatus) => Promise<void>;
    refreshMetadata: (tmdbId: number, type: 'movie' | 'show', overrideMetadata?: TMDBMedia) => Promise<void>;
    markAsDropped: (tmdbId: number, type: 'movie' | 'show') => Promise<void>;
    restoreFromDropped: (tmdbId: number, type: 'movie' | 'show') => Promise<void>;
    refreshAllMetadata: () => Promise<void>;
    updateProgress: (tmdbId: number, type: 'movie' | 'show', progress: number) => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
    const { data: watchlist = [], isLoading } = useWatchlistData();
    const mutations = useWatchlistMutations();
    const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false);

    const isInWatchlist = useCallback((tmdbId: number, type: 'movie' | 'show') => {
        return watchlist.some((item) => item.tmdb_id == tmdbId && item.type === type);
    }, [watchlist]);

    const refreshAllMetadata = useCallback(async () => {
        setIsGlobalRefreshing(true);
        try {
            console.log(`Starting global refresh for ${watchlist.length} items...`);
            let count = 0;
            for (const item of watchlist) {
                if (!item.tmdb_id) continue;
                await mutations.refreshMetadata({ tmdbId: item.tmdb_id, type: item.type, overrideMetadata: item.metadata });
                count++;
            }
            console.log(`Global refresh complete. Processed ${count} items.`);
        } catch (error) {
            console.error("Global Refresh Failed:", error);
        } finally {
            setIsGlobalRefreshing(false);
        }
    }, [watchlist, mutations]);

    // --- SYSTEMIC HEALTH CHECK (Auto-Repair) ---
    useEffect(() => {
        if (!isLoading && watchlist.length > 0) {
            const timer = setTimeout(() => {
                performHealthCheck();
            }, 2000);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, watchlist.length]); // performHealthCheck is stable

    const performHealthCheck = async () => {
        console.log('🏥 Performing Global Health Check...');
        const sickItems = watchlist.filter(item => {
            const meta = (item.metadata || {}) as TMDBMedia;

            // Check for completely broken metadata (missing critical fields)
            if (item.type === 'show') {
                const hasNext = !!meta.next_episode_to_air;
                const hasLast = !!meta.last_episode_to_air;
                if (!hasNext && !hasLast) return true; // Completely broken

                // Simplified staleness check: Refresh all non-ended shows periodically
                const tmdbStatus = meta.status || meta.tmdb_status;

                // If not ended/canceled, check staleness
                if (tmdbStatus !== 'Ended' && tmdbStatus !== 'Canceled') {
                    const lastUpdated = meta.last_updated_at || 0;
                    const daysSinceUpdate = (Date.now() - lastUpdated) / (1000 * 60 * 60 * 24);

                    // Refresh if >7 days old (catches episode count updates)
                    if (daysSinceUpdate > 7) return true;
                }

                // For ended/canceled shows, check for revival indicators
                if (tmdbStatus === 'Ended' || tmdbStatus === 'Canceled') {
                    // Check if show has future seasons (revival/reboot indicator)
                    const hasFutureSeasons = meta.seasons?.some(s => {
                        if (s.season_number === 0) return false;
                        const airDate = s.air_date ? new Date(s.air_date) : null;
                        return airDate && airDate > new Date();
                    });

                    if (hasFutureSeasons) {
                        return true; // Likely revived - needs update
                    }
                }
            }

            if (item.type === 'movie' && !meta.release_date) return true;
            return false;
        });

        if (sickItems.length === 0) {
            console.log('✅ Health Check Passed: Library integrity is good.');
            return;
        }

        console.log(`⚠️ Found ${sickItems.length} items requiring repair. Scheduling fixes...`);
        const chunkSize = 5;
        for (let i = 0; i < sickItems.length; i += chunkSize) {
            const chunk = sickItems.slice(i, i + chunkSize);
            await Promise.all(chunk.map(item => mutations.refreshMetadata({ tmdbId: item.tmdb_id, type: item.type })));
            if (i + chunkSize < sickItems.length) await new Promise(r => setTimeout(r, 1000));
        }
        console.log('🏁 Health Check & Repair Complete.');
    };

    const value = React.useMemo(() => ({
        watchlist,
        loading: isLoading || isGlobalRefreshing,
        watchedSeasons: undefined as never,
        isInWatchlist,
        refreshAllMetadata,
        addToWatchlist: (media: TMDBMedia, type: 'movie' | 'show') => mutations.addToWatchlist({ media, type }),
        removeFromWatchlist: (tmdbId: number, type: 'movie' | 'show') => mutations.removeFromWatchlist({ tmdbId, type }),
        markAsWatched: (tmdbId: number, type: 'movie' | 'show') => mutations.markAsWatched({ tmdbId, type }),
        markAsUnwatched: (tmdbId: number, type: 'movie' | 'show') => mutations.markAsUnwatched({ tmdbId, type }),
        moveToLibrary: (tmdbId: number, type: 'movie' | 'show') => mutations.moveToLibrary({ tmdbId, type }),
        markSeasonWatched: (tmdbId: number, seasonNumber: number) => mutations.markSeasonWatched({ tmdbId, seasonNumber }),
        markSeasonUnwatched: (tmdbId: number, seasonNumber: number) => mutations.markSeasonUnwatched({ tmdbId, seasonNumber }),
        dismissFromUpcoming: (tmdbId: number, type: 'movie' | 'show') => mutations.dismissFromUpcoming({ tmdbId, type }),
        restoreToUpcoming: (tmdbId: number, type: 'movie' | 'show') => mutations.restoreToUpcoming({ tmdbId, type }),
        updateWatchlistItemMetadata: (tmdbId: number, type: 'movie' | 'show', newMetadata: TMDBMedia) => mutations.updateMetadata({ tmdbId, type, metadata: newMetadata }),
        updateStatus: (tmdbId: number, type: 'movie' | 'show', newStatus: WatchStatus) => mutations.updateStatus({ tmdbId, type, status: newStatus }),
        refreshMetadata: (tmdbId: number, type: 'movie' | 'show', overrideMetadata?: TMDBMedia) => mutations.refreshMetadata({ tmdbId, type, overrideMetadata }),
        markAsDropped: (tmdbId: number, type: 'movie' | 'show') => mutations.markAsDropped({ tmdbId, type }),
        restoreFromDropped: (tmdbId: number, type: 'movie' | 'show') => mutations.restoreFromDropped({ tmdbId, type }),
        updateProgress: (tmdbId: number, type: 'movie' | 'show', progress: number) => mutations.updateProgress({ tmdbId, type, progress }),
    }), [watchlist, isLoading, isGlobalRefreshing, mutations, isInWatchlist, refreshAllMetadata]);

    return (
        <WatchlistContext.Provider value={value}>
            {children}
        </WatchlistContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useWatchlist = () => {
    const context = useContext(WatchlistContext);
    if (context === undefined) throw new Error('useWatchlist must be used within a WatchlistProvider');
    return context;
};
