import { useState, useRef, useLayoutEffect, useEffect, useMemo, useCallback } from 'react';
import { Gamepad2, Search, ListFilter } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GameCard } from '../components/GameCard';
import { FranchiseCard } from '../components/FranchiseCard';
import { FranchiseOverlay } from '../components/FranchiseOverlay';
import { useGameLibrary } from '../hooks/useGameLibrary';
import type { Franchise, Game } from '../../../types';
import '../styles/GameCards.css';
import styles from '../../../shared/components/ui/SmartPillButton.module.css';

import { PlatformSelector } from '../components/PlatformSelector';

export const GamesPage = () => {
    const [selectedFranchise, setSelectedFranchise] = useState<Franchise | null>(null);
    const [editingPlatformGame, setEditingPlatformGame] = useState<Game | null>(null);
    const navigate = useNavigate();
    const location = useLocation();

    // -------------------------------------------------------------------------
    // 1. FILTER STATE & URL SYNC
    // -------------------------------------------------------------------------

    // Determine initial view from URL
    const getInitialViewMode = () => {
        const pathParts = location.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1].toLowerCase();

        if (lastPart === 'played') return 'Played';
        if (lastPart === 'dropped') return 'Dropped';
        return 'Unplayed';
    };

    const [viewMode, setViewMode] = useState<string>(getInitialViewMode());
    const prevPathRef = useRef(location.pathname);

    // Sync viewMode with URL changes using ref pattern
    useEffect(() => {
        if (location.pathname !== prevPathRef.current) {
            const mode = getInitialViewMode();
            if (mode !== viewMode) setViewMode(mode);
            prevPathRef.current = location.pathname;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    const handleViewModeChange = (mode: string) => {
        navigate(`/games/${mode.toLowerCase()}`);
    };

    // -------------------------------------------------------------------------
    // 2. PILL BUTTON LOGIC (Custom for Games)
    // -------------------------------------------------------------------------
    const slots = ['Unplayed', 'Played', 'Dropped'];
    const activeIndex = slots.indexOf(viewMode);
    const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});
    const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

    const updateHighlight = useCallback(() => {
        if (activeIndex !== -1 && optionRefs.current[activeIndex]) {
            const element = optionRefs.current[activeIndex]!;
            setHighlightStyle({ width: `${element.offsetWidth}px`, left: `${element.offsetLeft}px` });
        }
    }, [activeIndex]);

    useLayoutEffect(() => {
        updateHighlight();
        window.addEventListener('resize', updateHighlight);
        return () => window.removeEventListener('resize', updateHighlight);
    }, [activeIndex, updateHighlight]);

    // -------------------------------------------------------------------------
    // 3. SEARCH & CONTENT (Local Filter)
    // -------------------------------------------------------------------------
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState<'date_added' | 'rating' | 'release_date' | 'random'>('date_added');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const sortRef = useRef<HTMLDivElement>(null);

    // Close sort menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
                setIsSortOpen(false);
            }
        };

        if (isSortOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSortOpen]);

    const { libraryGames, updateStatus, updatePlatform, removeGame } = useGameLibrary();
    // -------------------------------------------------------------------------
    // 4. DATA PROCESSING (Memoized)
    // -------------------------------------------------------------------------
    const { activeFranchises, activeGames } = useMemo(() => {
        // Step 1: Filter by View Mode (Status)
        // We do this FIRST so franchises are only formed from games in the current view.
        const visibleLibraryGames = libraryGames.filter(game => {
            const status = game.status || 'backlog';
            if (viewMode === 'Unplayed') return ['backlog', 'wishlist'].includes(status);
            if (viewMode === 'Played') return ['playing', 'finished', 'beaten'].includes(status);
            if (viewMode === 'Dropped') return status === 'dropped';
            return false;
        });

        // Step 2: Grouping Algorithm
        const franchises: Franchise[] = [];
        const standaloneGames: Game[] = [];
        const processedGameIds = new Set<string>();

        // Sort by added date (or user sort) - for now just defined order
        const initialSortedGames = [...visibleLibraryGames];

        initialSortedGames.forEach(game => {
            if (processedGameIds.has(game.id)) return;

            // Check for series data
            const seriesIds = new Set<number>();
            if (game.franchise_data) {
                game.franchise_data.forEach((s) => seriesIds.add(s.id));
            }

            // Find related games within the VISIBLE set only
            const relatedGames = sortedGames.filter(otherGame => {
                if (otherGame.id === game.id) return true;
                if (processedGameIds.has(otherGame.id)) return false;

                const otherId = otherGame.rawg_id;
                if (seriesIds.has(otherId)) return true;
                if (otherGame.franchise_data?.some((s) => s.id === game.rawg_id)) return true;
                if (otherGame.franchise_data) {
                    return otherGame.franchise_data.some((s) => seriesIds.has(s.id));
                }
                return false;
            });

            if (relatedGames.length > 1) {
                relatedGames.forEach(g => processedGameIds.add(g.id));
                const sortedByRelease = [...relatedGames].sort((a, b) => (a.release_date || '') > (b.release_date || '') ? 1 : -1);
                const mainGame = sortedByRelease[0];

                franchises.push({
                    id: `frac-${mainGame.id}`, // Stable ID based on the "main" game (oldest)
                    name: mainGame.title.split(':')[0],
                    cover_url: mainGame.cover_url,
                    games: relatedGames
                });
            } else {
                standaloneGames.push(game);
                processedGameIds.add(game.id);
            }
        });

        // Step 3: Search Filtering
        const filteredFranchises = franchises.filter(franchise => {
            if (!searchTerm) return true;
            const term = searchTerm.toLowerCase();
            return franchise.name.toLowerCase().includes(term) || franchise.games.some(g => g.title.toLowerCase().includes(term));
        });

        const filteredStandalone = standaloneGames.filter(game => {
            if (!searchTerm) return true;
            return game.title.toLowerCase().includes(searchTerm.toLowerCase());
        });

        // Step 4: Sorting Logic
        const sortGames = (a: Game, b: Game) => {
            switch (sortOption) {
                case 'rating':
                    return (b.rating || 0) - (a.rating || 0);
                case 'release_date': {
                    const dateA = a.release_date || '';
                    const dateB = b.release_date || '';
                    return dateB > dateA ? 1 : (dateB < dateA ? -1 : 0);
                }
                case 'random':
                    return 0.5 - Math.random();
                case 'date_added':
                default:
                    const createdAtA = a.created_at || '';
                    const createdAtB = b.created_at || '';
                    return createdAtB > createdAtA ? 1 : (createdAtB < createdAtA ? -1 : 0);
            }
        };

        const sortedGames = [...filteredStandalone].sort(sortGames);

        const sortedFranchises = [...filteredFranchises].sort((a, b) => {
            // Use the "main" (oldest) game of the franchise for sorting comparison
            const mainA = [...a.games].sort((ga, gb) => (ga.release_date || '') > (gb.release_date || '') ? 1 : -1)[0];
            const mainB = [...b.games].sort((ga, gb) => (ga.release_date || '') > (gb.release_date || '') ? 1 : -1)[0];
            return sortGames(mainA, mainB);
        });

        return { activeFranchises: sortedFranchises, activeGames: sortedGames };
    }, [libraryGames, viewMode, searchTerm, sortOption]);

    // -------------------------------------------------------------------------
    // 5. SYNC SELECTED FRANCHISE
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!selectedFranchise) return;

        // Try to find the same franchise in the new active list
        // We match if the ID is the same OR if it contains the same games (heuristic)
        const found = activeFranchises.find(f => f.id === selectedFranchise.id);

        if (found) {
            // Update reference to get new game statuses
            if (found !== selectedFranchise) setSelectedFranchise(found);
        } else {
            // ID changed or dissolved? Check content overlap
            const replacement = activeFranchises.find(f =>
                f.games.some(g => selectedFranchise.games.some(sg => sg.id === g.id))
            );

            if (replacement) {
                setSelectedFranchise(replacement);
            } else {
                // Dissolved or moved out of view -> Close Overlay
                setSelectedFranchise(null);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFranchises]); // Only check when the grouping result changes

    return (
        <div>
            <header className="page-header flex justify-between items-end mb-6">
                <div>
                    <h1 className="page-title text-3xl font-bold flex items-baseline">
                        Games Library
                        <span style={{ fontSize: '0.9rem', opacity: 0.2, fontWeight: 'normal', marginLeft: '10px' }} className="select-none">
                            showing {activeGames.length + activeFranchises.length} results
                        </span>
                    </h1>
                    <p className="subtitle text-gray-400 mt-1">Manage your gaming collection and track progress.</p>
                </div>

                <div
                    className="flex items-center"
                    style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '24px' }}
                >
                    {/* Games Pill Button */}
                    <div className={styles['pill-button']}>
                        {slots.map((slot, index) => (
                            <div
                                key={slot}
                                ref={el => { optionRefs.current[index] = el; }}
                                className={`${styles['pill-button-selection']} ${viewMode === slot ? styles['pill-button-selection_active'] : ''}`}
                                onClick={() => handleViewModeChange(slot)}
                            >
                                {slot}
                            </div>
                        ))}
                        <div className={styles['pill-button-highlight']} style={highlightStyle}></div>
                    </div>

                    {/* Sort Dropdown - Reused from LibraryPage */}
                    <div className="relative z-50" ref={sortRef} style={{ position: 'relative', marginRight: '8px' }}>
                        <button
                            className={`pill filter-trigger gap-2 transition-colors ${isSortOpen ? 'bg-white/10 text-white active' : 'hover:bg-white/10'}`}
                            onClick={() => setIsSortOpen(!isSortOpen)}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            <span className="text-sm font-medium">Sort</span>
                            <ListFilter size={16} />
                        </button>

                        {isSortOpen && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '8px',
                                    zIndex: 1000,
                                    minWidth: '220px'
                                }}
                                className="animate-in fade-in slide-in-from-top-2 duration-200"
                            >
                                <div
                                    style={{
                                        backgroundColor: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '12px',
                                        padding: '4px',
                                        width: '100%',
                                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '2px'
                                    }}
                                >
                                    {[
                                        { id: 'date_added', label: 'Date Added' },
                                        { id: 'rating', label: 'Highest Rated' },
                                        { id: 'release_date', label: 'Newest Release' },
                                        { id: 'random', label: 'Random Shuffle' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => {
                                                setSortOption(opt.id as 'date_added' | 'rating' | 'release_date' | 'random');
                                                setIsSortOpen(false);
                                            }}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '10px 12px',
                                                fontSize: '14px',
                                                borderRadius: '8px',
                                                backgroundColor: sortOption === opt.id ? 'var(--primary)' : 'transparent',
                                                color: sortOption === opt.id ? 'white' : 'var(--text-secondary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                border: 'none',
                                                cursor: 'pointer',
                                                transition: 'background-color 0.2s',
                                                fontWeight: sortOption === opt.id ? '600' : '400'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (sortOption !== opt.id) {
                                                    e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                                                    e.currentTarget.style.color = 'var(--text-primary)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (sortOption !== opt.id) {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                                }
                                            }}
                                        >
                                            {opt.label}
                                            {sortOption === opt.id && (
                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'white', boxShadow: '0 0 8px rgba(255,255,255,0.5)' }} />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Local Search Input */}
                    <div className="search-bar" style={{ position: 'relative', width: '250px' }}>
                        <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Search Games..."
                            className="search-input"
                            style={{ width: '100%' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            <div className="games-grid">
                {/* Franchises */}
                {activeFranchises.map((franchise) => (
                    <FranchiseCard
                        key={franchise.id}
                        franchise={franchise}
                        onClick={() => setSelectedFranchise(franchise)}
                    />
                ))}

                {/* Single Games */}
                {activeGames.map((game) => (
                    <GameCard
                        key={game.id}
                        game={game}
                        onStatusChange={(status) => updateStatus({ id: game.id, status })}
                        onRemove={() => removeGame(game.id)}
                        onPlatformClick={(g) => setEditingPlatformGame(g)}
                    />
                ))}
            </div>

            {activeGames.length === 0 && activeFranchises.length === 0 && (
                <div className="u-full-center py-20 u-vstack text-center" style={{ color: '#94a3b8' }}>
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '2rem',
                        borderRadius: '50%',
                        marginBottom: '1.5rem',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        <Gamepad2 size={48} color="#14b8a6" />
                    </div>
                    <h2 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        {viewMode === 'Unplayed' ? "Your backlog is empty" : `No ${viewMode.toLowerCase()} games`}
                    </h2>
                    <p style={{ maxWidth: '400px', lineHeight: 1.6 }}>
                        Start adding games to your collection.
                    </p>
                </div>
            )}

            <FranchiseOverlay
                franchise={selectedFranchise}
                onClose={() => setSelectedFranchise(null)}
                onPlatformClick={(g) => setEditingPlatformGame(g)}
            />

            {/* Platform Edit Selector */}
            <PlatformSelector
                isOpen={!!editingPlatformGame}
                onClose={() => setEditingPlatformGame(null)}
                gameTitle={editingPlatformGame?.title || ''}
                initialSelected={editingPlatformGame?.platform}
                onConfirm={(platforms) => {
                    if (editingPlatformGame) {
                        updatePlatform({ id: editingPlatformGame.id, platforms });
                    }
                    setEditingPlatformGame(null);
                }}
            />
        </div>
    );
};
