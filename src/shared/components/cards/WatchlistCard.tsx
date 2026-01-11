import React from 'react';
import { Star, Check, X, Undo2, CalendarPlus } from 'lucide-react';
import { type TMDBMedia } from '../../../lib/tmdb';
import { useWatchlist } from '../../../features/watchlist/context/WatchlistContext';
import { usePreferences } from '../../../context/PreferencesContext';
import { getTodayValues, parseDate, parseDateLocal, isReleased } from '../../../lib/dateUtils';

interface WatchlistCardProps {
    media: TMDBMedia;
    type?: 'movie' | 'tv';
    onRemove: (media: TMDBMedia) => void;
    onMarkWatched: (media: TMDBMedia) => void;
    onMarkUnwatched?: (media: TMDBMedia) => void;
    onRestoreToUpcoming?: (media: TMDBMedia) => void;
    onClick: (media: TMDBMedia) => void;
    removeIcon?: React.ReactNode;
    removeLabel?: string;
    actionIcon?: React.ReactNode;
    actionLabel?: string;
    isDropped?: boolean;
    showContextLabel?: boolean;
}

export const WatchlistCard = ({
    media,
    type,
    onRemove,
    onMarkWatched,
    onMarkUnwatched,
    onRestoreToUpcoming,
    onClick,
    removeIcon,
    removeLabel,
    actionIcon,
    actionLabel,
    isDropped = false,
    showContextLabel = true
}: WatchlistCardProps) => {
    const { watchlist } = useWatchlist();
    const { region } = usePreferences();

    const title = media.title || media.name || 'Unknown';
    const imageUrl = media.poster_path
        ? (media.poster_path.startsWith('http') ? media.poster_path : `https://image.tmdb.org/t/p/w500${media.poster_path}`)
        : `https://placehold.co/500x750/1f2937/ffffff?text=${encodeURIComponent(title)}`;

    const year = (media.release_date || media.first_air_date)?.split('-')[0] || '';

    const providers = media['watch/providers']?.results?.[region];
    const providerName = providers?.flatrate?.[0]?.provider_name ||
        providers?.ads?.[0]?.provider_name ||
        providers?.free?.[0]?.provider_name || 'OTT';
    const showProvider = media.status === 'movie_on_ott' || (type === 'tv' && media.status !== 'show_dropped');

    let contextLabel = '';

    if (type === 'tv') {
        const nextEp = media.next_episode_to_air;
        let nextEpDate = nextEp?.air_date;
        let seasonNumber = nextEp?.season_number;
        let episodeNumber = nextEp?.episode_number;

        if (!nextEpDate && media.seasons && Array.isArray(media.seasons)) {
            const today = getTodayValues();
            const futureSeason = media.seasons.find((s) => s.air_date && parseDate(s.air_date)! >= today);
            if (futureSeason) {
                nextEpDate = futureSeason.air_date || undefined;
                seasonNumber = futureSeason.season_number;
                episodeNumber = 1;
            }
        }

        const isEnded = media.status === 'Ended' || media.status === 'Canceled';
        const lastSeasonNumber = media.number_of_seasons || 0;
        const currentSeason = media.seasons?.find((s: any) => s.season_number === seasonNumber);
        const isLastEpisodeOfSeason = currentSeason && episodeNumber && episodeNumber === currentSeason.episode_count;
        const isLastSeason = seasonNumber && seasonNumber === lastSeasonNumber;

        const nextDateObj = parseDateLocal(nextEpDate);
        const isReleasedToday = nextDateObj && nextDateObj.toDateString() === new Date().toDateString();
        const isReleasedPast = nextDateObj && nextDateObj < getTodayValues();

        if (seasonNumber === 1 && episodeNumber === 1) {
            contextLabel = isReleasedPast ? 'New Show (Aired)' : (isReleasedToday ? 'New Show (Today)' : 'New Show');
        } else if (isLastSeason && isEnded) {
            if (episodeNumber === 1) contextLabel = `Final Season (S${seasonNumber})`;
            else if (isLastEpisodeOfSeason) contextLabel = `Series Finale (S${seasonNumber}E${episodeNumber})`;
            else contextLabel = `Next Episode (S${seasonNumber}E${episodeNumber})`;
        } else if (episodeNumber === 1) {
            contextLabel = isReleasedPast ? `New Season Aired (S${seasonNumber})` : (isReleasedToday ? `New Season Today (S${seasonNumber})` : `New Season (S${seasonNumber})`);
        } else if (isLastEpisodeOfSeason) {
            contextLabel = isReleasedPast ? `Season Finale Aired (S${seasonNumber}E${episodeNumber})` : (isReleasedToday ? `Season Finale Today (S${seasonNumber}E${episodeNumber})` : `Season Finale (S${seasonNumber}E${episodeNumber})`);
        } else if (seasonNumber && episodeNumber) {
            contextLabel = isReleasedPast ? `Aired (S${seasonNumber}E${episodeNumber})` : (isReleasedToday ? `Airs Today (S${seasonNumber}E${episodeNumber})` : `Next Episode (S${seasonNumber}E${episodeNumber})`);
        } else if (media.last_episode_to_air) {
            const lastS = media.last_episode_to_air.season_number;
            const lastE = media.last_episode_to_air.episode_number;
            contextLabel = `Aired (S${lastS}E${lastE})`;
        }
    }

    const getStats = () => {
        if (type !== 'tv') return null;

        let totalSeasons = media.number_of_seasons || 0;
        const totalEpisodes = media.number_of_episodes || 0;

        if (media.seasons && Array.isArray(media.seasons)) {
            const releasedSeasons = media.seasons.filter((s) => {
                if (s.season_number === 0) return false;
                return isReleased(s.air_date || undefined);
            });

            if (releasedSeasons.length > 0) {
                totalSeasons = releasedSeasons.length;
            }
        }

        if (!totalSeasons) return null;

        const watchlistItem = watchlist.find(i => i.tmdb_id === media.id && i.type === 'show');
        const lastWatched = watchlistItem?.last_watched_season || 0;

        const watchedCount = lastWatched;
        const remainingSeasons = Math.max(0, totalSeasons - watchedCount);

        let remainingEpisodes = totalEpisodes;

        if (media.seasons && Array.isArray(media.seasons)) {
            const remainingEpsCount = media.seasons.reduce((acc: number, season) => {
                if (season.season_number > 0 && season.season_number > lastWatched) {
                    let count = season.episode_count || 0;

                    if (isReleased(season.air_date || undefined) === false) return acc;

                    if (media.next_episode_to_air) {
                        const nextSeason = media.next_episode_to_air.season_number;
                        const nextEpNum = media.next_episode_to_air.episode_number;

                        if (season.season_number > nextSeason) {
                            count = 0;
                        } else if (season.season_number === nextSeason) {
                            const todayStr = new Date().toISOString().split('T')[0];
                            const isAvailable = media.next_episode_to_air.air_date && media.next_episode_to_air.air_date <= todayStr;
                            count = Math.max(0, nextEpNum - (isAvailable ? 0 : 1));
                        }
                    } else if (media.last_episode_to_air) {
                        const lastSeason = media.last_episode_to_air.season_number;
                        const lastEp = media.last_episode_to_air.episode_number;

                        if (season.season_number > lastSeason) {
                            count = 0;
                        } else if (season.season_number === lastSeason) {
                            count = lastEp;
                        }
                    }
                    return acc + count;
                }
                return acc;
            }, 0);

            remainingEpisodes = remainingEpsCount;
        } else {
            if (totalSeasons > 0) {
                const avgEps = totalEpisodes / totalSeasons;
                remainingEpisodes = Math.round(remainingEpisodes - (watchedCount * avgEps));
            }
        }

        const progress = watchlistItem?.progress || 0;
        remainingEpisodes = Math.max(0, remainingEpisodes - progress);

        return { remainingSeasons, remainingEpisodes };
    };

    const stats = getStats();

    const getDuration = () => {
        let avgRuntime = 0;
        if (media.tvmaze_runtime) avgRuntime = media.tvmaze_runtime;
        else if (media.episode_run_time && media.episode_run_time.length > 0) avgRuntime = Math.min(...media.episode_run_time);
        else if (media.last_episode_to_air?.runtime) avgRuntime = media.last_episode_to_air.runtime;
        else if (media.runtime) avgRuntime = media.runtime;

        if (!avgRuntime) return null;

        if (type === 'movie' || !type) {
            const h = Math.floor(avgRuntime / 60);
            const m = avgRuntime % 60;
            if (h > 0) return `${h}h ${m}m`;
            return `${m}m`;
        }

        if (stats) {
            const totalMinutes = stats.remainingEpisodes * avgRuntime;
            if (totalMinutes === 0) return null;
            if (totalMinutes >= 24 * 60) {
                const days = Math.floor(totalMinutes / (24 * 60));
                const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
                return `${days}d ${hours}h`;
            }
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            if (h > 0) return `${h}h ${m}m`;
            return `${m}m`;
        }
        return null;
    };
    const duration = getDuration();

    const getFilterStyle = () => {
        if (isDropped) {
            return { filter: 'grayscale(100%) sepia(100%) hue-rotate(-50deg) saturate(600%) contrast(0.8)', opacity: 0.8 };
        }
        if (media.status === 'movie_watched' || media.status === 'show_watched' || media.status === 'finished') {
            return { filter: 'grayscale(100%)', opacity: 0.8 };
        }
        return {};
    };

    const filterStyle = getFilterStyle();
    const isFiltered = Object.keys(filterStyle).length > 0;

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
            aria-label={`View details for ${title}${year ? ` (${year})` : ''}${media.vote_average > 0 ? `, rated ${media.vote_average.toFixed(1)}` : ''}`}
        >
            <div className="poster-wrapper">
                <img
                    src={imageUrl}
                    alt={`${title} poster`}
                    className={`poster-img ${isFiltered ? 'group-hover:!grayscale-0 group-hover:!filter-none group-hover:!opacity-100 transition-all duration-300' : ''}`}
                    style={filterStyle}
                    loading="lazy"
                />

                <div className="pill-stack">
                    {showProvider && providerName && providerName !== 'OTT' && (
                        <div className="media-pill" style={{ backgroundColor: 'rgba(20, 20, 20, 0.8)', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                            <span className="text-gray-300">{providerName}</span>
                        </div>
                    )}

                    {year && (
                        <div className="media-pill pill-year">
                            <span>{year}</span>
                        </div>
                    )}

                    {media.vote_average > 0 && (
                        <div className="media-pill pill-rating">
                            <Star size={10} fill="#fbbf24" strokeWidth={0} />
                            <span>{media.vote_average.toFixed(1)}</span>
                        </div>
                    )}

                    {(duration && !isDropped) && (
                        <div className="media-pill pill-duration">
                            <span>{duration}</span>
                        </div>
                    )}
                    {(type === 'tv' && stats && stats.remainingEpisodes > 0) && (
                        <div className="media-pill pill-seasons">
                            <span>
                                {stats.remainingSeasons > 0
                                    ? (stats.remainingSeasons > 1 ? `${stats.remainingSeasons}S ` : '') + `${stats.remainingEpisodes}E`
                                    : `${stats.remainingEpisodes}E`
                                }
                            </span>
                        </div>
                    )}
                </div>

                <div className="card-actions-stack" role="group" aria-label={`Actions for ${title}`}>
                    {(type === 'tv' && media.dismissed_from_upcoming && onRestoreToUpcoming) && (
                        <button
                            className="add-btn bg-white/10 hover:bg-blue-500/80 text-white"
                            onClick={(e) => { e.stopPropagation(); onRestoreToUpcoming(media); }}
                            aria-label={`Start tracking upcoming seasons for ${title}`}
                            title="Start Tracking Upcoming Seasons"
                        >
                            <CalendarPlus size={16} aria-hidden="true" />
                        </button>
                    )}

                    {onMarkUnwatched && (
                        <button
                            className="add-btn bg-white/10 hover:bg-yellow-500/80 text-white"
                            onClick={(e) => { e.stopPropagation(); onMarkUnwatched(media); }}
                            aria-label={`Mark ${title} as unwatched`}
                            title="Unwatch (Move to Plan to Watch)"
                        >
                            <Undo2 size={16} aria-hidden="true" />
                        </button>
                    )}
                    <button
                        className="add-btn bg-white/10 hover:bg-teal-500/80 text-white"
                        onClick={(e) => { e.stopPropagation(); onMarkWatched(media); }}
                        aria-label={actionLabel ? `${actionLabel} ${title}` : `Mark ${title} as watched`}
                        title={actionLabel || "Mark as Watched"}
                    >
                        {actionIcon || <Check size={16} aria-hidden="true" />}
                    </button>
                    <button
                        className="add-btn text-white hover:scale-110"
                        onClick={(e) => { e.stopPropagation(); onRemove(media); }}
                        aria-label={removeLabel ? `${removeLabel} ${title}` : `Remove ${title} from library`}
                        title={removeLabel || "Remove from Library"}
                        style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                    >
                        {removeIcon || <X size={16} aria-hidden="true" />}
                    </button>
                </div>

                <div className="discovery-info-stack">
                    {(contextLabel && showContextLabel) && (
                        <div className="media-pill" style={{ backgroundColor: 'rgba(20, 20, 20, 0.8)', border: '1px solid rgba(255, 255, 255, 0.2)', marginBottom: '4px', width: 'fit-content' }}>
                            <span className="text-gray-300">{contextLabel}</span>
                        </div>
                    )}
                    <h4 className="discovery-title line-clamp-2">{title}</h4>
                </div>
            </div>
        </div>
    );
};
