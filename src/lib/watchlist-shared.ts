import type { TMDBMedia } from './tmdb';
import { parseDateLocal, getTodayValues } from './dateUtils';
import type { WatchStatus } from '../types';

export type { WatchStatus };

/**
 * Determines if a specific season of a show is currently "ongoing" (not finished airing).
 */
export const isSeasonOngoing = (metadata: TMDBMedia, seasonNum: number): boolean => {
    const nextEp = metadata.next_episode_to_air;
    const lastEp = metadata.last_episode_to_air;

    // 1. If there's a future episode scheduled for THIS season, it's definitely ongoing.
    if (nextEp && nextEp.season_number === seasonNum) {
        return true;
    }

    // 5. Strict completion logic:
    // A season is finished IF:
    // (Episode count reached AND (Official end signal OR 14-days inactivity))
    const currentSeason = metadata.seasons?.find(s => s.season_number === seasonNum);
    const countReached = !!(currentSeason?.episode_count && lastEp?.season_number === seasonNum && lastEp.episode_number >= currentSeason.episode_count);
    const isOfficialEnd = metadata.status === 'Ended' || metadata.status === 'Canceled' || lastEp?.episode_type === 'finale';

    if (countReached) {
        const lastAirDate = parseDateLocal(lastEp?.air_date);
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const isLongAgo = !!(lastAirDate && lastAirDate < fourteenDaysAgo);

        if (isOfficialEnd || isLongAgo) {
            if (!nextEp || nextEp.season_number !== seasonNum) {
                return false;
            }
        }
    }

    // Default: It is still ongoing if it's the latest season and hasn't met the strict completion criteria.
    return lastEp?.season_number === seasonNum;
};

export const determineShowStatus = (metadata: TMDBMedia, lastWatchedSeason: number, progress: number = 0, currentStatus?: WatchStatus): WatchStatus => {
    if (currentStatus === 'show_dropped') return 'show_dropped';
    if (lastWatchedSeason === 0 && progress > 0) return 'show_watching';
    const seasons = metadata.seasons || [];
    const today = getTodayValues();
    const releasedSeasons = seasons.filter((s) => s.season_number > 0 && s.air_date && parseDateLocal(s.air_date)! <= today);
    const totalReleased = releasedSeasons.length;

    if (totalReleased === 0) return metadata.last_episode_to_air ? 'show_ongoing' : 'show_new';
    if (lastWatchedSeason === 0) {
        const { status, type } = metadata;
        const isFinished = (status === 'Ended' || status === 'Canceled' || status === 'Miniseries' || type === 'Miniseries') && status !== 'Returning Series';
        return isFinished ? 'show_finished' : 'show_ongoing';
    }
    if (lastWatchedSeason < totalReleased) return 'show_watching';

    // Check if the current season (or the last watched one) is still ongoing
    if (isSeasonOngoing(metadata, lastWatchedSeason)) {
        return 'show_watching';
    }

    if (metadata.next_episode_to_air?.air_date) {
        const nextDate = parseDateLocal(metadata.next_episode_to_air.air_date);
        if (nextDate && nextDate > today) {
            return metadata.next_episode_to_air.season_number === lastWatchedSeason ? 'show_watching' : 'show_returning';
        }
    }
    return 'show_watched';
};

export const pruneMetadata = (meta: TMDBMedia | undefined, region: string): TMDBMedia | undefined => {
    if (!meta) return meta;
    const providers = meta['watch/providers']?.results;
    let leanProviders = {};
    if (providers && providers[region]) {
        leanProviders = { results: { [region]: providers[region] } };
    }
    let leanVideos = meta.videos;
    if (meta.videos?.results) {
        const trailer = meta.videos.results.find((v) => v.type === 'Trailer' && v.site === 'YouTube');
        leanVideos = trailer ? { results: [trailer] } : { results: [] };
    }
    // Whitelist
    const {
        id, backdrop_path, overview, release_date, first_air_date, runtime, status,
        next_episode_to_air, last_episode_to_air, seasons, external_ids,
        genres, number_of_episodes, number_of_seasons, episode_run_time, tvmaze_runtime,
        digital_release_date, digital_release_note, theatrical_release_date, moved_to_library,
        manual_date_override, manual_ott_name, dismissed_from_upcoming, last_updated_at
    } = meta;
    return {
        id,
        title: meta.title || meta.name,
        name: meta.name || meta.title,
        poster_path: meta.poster_path,
        backdrop_path, overview,
        vote_average: meta.vote_average,
        release_date, first_air_date, runtime, status,
        next_episode_to_air, last_episode_to_air, seasons, external_ids,
        genres, number_of_episodes, number_of_seasons,
        episode_run_time, tvmaze_runtime,
        digital_release_date, digital_release_note, theatrical_release_date, moved_to_library,
        manual_date_override, manual_ott_name, dismissed_from_upcoming, last_updated_at,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'watch/providers': leanProviders as { results: Record<string, any> },
        videos: leanVideos
    } as TMDBMedia;
};

export const getEnrichedMetadata = async (tmdbId: number, type: 'movie' | 'show', region: string, existingMetadata?: TMDBMedia | null, currentStatus?: WatchStatus) => {
    // Dynamic import to avoid loading tmdb.ts (which uses import.meta.env) in Node.js
    const { tmdb } = await import('./tmdb');
    const tmdbType = type === 'show' ? 'tv' : 'movie';
    const [details, releaseData] = await Promise.all([
        tmdb.getDetails(tmdbId, tmdbType, region),
        tmdbType === 'movie' ? tmdb.getReleaseDates(tmdbId) : Promise.resolve({ results: [] })
    ]);

    let theatricalDate: string | null = null;
    let indianDigitalDate: string | null = null;
    let indianDigitalNote: string | null = null;

    if (tmdbType === 'movie') {
        const results = releaseData?.results || [];
        const extractDates = (regionCode: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const regionData = results.find((r: { iso_3166_1: string, release_dates: any[] }) => r.iso_3166_1 === regionCode);
            if (!regionData?.release_dates) return null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const theatrical = (regionData.release_dates as any[]).find((d) => d.type === 3) || (regionData.release_dates as any[]).find((d) => d.type === 2);
            // Priority: Digital (4) -> Physical (5) (Often proxy for Rental/VOD)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const digital = (regionData.release_dates as any[]).find((d) => d.type === 4) || (regionData.release_dates as any[]).find((d) => d.type === 5);
            return {
                theatrical: theatrical?.release_date as string | undefined,
                digital: digital?.release_date as string | undefined,
                digitalNote: (digital?.note as string) || null,
                hasData: !!(theatrical || digital)
            };
        };
        const inDates = extractDates(region);
        if (inDates?.digital) {
            indianDigitalDate = inDates.digital;
            indianDigitalNote = inDates.digitalNote;
        }
        if (inDates?.theatrical) {
            theatricalDate = inDates.theatrical;
        }

        // Global Theatrical Fallback
        if (!theatricalDate && results.length > 0) {
            let earliestDate = null;
            for (const res of results) {
                if (!res.release_dates || !Array.isArray(res.release_dates)) continue;

                for (const d of res.release_dates) {
                    if (d.type === 2 || d.type === 3 || d.type === 4) {
                        if (d.release_date) {
                            if (!earliestDate || d.release_date < earliestDate) {
                                earliestDate = d.release_date;
                            }
                        }
                    }
                }
            }
            if (earliestDate) theatricalDate = earliestDate;
        }
    }

    let tvmazeRuntime = null;
    if (tmdbType === 'tv' && details.external_ids?.imdb_id) {
        try {
            const tvmRes = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${details.external_ids.imdb_id}`);
            if (tvmRes.ok) {
                const tvmData = await tvmRes.json();
                tvmazeRuntime = tvmData.averageRuntime || null;
            }
        } catch (e) { console.warn("TVMaze failed", e); }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerData: { flatrate?: any[]; ads?: any[]; free?: any[]; rent?: any[]; buy?: any[] } = details['watch/providers']?.results?.[region] || {};
    const allStreamingOrRental = [
        ...(providerData.flatrate || []),
        ...(providerData.ads || []),
        ...(providerData.free || []),
        ...(providerData.rent || []),
        ...(providerData.buy || [])
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let initialStatus: WatchStatus = type === 'movie' ? 'movie_unwatched' : 'show_new';
    let movedToLibrary = true;

    if (tmdbType === 'movie') {
        let releaseDateStr = details.release_date;
        if (theatricalDate && (!releaseDateStr || theatricalDate < releaseDateStr)) {
            releaseDateStr = theatricalDate;
        }
        const releaseDateObj = parseDateLocal(releaseDateStr);
        const hasProvidersIN = allStreamingOrRental.length > 0;
        const indianDigDateObj = parseDateLocal(indianDigitalDate);
        const hasFutureIndianDigitalDate = indianDigDateObj && indianDigDateObj > today;
        const hasManualOverride = existingMetadata?.manual_date_override;

        const isReleased = !releaseDateObj || releaseDateObj <= today;
        const hasValidDigitalTransition = currentStatus === 'movie_coming_soon' && isReleased && !!indianDigDateObj;

        let isAvailableGlobally = false;
        if (releaseDateObj) {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            if (releaseDateObj < sixMonthsAgo) {
                const allProviders = details['watch/providers']?.results || {};
                for (const r in allProviders) {
                    const p = allProviders[r];
                    if ((p.flatrate || []).length > 0 || (p.rent || []).length > 0 || (p.buy || []).length > 0) {
                        isAvailableGlobally = true;
                        break;
                    }
                }
            }
        }

        if (hasProvidersIN && (!releaseDateObj || releaseDateObj <= today)) {
            if (!currentStatus) {
                movedToLibrary = true;
                initialStatus = 'movie_unwatched';
            } else if (currentStatus === 'movie_coming_soon') {
                movedToLibrary = false;
                initialStatus = 'movie_on_ott';
            } else {
                movedToLibrary = true;
                initialStatus = currentStatus === 'movie_watched' ? 'movie_watched' : 'movie_unwatched';
            }
        } else if (hasProvidersIN || hasFutureIndianDigitalDate || hasValidDigitalTransition || hasManualOverride) {
            if (!currentStatus || currentStatus === 'movie_coming_soon' || hasManualOverride || hasProvidersIN) {
                movedToLibrary = false;
                initialStatus = 'movie_on_ott';
            } else {
                movedToLibrary = true;
                initialStatus = 'movie_unwatched';
            }
        } else if (isAvailableGlobally) {
            if (!currentStatus) {
                movedToLibrary = true;
                initialStatus = 'movie_unwatched';
            } else if (currentStatus === 'movie_coming_soon') {
                movedToLibrary = false;
                initialStatus = 'movie_on_ott';
            } else {
                movedToLibrary = true;
                initialStatus = 'movie_unwatched';
            }
        } else if (releaseDateObj && releaseDateObj < new Date(new Date().setFullYear(new Date().getFullYear() - 1))) {
            if (!currentStatus) {
                movedToLibrary = true;
                initialStatus = 'movie_unwatched';
            } else if (currentStatus === 'movie_coming_soon') {
                movedToLibrary = false;
                initialStatus = 'movie_on_ott';
            } else {
                movedToLibrary = true;
                initialStatus = 'movie_unwatched';
            }
        } else {
            movedToLibrary = false;
            initialStatus = 'movie_coming_soon';
        }

        if (currentStatus === 'movie_on_ott' && initialStatus === 'movie_unwatched') {
            initialStatus = 'movie_on_ott';
            movedToLibrary = false;
        }
        if (currentStatus === 'movie_watched') {
            initialStatus = 'movie_watched';
            movedToLibrary = true;
        }
    } else {
        const lastEp = details.last_episode_to_air;

        if (!lastEp) {
            initialStatus = currentStatus || 'show_new';
            movedToLibrary = !!currentStatus;
        } else {
            if (!currentStatus) {
                const status = details.status;
                const showType = details.type as string;
                const isFinished = (status === 'Ended' || status === 'Canceled' || status === 'Miniseries' || showType === 'Miniseries') && status !== 'Returning Series';
                const isNew = status === 'Planned' || status === 'In Production' || status === 'Pilot' || status === 'Rumored';

                if (isNew) initialStatus = 'show_new';
                else if (isFinished) initialStatus = 'show_finished';
                else initialStatus = 'show_ongoing';

                if (initialStatus === 'show_new') movedToLibrary = false;
                else movedToLibrary = true;
            } else {
                initialStatus = currentStatus;
                movedToLibrary = true;
            }
        }
    }

    const oldSeasonsCount = existingMetadata?.number_of_seasons || 0;
    const newSeasonsCount = details.number_of_seasons || 0;

    let isDismissed = existingMetadata?.dismissed_from_upcoming;
    if (isDismissed && newSeasonsCount > oldSeasonsCount) {
        console.log(`[Auto-Restore] New season detected for ${details.name || details.title}. Restoring to Upcoming.`);
        isDismissed = false;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { credits: _c, production_companies: _pc, images: _i, videos: _v, reviews: _r, ...leanDetails } = details as TMDBMedia;
    const finalMetadata: TMDBMedia = {
        ...(existingMetadata || {}),
        ...leanDetails,
        tvmaze_runtime: tvmazeRuntime,
        digital_release_date: (indianDigitalDate || (existingMetadata?.manual_date_override ? (existingMetadata.digital_release_date) : undefined)) as string | undefined,
        digital_release_note: (indianDigitalDate ? indianDigitalNote : (existingMetadata?.manual_date_override ? (existingMetadata.digital_release_note) : undefined)) as string | undefined,
        theatrical_release_date: theatricalDate || existingMetadata?.theatrical_release_date,
        manual_date_override: indianDigitalDate ? false : !!existingMetadata?.manual_date_override,
        moved_to_library: movedToLibrary,
        dismissed_from_upcoming: isDismissed
    };

    return { initialStatus, finalMetadata, movedToLibrary };
};
