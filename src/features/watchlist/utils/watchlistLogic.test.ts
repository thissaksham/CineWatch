
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { determineShowStatus } from './watchlistLogic';
import type { TMDBMedia } from '../../../lib/tmdb';

describe('determineShowStatus', () => {
    // Lock time to Jan 1, 2024
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Helper: 2023 is past, 2025 is future
    const PAST_DATE = '2023-01-01';
    const FUTURE_DATE = '2025-01-01';

    // Helper to create mock season data
    const mockSeason = (num: number, airDate: string) => ({
        id: num,
        name: `Season ${num}`,
        overview: '',
        poster_path: null,
        season_number: num,
        episode_count: 10,
        air_date: airDate
    });

    describe('Not Started (lastWatchedSeason: 0)', () => {
        it('should return show_new for Pilot/In Production status', () => {
            const result = determineShowStatus({ status: 'In Production' } as Partial<TMDBMedia> as TMDBMedia, 0);
            expect(result).toBe('show_new');
        });

        it('should return show_finished for Ended status', () => {
            const result = determineShowStatus({
                status: 'Ended',
                seasons: [mockSeason(1, PAST_DATE)]
            } as Partial<TMDBMedia> as TMDBMedia, 0);
            expect(result).toBe('show_finished');
        });

        it('should return show_ongoing for Returning Series', () => {
            const result = determineShowStatus({
                status: 'Returning Series',
                seasons: [mockSeason(1, PAST_DATE)]
            } as Partial<TMDBMedia> as TMDBMedia, 0);
            expect(result).toBe('show_ongoing');
        });

        it('should return show_ongoing if status is unknown but has episodes', () => {
            const result = determineShowStatus({
                status: 'Unknown',
                last_episode_to_air: { runtime: 30, air_date: PAST_DATE, season_number: 1, episode_number: 1 }
            } as Partial<TMDBMedia> as TMDBMedia, 0);
            expect(result).toBe('show_ongoing');
        });

        it('should return show_new if no seasons released and no last episode', () => {
            const result = determineShowStatus({ seasons: [] } as Partial<TMDBMedia> as TMDBMedia, 0);
            expect(result).toBe('show_new');
        });
    });
    
    describe('Dropped Status', () => {
        it('should return show_dropped if current status is show_dropped', () => {
            const result = determineShowStatus({} as TMDBMedia, 1, 0, 'show_dropped');
            expect(result).toBe('show_dropped');
        });

        it('should return show_dropped even if active progress exists', () => {
            const result = determineShowStatus({} as TMDBMedia, 1, 5, 'show_dropped');
            expect(result).toBe('show_dropped');
        });
    });

    describe('Started Watching', () => {
        const standardSeasons = [
            mockSeason(1, PAST_DATE),
            mockSeason(2, PAST_DATE)
        ];

        it('should return show_watching if user is behind (watched 1 of 2)', () => {
            const result = determineShowStatus({ seasons: standardSeasons } as Partial<TMDBMedia> as TMDBMedia, 1);
            expect(result).toBe('show_watching');
        });

        it('should return show_watched if caught up (watched 2 of 2) and no future info', () => {
            const result = determineShowStatus({ seasons: standardSeasons } as Partial<TMDBMedia> as TMDBMedia, 2);
            expect(result).toBe('show_watched');
        });

        it('should return show_watching if caught up but next episode is same season (Mid-Season Break)', () => {
            const result = determineShowStatus({
                seasons: standardSeasons,
                next_episode_to_air: { runtime: 30, air_date: FUTURE_DATE, season_number: 2, episode_number: 10 }
            } as Partial<TMDBMedia> as TMDBMedia, 2);
            expect(result).toBe('show_watching');
        });

        it('should return show_returning if caught up and next episode is NEXT season', () => {
            const result = determineShowStatus({
                seasons: standardSeasons,
                next_episode_to_air: { runtime: 30, air_date: FUTURE_DATE, season_number: 3, episode_number: 1 }
            } as Partial<TMDBMedia> as TMDBMedia, 2);
            expect(result).toBe('show_returning');
        });

        it('should return show_returning if caught up and future season exists in seasons array', () => {
            const seasonsWithFuture = [
                ...standardSeasons,
                mockSeason(3, FUTURE_DATE)
            ];
            const result = determineShowStatus({ seasons: seasonsWithFuture } as Partial<TMDBMedia> as TMDBMedia, 2);
            expect(result).toBe('show_returning');
        });
        it('should return show_watched immediately if last episode is a finale (manual check)', () => {
            const seasons = [mockSeason(1, PAST_DATE)];
            const lastEp = { 
                runtime: 30, 
                air_date: PAST_DATE, 
                season_number: 1, 
                episode_number: 10,
                episode_type: 'finale' 
            };
            // Mocking the date to be very recent (only 1 day after PAST_DATE, so < 14 days)
            vi.setSystemTime(new Date(PAST_DATE).getTime() + 24 * 60 * 60 * 1000);
            
            const result = determineShowStatus({ 
                seasons, 
                last_episode_to_air: lastEp,
                status: 'Returning Series' // Still returning, but this season is done
            } as Partial<TMDBMedia> as TMDBMedia, 1);
            
            expect(result).toBe('show_watched');
        });
    });
});
