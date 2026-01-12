import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWatchlist } from '../../watchlist/context/WatchlistContext';
import { UpcomingCard } from '../../../shared/components/cards/UpcomingCard';
import { type TMDBMedia } from '../../../lib/tmdb';
import { SlidingToggle } from '../../../shared/components/ui/SlidingToggle';
import { MovieModal } from '../../movies/components/MovieModal';
import { ShowModal } from '../../shows/components/ShowModal';
import { ManualDateModal } from '../../../shared/components/modals/ManualDateModal';
import { useUpcomingItems, getDaysUntil, type UpcomingItem } from '../hooks/useUpcomingItems';
import { CardSkeleton } from '../../../shared/components/feedback';

export const UpcomingPage = () => {
    const { watchlist, markAsWatched, dismissFromUpcoming, removeFromWatchlist, updateWatchlistItemMetadata, updateStatus, moveToLibrary, refreshMetadata, markAsDropped, loading } = useWatchlist();
    const navigate = useNavigate();
    const params = useParams();

    const [selectedMedia, setSelectedMedia] = useState<TMDBMedia | UpcomingItem | null>(null);

    // Initialize View Mode directly from URL (Derived State)
    const viewMode = (params.status === 'comingSoon' ? 'Coming Soon' : 'On OTT') as 'On OTT' | 'Coming Soon';

    const handleViewModeChange = (opt: string) => {
        const slug = opt === 'Coming Soon' ? 'comingSoon' : 'onOTT';
        navigate(`/upcoming/${slug}`);
    };
    const [showDatePicker, setShowDatePicker] = useState<UpcomingItem | null>(null);
    const [refreshedIds] = useState(new Set<number>());

    // Use the shared hook for upcoming items logic
    const { upcomingItems, totalCount } = useUpcomingItems(viewMode);

    // Sync tab title
    useEffect(() => {
        document.title = 'CineTrack | Upcoming';
    }, []);

    // Auto-refresh metadata for items in Upcoming to catch official OTT dates/platforms
    useEffect(() => {
        // We scan the WHOLE watchlist for two types of items to refresh:
        // 1. Items currently IN upcoming (to get latest OTT data)
        // 2. "Stale" active items that SHOULD be in upcoming but fell off because next_episode_to_air is in the past.

        const today = new Date();
        const candidates = watchlist.filter(item => {
            if (refreshedIds.has(Number(item.id))) return false;

            const meta = (item.metadata || {}) as TMDBMedia;
            const lastUpdated = meta.last_updated_at;
            if (lastUpdated) {
                const diff = Date.now() - new Date(lastUpdated).getTime();
                const twelveHours = 12 * 60 * 60 * 1000;
                if (diff < twelveHours) return false;
            }
            if (item.type === 'show') {
                if (['show_returning', 'show_watching', 'show_ongoing'].includes(item.status)) {
                    const nextEp = (item.metadata as TMDBMedia)?.next_episode_to_air;
                    if (nextEp && nextEp.air_date) {
                        const epDate = new Date(nextEp.air_date);
                        // If date is in past (yesterday/older), it's stale. Needs refresh to get NEXT ONE.
                        if (epDate < today) return true;
                    }
                }
            }

            // Refresh visible items logic (simplified from previous)
            const isVisible = upcomingItems.some(i => i.id === item.tmdb_id);
            if (isVisible) return true;

            return false;
        });

        if (candidates.length > 0) {
            // Refresh up to 3 at a time to avoid rate limits
            const batch = candidates.slice(0, 3);
            batch.forEach(item => {
                refreshedIds.add(Number(item.id));
                refreshMetadata(item.tmdb_id, item.type);
                console.log("Refreshing stale/upcoming item:", item.title);
            });
        }
    }, [watchlist, upcomingItems, refreshMetadata, refreshedIds]);

    const handleMoveToLibrary = async (media: TMDBMedia) => {
        // Fix: Use tmdbMediaType if available (from UpcomingItem), otherwise fallback
        const typeRaw = (media as UpcomingItem).tmdbMediaType || media.media_type;
        const type = typeRaw === 'movie' ? 'movie' : 'show';
        await moveToLibrary(Number(media.id), type);
    };

    const handleSaveManualDate = async (date: string, ottName: string) => {
        if (!showDatePicker) return;

        // Use supabaseId for reliable lookup
        const item = watchlist.find(i => i.id === showDatePicker.supabaseId);
        if (!item) {
            console.error("Manual Date Save: Item not found in watchlist", showDatePicker);
            return;
        }


        const newMeta: TMDBMedia = {
            ...(item.metadata || {} as TMDBMedia),
            id: item.tmdb_id,
            manual_release_date: date,
            manual_ott_name: ottName,
            manual_date_override: true
        };

        await updateWatchlistItemMetadata(item.tmdb_id, item.type, newMeta);

        // Also force status to 'movie_on_ott' so it moves to the OTT tab
        await updateStatus(item.tmdb_id, item.type, 'movie_on_ott');

        // Optimistic UI update/Selection clear
        setShowDatePicker(null);
    };

    const handleReset = async () => {
        if (!showDatePicker) return;
        const item = watchlist.find(i => i.id === showDatePicker.supabaseId);
        if (!item) return;

        const newMeta: TMDBMedia = {
            ...(item.metadata || {} as TMDBMedia),
            id: item.tmdb_id,
            manual_release_date: null,
            manual_ott_name: null,
            manual_date_override: false
        };

        // We pass newMeta directly to refreshMetadata to bypass stale state issues
        await refreshMetadata(item.tmdb_id, item.type, newMeta);
        setShowDatePicker(null);
    };

    return (
        <div className="animate-fade-in pb-20 relative min-h-screen">
            <div className="page-header flex justify-between items-end mb-10 pt-4">
                <div>
                    <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/50 tracking-tight flex items-baseline">
                        Upcoming
                        <span style={{ fontSize: '1rem', opacity: 0.2, fontWeight: 'normal', marginLeft: '12px', color: 'white', WebkitTextFillColor: 'initial' }} className="select-none">
                            showing {upcomingItems.length}/{totalCount} results
                        </span>
                    </h1>
                    <p className="text-lg text-gray-400 mt-2 font-medium">
                        Your personalized release calendar.
                    </p>
                </div>
                <SlidingToggle
                    options={['On OTT', 'Coming Soon']}
                    activeOption={viewMode}
                    onToggle={handleViewModeChange}
                />
            </div>

            {loading ? (
                <CardSkeleton count={10} />
            ) : upcomingItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[50vh] text-center p-8 border border-dashed border-white/10 rounded-2xl bg-white/5 mt-10">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4 text-3xl">📅</div>
                    <h2 className="text-2xl font-bold text-white mb-2">No Upcoming Releases</h2>
                    <p className="text-gray-400 max-w-md">
                        {viewMode === 'On OTT'
                            ? "No upcoming digital releases found. Check 'Coming Soon' for theatrical releases!"
                            : "No upcoming theatrical releases found."}
                    </p>
                </div>
            ) : (
                <div className="media-grid">
                    {upcomingItems.map((show: UpcomingItem) => (
                        <div key={show.id} className="relative group/upcoming">
                            <UpcomingCard
                                media={{
                                    ...show,
                                    id: Number(show.id),
                                    vote_average: show.vote_average || 0,
                                    countdown: getDaysUntil(show.date),
                                }}
                                onRemove={() => {
                                    if (show.tmdbMediaType === 'movie') {
                                        const isFuture = show.status === 'movie_coming_soon' || (show.status === 'movie_on_ott' && new Date(show.date) > new Date());

                                        if (isFuture) {
                                            if (window.confirm(`Delete ${show.title} from your watchlist completely? (Unreleased)`)) {
                                                removeFromWatchlist(Number(show.id), 'movie');
                                            }
                                        } else {
                                            if (window.confirm(`Drop ${show.title} from your watchlist? It will be moved to the Dropped list.`)) {
                                                markAsDropped(Number(show.id), 'movie');
                                            }
                                        }
                                    } else {
                                        if (show.status === 'show_new') {
                                            if (window.confirm(`Delete ${show.title} from your watchlist completely?`)) {
                                                removeFromWatchlist(Number(show.id), 'show');
                                            }
                                        } else {
                                            if (window.confirm(`Hide ${show.title} from upcoming list? (It will remain in your library)`)) {
                                                dismissFromUpcoming(Number(show.id), 'show');
                                            }
                                        }
                                    }
                                }}
                                onMarkWatched={() => {
                                    markAsWatched(Number(show.id), show.tmdbMediaType === 'movie' ? 'movie' : 'show');
                                }}
                                onSetDate={(media: TMDBMedia) => {
                                    setShowDatePicker(media as UpcomingItem);
                                }}
                                onMoveToLibrary={handleMoveToLibrary}
                                showDateOverride={viewMode === 'Coming Soon'}
                                onClick={() => setSelectedMedia(show)}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* FAB Removed - Global Add replaces it. Random not strictly needed here or can be added back if requested. */}

            {selectedMedia && (
                (selectedMedia as UpcomingItem).tmdbMediaType === 'tv' ? (
                    <ShowModal media={selectedMedia} onClose={() => setSelectedMedia(null)} />
                ) : (
                    <MovieModal media={selectedMedia} onClose={() => setSelectedMedia(null)} />
                )
            )}

            {showDatePicker && (
                <ManualDateModal
                    media={showDatePicker}
                    onClose={() => setShowDatePicker(null)}
                    onSave={handleSaveManualDate}
                    onReset={handleReset}
                />
            )}
        </div>
    );
};
