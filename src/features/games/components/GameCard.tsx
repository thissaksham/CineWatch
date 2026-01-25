import React from 'react';
import { Check, Star, X, Undo2, Trash2, Pencil, Clock } from 'lucide-react';
import type { Game, GameStatus } from '../../../types';
import { getPlatformById } from '../constants/platformData';

interface GameCardProps {
    game: Game;
    onClick?: () => void;
    onRemove?: (game: Game) => void;
    onStatusChange?: (status: GameStatus) => void;
    onPlatformClick?: (game: Game) => void;
}

export const GameCard: React.FC<GameCardProps> = ({ game, onClick, onRemove, onStatusChange, onPlatformClick }) => {
    // Format rating (0-100 to 0-10) similar to TMDB
    const rating = game.rating ? (game.rating / 10).toFixed(1) : null;
    const year = game.release_date ? game.release_date.substring(0, 4) : null;
    const playtime = game.hours_played && game.hours_played > 0 ? `${game.hours_played}h` : null;

    const getFilterStyle = () => {
        if (!game.status) return {};
        if (game.status === 'dropped') {
            return { filter: 'grayscale(100%) sepia(100%) hue-rotate(-50deg) saturate(600%) contrast(0.8)', opacity: 0.8 };
        }
        if (game.status === 'finished' || game.status === 'beaten') {
            return { filter: 'grayscale(100%)', opacity: 0.8 };
        }
        return {};
    };

    const filterStyle = getFilterStyle();
    const isFiltered = Object.keys(filterStyle).length > 0;

    return (
        <div className="discovery-card group" onClick={onClick}>
            <div className="discovery-poster-wrapper">
                <img
                    src={game.cover_url || ''}
                    alt={game.title}
                    className={`discovery-poster-img ${isFiltered ? 'group-hover:!grayscale-0 group-hover:!filter-none group-hover:!opacity-100 transition-all duration-300' : ''}`}
                    style={filterStyle}
                    loading="lazy"
                />

                {/* Standardized Pills Stack (Top-Left) */}
                <div className="pill-stack">
                    {rating && (
                        <div className="media-pill pill-rating">
                            <Star size={10} fill="#fbbf24" strokeWidth={0} />
                            <span>{rating}</span>
                        </div>
                    )}

                    {year && (
                        <div className="media-pill pill-year">
                            <span>{year}</span>
                        </div>
                    )}

                    {playtime && (
                        <div className="media-pill pill-playtime">
                            <Clock size={10} strokeWidth={2.5} />
                            <span>{playtime}</span>
                        </div>
                    )}

                    {game.status === 'playing' && (
                        <div className="game-status-pill status-playing" style={{ position: 'static', marginTop: '4px' }}>
                            Playing
                        </div>
                    )}
                </div>

                {/* Actions Stack */}
                <div className="card-actions-stack">
                    {/* 
                       Logic based on User Request:
                       1. Unplayed (Backlog): Mark as Played (Check) AND Drop (X)
                       2. Played (Finished/Beaten): Mark as Unplayed (Undo) AND Remove (Trash)
                       3. Dropped: Restore (Undo) AND Remove (Trash)
                    */}

                    {/* Button 1: Positive/Neutral Action */}
                    {(game.status === 'finished' || game.status === 'beaten') ? (
                        <button
                            className="add-btn bg-white/10 hover:bg-yellow-500/80 text-white"
                            title="Mark as Unplayed"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onStatusChange) onStatusChange('backlog');
                            }}
                        >
                            <Undo2 size={16} />
                        </button>
                    ) : game.status === 'dropped' ? (
                        <button
                            className="add-btn bg-white/10 hover:bg-blue-500/80 text-white"
                            title="Restore to Library"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onStatusChange) onStatusChange('backlog');
                            }}
                        >
                            <Undo2 size={16} />
                        </button>
                    ) : (
                        // Default: Backlog/Playing -> Mark as Played
                        <button
                            className="add-btn bg-white/10 hover:bg-teal-500/80 text-white"
                            title="Mark as Played"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onStatusChange) onStatusChange('finished');
                            }}
                        >
                            <Check size={16} />
                        </button>
                    )}

                    {/* Button 2: Negative/Remove Action */}
                    {(game.status === 'dropped' || game.status === 'finished' || game.status === 'beaten') ? (
                        <button
                            className="add-btn text-white hover:scale-110"
                            style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                            title="Remove from Library"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onRemove) onRemove(game);
                            }}
                        >
                            <Trash2 size={16} />
                        </button>
                    ) : (
                        // Backlog -> Drop
                        <button
                            className="add-btn text-white hover:scale-110"
                            style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                            title="Drop Game"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onStatusChange) onStatusChange('dropped');
                            }}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                <div className="discovery-info-stack">
                    {/* Platform Icons Row - Above Title */}
                    {/* Platform Icons Row - Above Title */}
                    {game.platform && game.platform.length > 0 ? (
                        <div
                            style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', cursor: 'pointer', pointerEvents: 'auto' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onPlatformClick) onPlatformClick(game);
                            }}
                            title="Edit Platforms"
                        >
                            {game.platform.map(p => {
                                const platformData = getPlatformById(p);
                                if (!platformData) return null;
                                return (
                                    <div
                                        key={p}
                                        title={p}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: 'rgba(0, 0, 0, 0.6)',
                                            backdropFilter: 'blur(8px)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '6px',
                                            padding: '4px',
                                            width: '28px',
                                            height: '28px',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                        }}
                                        className="opacity-90 hover:opacity-100 transition-opacity"
                                    >
                                        <platformData.icon size={16} color={platformData.color} />
                                    </div>
                                );
                            })}

                            {/* Edit Indicator */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center w-7 h-7 bg-white/10 hover:bg-white/20 rounded-md border border-white/10 backdrop-blur-sm">
                                <Pencil size={12} className="text-white" />
                            </div>
                        </div>
                    ) : (
                        // Placeholder for "Add Platform" - Icon only
                        <div
                            style={{ marginBottom: '8px', display: 'flex', pointerEvents: 'auto' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onPlatformClick) onPlatformClick(game);
                            }}
                            title="Add Platform"
                        >
                            <div className="flex items-center justify-center w-7 h-7 bg-white/10 hover:bg-white/20 rounded-md border border-white/10 backdrop-blur-sm transition-colors">
                                <Pencil size={12} className="text-white" />
                            </div>
                        </div>
                    )}

                    <h4 className="discovery-title line-clamp-2">{game.title}</h4>
                </div>
            </div>
        </div>
    );
};
