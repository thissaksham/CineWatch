/**
 * Route Constants
 * Centralized route definitions for consistent navigation
 */

export const ROUTES = {
  AUTH: '/auth',
  AUTH_VERIFIED: '/auth/verified',
  HOME: '/',
  MOVIES: '/movies',
  MOVIES_UNWATCHED: '/movies/unwatched',
  MOVIES_WATCHED: '/movies/watched',
  MOVIES_DROPPED: '/movies/dropped',
  SHOWS: '/shows',
  SHOWS_WATCHING: '/shows/watching',
  SHOWS_WATCHED: '/shows/watched',
  SHOWS_FINISHED: '/shows/finished',
  SHOWS_DROPPED: '/shows/dropped',
  UPCOMING: '/upcoming',
  UPCOMING_OTT: '/upcoming/onOTT',
  UPCOMING_COMING_SOON: '/upcoming/comingSoon',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
