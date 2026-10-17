/**
 * How many rows the home screen's "recent" tables show — the newest few, not a
 * list. Its own module so the client tables and the server loader share it
 * without the tables importing the server-only data loader.
 */
export const DASHBOARD_RECENT_ROWS = 5;
