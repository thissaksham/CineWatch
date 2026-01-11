import React from 'react';
import { Star, Undo2, X, CalendarPlus } from 'lucide-react';
import { type TMDBMedia } from '../../../lib/tmdb';

interface HistoryCardProps {
    media: TMDBMedia;
    onUnwatch: (media: TMDBMedia) => void;
    onRemove: (media: TMDBMedia) => void;
    onRestoreToUpcoming?: (media: TMDBMedia) => void;
    onClick: (media: TMDBMedia) => void;
}

export const HistoryCard = ({
    media,
    onUnwatch,
    onRemove,
    onRestoreToUpcoming,
    onClick
}: HistoryCardProps) => {
    const title = media.title || media.name || 'Unknown';
    const imageUrl = media.poster_path
        ? (media.poster_path.startsWith('http') ? media.poster_path : `https://image.tmdb.org/t/p/w500${media.poster_path}`)
        : `https://placehold.co/500x750/1f2937/ffffff?text=${encodeURIComponent(title)}`;

    const year = (media.release_date || media.first_air_date)?.split('-')[0] || '';

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(media);
        }
    };

    return (
        <div 
            className="media-card group" 
            onClick={() => onClick(media)}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`View details for ${title}${year ? ` (${year})` : ''}, watched`}
        >
            <div className="poster-wrapper">
                <img 
                    src={imageUrl} 
                    alt={`${title} poster`} 
                    className="poster-img" 
                    style={{ filter: 'grayscale(100%)' }} 
                    loading="lazy" 
                />

                <div className="pill-stack">
                    {media.vote_average > 0 && (
                        <div className="media-pill pill-rating">
                            <Star size={10} fill="#fbbf24" strokeWidth={0} aria-hidden="true" />
                            <span aria-label={`Rating: ${media.vote_average.toFixed(1)} out of 10`}>{media.vote_average.toFixed(1)}</span>
                        </div>
                    )}
                    {year && (
                        <div className="media-pill pill-year">
                            <span>{year}</span>
                        </div>
                    )}
                </div>

                <div className="card-actions-stack" role="group" aria-label={`Actions for ${title}`}>
                    {(media.dismissed_from_upcoming && onRestoreToUpcoming) && (
                        <button
                            className="add-btn bg-white/10 hover:bg-blue-500/80 text-white"
                            onClick={(e) => { e.stopPropagation(); onRestoreToUpcoming(media); }}
                            aria-label={`Start tracking upcoming seasons for ${title}`}
                            title="Start Tracking Upcoming Seasons"
                        >
                            <CalendarPlus size={16} aria-hidden="true" />
                        </button>
                    )}
                    <button
                        className="add-btn"
                        onClick={(e) => { e.stopPropagation(); onUnwatch(media); }}
                        aria-label={`Mark ${title} as unwatched`}
                        title="Unwatch (Move to Watchlist)"
                    >
                        <Undo2 size={16} aria-hidden="true" />
                    </button>
                    <button
                        className="add-btn text-white hover:scale-110"
                        onClick={(e) => { e.stopPropagation(); onRemove(media); }}
                        aria-label={`Remove ${title} from history`}
                        title="Remove from History"
                        style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>

                <div className="discovery-info-stack">
                    <h4 className="discovery-title line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{title}</h4>
                </div>
            </div>
        </div>
    );
};
