// Lightweight "don't refetch what's still fresh" caching, built entirely on
// Redux Toolkit's own createAsyncThunk `condition` option — no new library.
//
// This exists instead of adding React Query/SWR: the brief for this phase
// asked for response caching via one of those, but the very first
// instruction of this whole engagement was to keep the tech stack as-is
// (React, Redux Toolkit, Express, Prisma, MongoDB). Running Redux Toolkit
// and React Query side by side is a legitimate pattern elsewhere, but it's
// a real new architectural piece, not something to add unilaterally against
// an explicit constraint. This delivers the actual goal — skip redundant
// network requests for data that's still fresh — without a new dependency.
//
// Deliberately scoped to a couple of slices, not applied everywhere: pages
// with active Socket.IO listeners that re-dispatch a fetch in response to a
// live event (AuctionHub, Bookings, StationDetail) should NOT have those
// dispatches silently skipped by a time-based condition — that would mean a
// real update (a bid landing, a booking status changing) not showing up
// because it happened to fall inside the cache window. Same reasoning for
// admin pages: correctness matters more than shaving a network round trip
// when someone's about to block a user or approve a station. Applied here
// only to Stations and My EVs — frequently revisited, no competing
// real-time listener, and brief staleness (default 30s) is a fully
// acceptable trade-off for either.
const DEFAULT_TTL_MS = 30_000;

export const isFresh = (lastFetchedAt, ttlMs = DEFAULT_TTL_MS) =>
  !!lastFetchedAt && Date.now() - lastFetchedAt < ttlMs;
