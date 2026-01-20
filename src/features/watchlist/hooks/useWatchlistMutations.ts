import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../auth/context/AuthContext';
import { usePreferences } from '../../../context/PreferencesContext';
import { pruneMetadata, determineShowStatus, getEnrichedMetadata, isSeasonOngoing } from '../../../lib/watchlist-shared';
import { tmdb, type TMDBMedia } from '../../../lib/tmdb';
import type { WatchlistItem, WatchStatus } from '../../../types';
import { getLocalStorageItem, setLocalStorageItem } from '../../../utils/localStorage';

export function useWatchlistMutations() {
    const { user } = useAuth();
    const { region } = usePreferences();
    const queryClient = useQueryClient();
    const queryKey = ['watchlist', user?.id || 'local'];

    const getList = () => queryClient.getQueryData<WatchlistItem[]>(queryKey) || [];

    // Generic Update Helper (Optimistic + DB)
    const mutateItem = async (
        tmdbId: number,
        type: 'movie' | 'show',
        updates: Partial<WatchlistItem>,
        onOptimistic: (item: WatchlistItem) => WatchlistItem
    ) => {
        // Optimistic
        const previousList = getList();
        queryClient.setQueryData(queryKey, (old: WatchlistItem[] = []) =>
            old.map(item => (item.tmdb_id === tmdbId && item.type === type) ? onOptimistic(item) : item)
        );

        try {
            if (!user) {
                // Local - use safe localStorage utilities
                const local = getLocalStorageItem<WatchlistItem[]>('watchlist', []);
                const updated = local.map((item: WatchlistItem) =>
                    (item.tmdb_id === tmdbId && item.type === type) ? { ...item, ...updates } : item
                );
                setLocalStorageItem('watchlist', updated);
            } else {
                // Supabase
                const { error } = await supabase
                    .from('watchlist')
                    .update(updates)
                    .eq('user_id', user.id)
                    .eq('tmdb_id', tmdbId)
                    .eq('type', type);
                if (error) throw error;
            }
        } catch (err) {
            console.error("Mutation failed, reverting...", err);
            queryClient.setQueryData(queryKey, previousList);
            throw err;
        }
    };

    // --- RECALCULATE STATUS LOGIC ---
    const recalculateShowStatus = async (tmdbId: number, lastWatchedSeason: number, currentMeta: TMDBMedia | undefined, progress: number = 0) => {
        const list = getList();
        const item = list.find(i => i.tmdb_id === tmdbId && i.type === 'show');
        const currentStatus = item?.status;

        const newStatus = determineShowStatus(currentMeta as TMDBMedia, lastWatchedSeason, progress, currentStatus);
        
        // Optimization: Don't mutate if status hasn't changed
        if (newStatus === currentStatus) return;

        await mutateItem(tmdbId, 'show', { status: newStatus }, (item) => ({ ...item, status: newStatus }));
    };

    // --- MUTATIONS ---

    const addToWatchlist = useMutation({
        onMutate: async ({ media, type }: { media: TMDBMedia; type: 'movie' | 'show' }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousList = getList();
            const tempId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random()}`;
            const newItemBase: WatchlistItem = {
                id: tempId,
                user_id: user?.id || 'local-user',
                tmdb_id: media.id,
                type: type,
                title: media.title || media.name || 'Unknown',
                poster_path: media.poster_path,
                vote_average: media.vote_average,
                status: type === 'movie' ? 'movie_unwatched' : 'show_new'
            };
            queryClient.setQueryData(queryKey, [newItemBase, ...previousList]);
            return { previousList, tempId };
        },
        mutationFn: async ({ media, type }: { media: TMDBMedia; type: 'movie' | 'show' }) => {
            const { initialStatus, finalMetadata } = await getEnrichedMetadata(media.id, type, region, media);
            const prunedMetadata = pruneMetadata(finalMetadata, region);

            const itemData: Partial<WatchlistItem> = {
                tmdb_id: media.id,
                type: type,
                title: media.title || media.name || 'Unknown',
                poster_path: media.poster_path,
                vote_average: media.vote_average,
                status: initialStatus,
                metadata: prunedMetadata,
                user_id: user?.id
            };

            if (!user) {
                const local = getLocalStorageItem<WatchlistItem[]>('watchlist', []);
                const tempId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`;
                const finalItem = { ...itemData, id: tempId, user_id: 'local-user' };
                const cleaned = local.filter(item => !(item.tmdb_id == media.id && item.type === type));
                const updated = [finalItem, ...cleaned];
                setLocalStorageItem('watchlist', updated);
                return finalItem;
            } else {
                const { data, error } = await supabase.from('watchlist').insert(itemData).select().single();
                if (error) throw error;
                return data;
            }
        },
        onSuccess: (newItem, _vars, context) => {
            queryClient.setQueryData(queryKey, (old: WatchlistItem[] | undefined) => {
                if (!old) return [newItem];
                return old.map(item => item.id === context?.tempId ? newItem : item);
            });
        },
        onError: (_err, _vars, context) => {
            if (context?.previousList) queryClient.setQueryData(queryKey, context.previousList);
        }
    });

    const removeFromWatchlist = useMutation({
        onMutate: async ({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'show' }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousList = getList();
            queryClient.setQueryData(queryKey, previousList.filter(i => !(i.tmdb_id == tmdbId && i.type === type)));
            return { previousList };
        },
        mutationFn: async ({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'show' }) => {
            if (!user) {
                const local = getLocalStorageItem<WatchlistItem[]>('watchlist', []);
                const updated = local.filter(item => !(item.tmdb_id == tmdbId && item.type === type));
                setLocalStorageItem('watchlist', updated);
                return;
            }
            const { error } = await supabase.from('watchlist').delete().eq('user_id', user.id).eq('tmdb_id', tmdbId).eq('type', type);
            if (error) throw error;
        },
        onError: (_err, _vars, context) => {
            if (context?.previousList) queryClient.setQueryData(queryKey, context.previousList);
        }
    });


    // --- STATUS & METADATA MUTATIONS ---

    const updateStatus = useMutation({
        mutationFn: async ({ tmdbId, type, status }: { tmdbId: number; type: 'movie' | 'show', status: WatchStatus }) => {
            await mutateItem(tmdbId, type, { status }, (item) => ({ ...item, status }));
        }
    });

    const updateMetadata = useMutation({
        mutationFn: async ({ tmdbId, type, metadata }: { tmdbId: number; type: 'movie' | 'show', metadata: TMDBMedia }) => {
            const pruned = pruneMetadata(metadata, region);
            await mutateItem(tmdbId, type, { metadata: pruned }, (item) => ({ ...item, metadata: pruned }));
        }
    });

    const markAsWatched = useMutation({
        mutationFn: async ({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'show' }) => {
            if (type === 'show') {
                const list = getList();
                const item = list.find(i => i.tmdb_id === tmdbId && i.type === 'show');
                let seasons = item?.metadata?.seasons;

                if (!seasons) {
                        try {
                        const details = await tmdb.getDetails(tmdbId, 'tv');
                        seasons = details.seasons || [];
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    } catch (e) { seasons = []; }
                }

                const todayStr = new Date().toISOString().split('T')[0];
                const released = (seasons || []).filter(s => s.season_number > 0 && s.air_date && s.air_date <= todayStr);
                const maxSeason = released.length > 0 ? released[released.length - 1].season_number : 0;

                const newMeta = { ...(item?.metadata || {}), last_watched_season: maxSeason, seasons } as TMDBMedia;
                const pruned = pruneMetadata(newMeta, region);

                // Update Metadata & Last Watched Season combined
                await mutateItem(tmdbId, 'show', { last_watched_season: maxSeason, progress: 0, metadata: pruned }, (i) => ({ ...i, last_watched_season: maxSeason, progress: 0, metadata: pruned }));

                // Recalculate Logic
                await recalculateShowStatus(tmdbId, maxSeason, pruned, 0);

            } else {
                await mutateItem(tmdbId, 'movie', { status: 'movie_watched' }, (i) => ({ ...i, status: 'movie_watched' }));
            }
        }
    });

    const markAsUnwatched = useMutation({
        mutationFn: async ({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'show' }) => {
            if (type === 'show') {
                // Reset season progress
                const list = getList();
                const item = list.find(i => i.tmdb_id === tmdbId && i.type === 'show');
                const newMeta = { ...(item?.metadata || {}), last_watched_season: 0 } as TMDBMedia;
                const pruned = pruneMetadata(newMeta, region);

                await mutateItem(tmdbId, 'show', { last_watched_season: 0, metadata: pruned }, (i) => ({ ...i, last_watched_season: 0, metadata: pruned }));
                await recalculateShowStatus(tmdbId, 0, pruned, 0);
            } else {
                await mutateItem(tmdbId, 'movie', { status: 'movie_unwatched' }, (i) => ({ ...i, status: 'movie_unwatched' }));
            }
        }
    });

    const markSeasonWatched = useMutation({
        mutationFn: async ({ tmdbId, seasonNumber }: { tmdbId: number; seasonNumber: number }) => {
            const list = getList();
            const item = list.find(i => i.tmdb_id === tmdbId && i.type === 'show');
            
            const newMeta = { ...(item?.metadata || {}), last_watched_season: seasonNumber } as TMDBMedia;
            const pruned = pruneMetadata(newMeta, region);

            await mutateItem(tmdbId, 'show', { last_watched_season: seasonNumber, progress: 0, metadata: pruned }, (i) => ({ ...i, last_watched_season: seasonNumber, progress: 0, metadata: pruned }));
            await recalculateShowStatus(tmdbId, seasonNumber, pruned, 0);
        }
    });

    const markSeasonUnwatched = useMutation({
        mutationFn: async ({ tmdbId, seasonNumber }: { tmdbId: number; seasonNumber: number }) => {
            const newLastWatched = Math.max(0, seasonNumber - 1);
            const list = getList();
            const item = list.find(i => i.tmdb_id === tmdbId && i.type === 'show');
            const newMeta = { ...(item?.metadata || {}), last_watched_season: newLastWatched } as TMDBMedia;
            const pruned = pruneMetadata(newMeta, region);

            await mutateItem(tmdbId, 'show', { last_watched_season: newLastWatched, metadata: pruned }, (i) => ({ ...i, last_watched_season: newLastWatched, metadata: pruned }));
            await recalculateShowStatus(tmdbId, newLastWatched, pruned, 0);
        }
    });

    const moveToLibrary = useMutation({
        mutationFn: async ({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'show' }) => {
            const targetStatus = type === 'movie' ? 'movie_unwatched' : 'show_new';
            const list = getList();
            const item = list.find(i => i.tmdb_id === tmdbId && i.type === type);
            const newMeta = { ...(item?.metadata || {}), moved_to_library: true } as TMDBMedia;
            const pruned = pruneMetadata(newMeta, region);

            await mutateItem(tmdbId, type, { status: targetStatus, metadata: pruned }, (i) => ({ ...i, status: targetStatus, metadata: pruned }));
        }
    });

    const markAsDropped = useMutation({
        mutationFn: async ({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'show' }) => {
            const status = type === 'movie' ? 'movie_dropped' : 'show_dropped';
            await mutateItem(tmdbId, type, { status }, (i) => ({ ...i, status }));
        }
    });

    const restoreFromDropped = useMutation({
        mutationFn: async ({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'show' }) => {
            if (type === 'movie') {
                await mutateItem(tmdbId, 'movie', { status: 'movie_unwatched' }, (i) => ({ ...i, status: 'movie_unwatched' }));
            } else {
                const list = getList();
                const item = list.find(i => i.tmdb_id === tmdbId && i.type === 'show');
                const lastWatched = item?.last_watched_season || 0;
                const progress = item?.progress || 0;
                await recalculateShowStatus(tmdbId, lastWatched, item?.metadata, progress);
            }
        }
    });

    const dismissFromUpcoming = useMutation({
        mutationFn: async ({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'show' }) => {
            const list = getList();
            const item = list.find(i => i.tmdb_id === tmdbId && i.type === type);
            const newMeta = { ...(item?.metadata || {}), dismissed_from_upcoming: true } as TMDBMedia;
            const pruned = pruneMetadata(newMeta, region);
            await mutateItem(tmdbId, type, { metadata: pruned }, (i) => ({ ...i, metadata: pruned }));
        }
    });

    const restoreToUpcoming = useMutation({
        mutationFn: async ({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'show' }) => {
            const list = getList();
            const item = list.find(i => i.tmdb_id === tmdbId && i.type === type);
            const newMeta = { ...(item?.metadata || {}), dismissed_from_upcoming: false } as TMDBMedia;
            const pruned = pruneMetadata(newMeta, region);
            await mutateItem(tmdbId, type, { metadata: pruned }, (i) => ({ ...i, metadata: pruned }));
        }
    });

    const refreshMetadata = useMutation({
        mutationFn: async ({ tmdbId, type, overrideMetadata }: { tmdbId: number; type: 'movie' | 'show'; overrideMetadata?: TMDBMedia }) => {
            const list = getList();
            const item = list.find(i => i.tmdb_id === tmdbId && i.type === type);
            if (!item) return;

            const { initialStatus, finalMetadata } = await getEnrichedMetadata(tmdbId, type, region, overrideMetadata || item.metadata, item.status);
            const finalWithTimestamp = { ...finalMetadata, last_updated_at: Date.now() };
            const pruned = pruneMetadata(finalWithTimestamp, region);

            // Prepare updates
            const updates: Partial<WatchlistItem> = { metadata: pruned };
            if (item.status !== initialStatus) {
                updates.status = initialStatus;
            }

            await mutateItem(tmdbId, type, updates, (i) => ({ ...i, ...updates }));
        }
    });


    const updateProgress = useMutation({
        mutationFn: async ({ tmdbId, type, progress }: { tmdbId: number; type: 'movie' | 'show', progress: number }) => {

            // Ensure progress is not set for movies (optional safety)
            if (type === 'movie') return;

            // Optional: Cap progress based on metadata if available
            const list = getList();
            const item = list.find(i => i.tmdb_id === tmdbId && i.type === 'show');
            if (item?.metadata) {
                const currentSeasonNum = (item.last_watched_season || 0) + 1;
                const seasons = item.metadata.seasons || [];
                const currentSeason = seasons.find(s => s.season_number === currentSeasonNum);
                
                if (currentSeason && currentSeason.episode_count) {
                    if (progress >= currentSeason.episode_count) {
                        // Check if the season is ongoing before auto-completing
                        if (isSeasonOngoing(item.metadata, currentSeasonNum)) {
                            // Keep progress at max but don't complete season
                            progress = currentSeason.episode_count;
                        } else {
                            // Auto-complete season
                            const newLastWatched = currentSeasonNum;
                            await mutateItem(tmdbId, 'show', { last_watched_season: newLastWatched, progress: 0 }, (i) => ({ ...i, last_watched_season: newLastWatched, progress: 0 }));
                            await recalculateShowStatus(tmdbId, newLastWatched, item.metadata, 0);
                            return;
                        }
                    } else {
                        progress = Math.max(0, progress); // Safety
                    }
                    progress = Math.min(progress, currentSeason.episode_count);
                }
            }
            
            await mutateItem(tmdbId, 'show', { progress }, (i) => ({ ...i, progress }));

            // Recalculate status when progress changes
            await recalculateShowStatus(tmdbId, item?.last_watched_season || 0, item?.metadata, progress);
        }
    });

    return {
        addToWatchlist: addToWatchlist.mutateAsync,
        removeFromWatchlist: removeFromWatchlist.mutateAsync,
        updateStatus: updateStatus.mutateAsync,
        updateMetadata: updateMetadata.mutateAsync,
        markAsWatched: markAsWatched.mutateAsync,
        markAsUnwatched: markAsUnwatched.mutateAsync,
        markSeasonWatched: markSeasonWatched.mutateAsync,
        markSeasonUnwatched: markSeasonUnwatched.mutateAsync,
        moveToLibrary: moveToLibrary.mutateAsync,
        markAsDropped: markAsDropped.mutateAsync,
        restoreFromDropped: restoreFromDropped.mutateAsync,
        dismissFromUpcoming: dismissFromUpcoming.mutateAsync,
        restoreToUpcoming: restoreToUpcoming.mutateAsync,
        refreshMetadata: refreshMetadata.mutateAsync,
        updateProgress: updateProgress.mutateAsync
    };
}
