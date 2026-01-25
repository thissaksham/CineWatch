import React from 'react';
import { Plus, Check, Star, Clock } from 'lucide-react';
import type { Game } from '../../../types';

interface GameDiscoveryCardProps {
    game: Game;
    isAdded: boolean;
    onAdd: (game: Game) => void;
    onRemove?: (game: Game) => void; // Optional if we want to support quick remove from search
}

export const GameDiscoveryCard: React.FC<GameDiscoveryCardProps> = ({
    game,
    isAdded,
    onAdd,
    onRemove
}) => {
    // Format rating (0-100 to 0-10) similar to TMDB
    const rating = game.rating ? (game.rating / 10).toFixed(1) : null;
    const year = game.release_date ? game.release_date.substring(0, 4) : null;
    const playtime = game.hours_played && game.hours_played > 0 ? `${game.hours_played}h` : null;

    return (
        <div className="discovery-card group">
            <div className="discovery-poster-wrapper">
                <img
                    src={game.cover_url || ''}
                    alt={game.title}
                    className="discovery-poster-img"
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
                </div>

                {/* Discovery Actions: Simple Add/Added */}
                <div className="discovery-actions">
                    {isAdded ? (
                        <button
                            className="added-badge"
                            title="Remove from Library"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onRemove) onRemove(game);
                            }}
                        >
                            <Check size={14} strokeWidth={3} />
                            <span>Added</span>
                        </button>
                    ) : (
                        <button
                            className="discovery-add-btn"
                            title="Add to Library"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAdd(game);
                            }}
                        >
                            <Plus size={20} />
                        </button>
                    )}
                </div>

                <div className="discovery-info-stack">
                    <h4 className="discovery-title line-clamp-2">{game.title}</h4>
                </div>
            </div>
        </div>
    );
};
