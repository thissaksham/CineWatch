import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, LoaderCircle } from 'lucide-react';
import { useSearch } from '../../media/hooks/useTMDB';
import { useGameSearch } from '../../games/hooks/useGames';
import { useGameLibrary } from '../../games/hooks/useGameLibrary';
import { useDebounce } from '../hooks/useDebounce';
import { sanitizeSearchInput } from '../../../utils/validation';
import type { TMDBMedia } from '../../../lib/tmdb';
import type { Game } from '../../../types';
import { useWatchlist } from '../../watchlist/context/WatchlistContext';
import { SlidingToggle } from '../../../shared/components/ui/SlidingToggle';
import { DiscoveryCard } from '../../../shared/components/cards/DiscoveryCard';
import { GameDiscoveryCard } from '../../games/components/GameDiscoveryCard';


interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'movie' | 'tv' | 'multi' | 'game';
    onSuccess?: (media: TMDBMedia | Game) => void;
    initialQuery?: string;
}

export const SearchModal = ({ isOpen, onClose, type: initialType, onSuccess, initialQuery = '' }: SearchModalProps) => {
    const [query, setQuery] = useState(initialQuery);
    const [searchType, setSearchType] = useState<'multi' | 'movie' | 'tv' | 'game'>(initialType === 'multi' ? 'movie' : initialType);
    const prevIsOpenRef = useRef(isOpen);

    // Reset state when modal opens - using effect with ref tracking
    useEffect(() => {
        // Only reset when transitioning from closed to open
        if (isOpen && !prevIsOpenRef.current) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setQuery(initialQuery);
            setSearchType(initialType === 'multi' ? 'movie' : initialType);
        }
        prevIsOpenRef.current = isOpen;
    }, [isOpen, initialQuery, initialType]);

    // Sanitize and debounce query to prevent excessive API calls and injection attacks
    const sanitizedQuery = sanitizeSearchInput(query, 100);
    const debouncedQuery = useDebounce(sanitizedQuery, 300);

    // React Query Hook - Only search if not 'game'
    const {
        data,
        isLoading,
        fetchNextPage: fetchNextMedia,
        hasNextPage: hasNextMedia,
        isFetchingNextPage: isFetchingNextMedia
    } = useSearch(debouncedQuery, searchType === 'game' ? 'multi' : searchType as 'multi' | 'movie' | 'tv');

    // Game Search Hook
    const {
        data: gameResults,
        isLoading: isGameLoading,
        fetchNextPage: fetchNextGame,
        hasNextPage: hasNextGame,
        isFetchingNextPage: isFetchingNextGame
    } = useGameSearch(searchType === 'game' ? debouncedQuery : '');

    // Combine loading states
    const isSearching = searchType === 'game' ? isGameLoading : isLoading;
    const isFetchingMore = searchType === 'game' ? isFetchingNextGame : isFetchingNextMedia;

    // Determine results based on type (Flatten Pages)
    const results = searchType === 'game'
        ? (gameResults?.pages.flatMap(p => p.results) || [])
        : (data?.pages.flatMap(p => p.results as TMDBMedia[]) || []);

    const { addToWatchlist, isInWatchlist } = useWatchlist();

    // Body scroll lock
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    // Infinite Scroll Observer
    const observer = useRef<IntersectionObserver | null>(null);
    const lastElementRef = useCallback((node: HTMLDivElement) => {
        if (isSearching || isFetchingMore) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                if (searchType === 'game' && hasNextGame) {
                    fetchNextGame();
                } else if (searchType !== 'game' && hasNextMedia) {
                    fetchNextMedia();
                }
            }
        });
        if (node) observer.current.observe(node);
    }, [isSearching, isFetchingMore, hasNextGame, hasNextMedia, searchType, fetchNextGame, fetchNextMedia]);


    const handleAdd = async (media: TMDBMedia) => {
        const mediaType = media.media_type || (searchType === 'tv' ? 'tv' : 'movie');
        const targetType: 'movie' | 'show' = mediaType === 'tv' ? 'show' : 'movie';

        if (isInWatchlist(media.id, targetType)) return;

        // Ensure media object has media_type for downstream consumers (like Layout.tsx)
        const enrichedMedia = {
            ...media,
            media_type: media.media_type || (searchType === 'tv' ? 'tv' : 'movie') as 'tv' | 'movie'
        };

        addToWatchlist(enrichedMedia, targetType);
        if (onSuccess) onSuccess(enrichedMedia);
        onClose();
    };

    const { removeGame, libraryGames, isInLibrary } = useGameLibrary();

    const handleGameRemove = async (game: Game) => {
        // Find the library game that corresponds to this RAWG game
        const libraryGame = libraryGames.find(g => g.rawg_id === game.rawg_id);
        if (libraryGame) {
            removeGame(libraryGame.id);
        }
    };

    const handleGameAddClick = (game: Game) => {
        // Delegate to parent/layout
        if (onSuccess) onSuccess(game);
        onClose();
    };


    if (!isOpen) return null;

    const displayResults = query.trim() ? results : [];
    // Check if we're still waiting for debounced query to catch up
    const isDebouncing = sanitizedQuery !== debouncedQuery;
    const itemsToShow = displayResults.filter((item: TMDBMedia | Game) => {
        // Relaxed Filter: Allow items without a date or poster
        // DiscoveryCard handles missing posters with a placeholder.

        // Filter by media_type if searchType is not 'multi' (and not 'game')
        if (searchType !== 'multi' && searchType !== 'game') {
            // Check if it's a TMDBMedia object
            if ('media_type' in item || 'first_air_date' in item || 'release_date' in item) {
                const tmdbItem = item as TMDBMedia;
                // If media_type is missing, assume it matches searchType for specific categories
                const itemMediaType = tmdbItem.media_type || searchType;
                return itemMediaType === searchType;
            }
        }
        return true;
    });

    return (
        <div className="search-overlay animate-fade-in" onClick={onClose}>
            {/* Centered Search Container */}
            <div className="search-container" onClick={e => e.stopPropagation()}>

                {/* Close Button Top Right */}
                <button className="search-close-top" onClick={onClose}>
                    <X size={24} />
                </button>

                <div className="search-content-wrapper">
                    <div className="search-bar-hero">
                        <div className="search-input-wrapper">
                            <Search className="search-icon" size={28} />
                            <input
                                autoFocus
                                type="text"
                                placeholder={searchType === 'game' ? "Search for games..." : "Search for movies, TV shows..."}
                                className="search-hero-input"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                            {(isSearching || isFetchingMore) && <LoaderCircle className="animate-spin text-teal-400" size={24} />}
                        </div>

                        <div className="search-filters">
                            <SlidingToggle
                                options={['Movies', 'TV Shows', 'Games']}
                                activeOption={
                                    searchType === 'movie' ? 'Movies' :
                                        searchType === 'tv' ? 'TV Shows' :
                                            searchType === 'game' ? 'Games' : 'Movies'
                                }
                                onToggle={(val) => {
                                    if (val === 'Movies') setSearchType('movie');
                                    else if (val === 'TV Shows') setSearchType('tv');
                                    else if (val === 'Games') setSearchType('game');
                                }}
                            />
                        </div>
                    </div>

                    <div className="search-results-grid no-scrollbar">
                        <div className="grid-header">
                            {/* 'Trending Now' removed */}
                        </div>

                        {searchType === 'game' ? (
                            <div className={`media-grid ${isSearching ? 'loading-state' : ''}`}>
                                {(results as Game[]).map((game, index) => {
                                    const isAdded = isInLibrary(game.rawg_id);
                                    if (results.length === index + 1) {
                                        return (
                                            <div ref={lastElementRef} key={game.id}>
                                                <GameDiscoveryCard
                                                    game={game}
                                                    onAdd={() => handleGameAddClick(game)} // Calls onSuccess + Close
                                                    onRemove={() => handleGameRemove(game)}
                                                    isAdded={isAdded}
                                                />
                                            </div>
                                        );
                                    }
                                    return (
                                        <GameDiscoveryCard
                                            key={game.id}
                                            game={game}
                                            onAdd={() => handleGameAddClick(game)} // Calls onSuccess + Close
                                            onRemove={() => handleGameRemove(game)}
                                            isAdded={isAdded}
                                        />
                                    );
                                })}
                                {results.length === 0 && !isSearching && !isDebouncing && query.trim() && (
                                    <div className="col-span-full text-center py-20 text-gray-400">
                                        No games found. Try a different search!
                                    </div>
                                )}
                            </div>
                        ) : (
                            itemsToShow.length === 0 && !isSearching && !isDebouncing && query.trim() ? (
                                <div className="text-center py-20 text-gray-400">
                                    No discovery found. Try a different search!
                                </div>
                            ) : (
                                <div className={`media-grid ${isSearching ? 'loading-state' : ''}`}>
                                    {(itemsToShow as TMDBMedia[]).map((media, index) => {
                                        const mType = media.media_type || (searchType === 'tv' ? 'tv' : 'movie');
                                        const targetType = mType === 'tv' ? 'show' : 'movie';

                                        if (itemsToShow.length === index + 1) {
                                            return (
                                                <div ref={lastElementRef} key={media.id}>
                                                    <DiscoveryCard
                                                        media={media}
                                                        isAdded={isInWatchlist(media.id, targetType)}
                                                        onAdd={() => handleAdd(media)}
                                                    />
                                                </div>
                                            );
                                        }

                                        return (
                                            <DiscoveryCard
                                                key={media.id}
                                                media={media}
                                                isAdded={isInWatchlist(media.id, targetType)}
                                                onAdd={() => handleAdd(media)}
                                            />
                                        );
                                    })}
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};
