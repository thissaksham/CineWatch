import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, LoaderCircle } from 'lucide-react';
import { useSearch } from '../../media/hooks/useTMDB';
import { useDebounce } from '../hooks/useDebounce';
import { sanitizeSearchInput } from '../../../utils/validation';
import type { TMDBMedia } from '../../../lib/tmdb';
import { useWatchlist } from '../../watchlist/context/WatchlistContext';
import { SlidingToggle } from '../../../shared/components/ui/SlidingToggle';
import { DiscoveryCard } from '../../../shared/components/cards/DiscoveryCard';


interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'movie' | 'tv' | 'multi';
    onSuccess?: (media: TMDBMedia) => void;
    initialQuery?: string;
}

export const SearchModal = ({ isOpen, onClose, type: initialType, onSuccess, initialQuery = '' }: SearchModalProps) => {
    const [query, setQuery] = useState(initialQuery);
    const [searchType, setSearchType] = useState<'multi' | 'movie' | 'tv'>(initialType === 'multi' ? 'movie' : initialType);
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

    // React Query Hook
    const {
        data,
        isLoading,
        fetchNextPage: fetchNextMedia,
        hasNextPage: hasNextMedia,
        isFetchingNextPage: isFetchingNextMedia
    } = useSearch(debouncedQuery, searchType as 'multi' | 'movie' | 'tv');

    const isSearching = isLoading;
    const isFetchingMore = isFetchingNextMedia;

    // Flatten Pages
    const results = data?.pages.flatMap(p => p.results as TMDBMedia[]) || [];

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
                if (hasNextMedia) {
                    fetchNextMedia();
                }
            }
        });
        if (node) observer.current.observe(node);
    }, [isSearching, isFetchingMore, hasNextMedia, fetchNextMedia]);


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

    if (!isOpen) return null;

    const displayResults = query.trim() ? results : [];
    // Check if we're still waiting for debounced query to catch up
    const isDebouncing = sanitizedQuery !== debouncedQuery;
    const itemsToShow = displayResults.filter((item: TMDBMedia) => {
        // Filter by media_type if searchType is not 'multi'
        if (searchType !== 'multi') {
            // If media_type is missing, assume it matches searchType for specific categories
            const itemMediaType = item.media_type || searchType;
            return itemMediaType === searchType;
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
                                placeholder="Search for movies, TV shows..."
                                className="search-hero-input"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                            {(isSearching || isFetchingMore) && <LoaderCircle className="animate-spin text-teal-400" size={24} />}
                        </div>

                        <div className="search-filters">
                            <SlidingToggle
                                options={['Movies', 'TV Shows']}
                                activeOption={
                                    searchType === 'movie' ? 'Movies' :
                                        searchType === 'tv' ? 'TV Shows' : 'Movies'
                                }
                                onToggle={(val) => {
                                    if (val === 'Movies') setSearchType('movie');
                                    else if (val === 'TV Shows') setSearchType('tv');
                                }}
                            />
                        </div>
                    </div>

                    <div className="search-results-grid no-scrollbar">
                        <div className="grid-header">
                            {/* 'Trending Now' removed */}
                        </div>

                        {itemsToShow.length === 0 && !isSearching && !isDebouncing && query.trim() ? (
                            <div className="text-center py-20 text-gray-400">
                                No discovery found. Try a different search!
                            </div>
                        ) : (
                            <div className={`media-grid ${isSearching ? 'loading-state' : ''}`}>
                                {itemsToShow.map((media, index) => {
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
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};
