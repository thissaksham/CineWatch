/**
 * Status Constants
 * Centralized status definitions for watchlist items
 */

export const MOVIE_STATUSES = {
  WATCHED: 'movie_watched',
  UNWATCHED: 'movie_unwatched',
  DROPPED: 'movie_dropped',
  ON_OTT: 'movie_on_ott',
  COMING_SOON: 'movie_coming_soon',
} as const;

export const SHOW_STATUSES = {
  FINISHED: 'show_finished',
  ONGOING: 'show_ongoing',
  WATCHED: 'show_watched',
  WATCHING: 'show_watching',
  RETURNING: 'show_returning',
  NEW: 'show_new',
  DROPPED: 'show_dropped',
} as const;

export const ALL_STATUSES = {
  ...MOVIE_STATUSES,
  ...SHOW_STATUSES,
} as const;
