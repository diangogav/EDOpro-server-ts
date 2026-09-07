// Encodes (user_id, rank_id, season) with a length-prefixed field so the
// concatenation stays injective even when a value contains the delimiter — a
// plain "a|b|c" join can collide for two different inputs. Shared verbatim
// between `RatingPostgresRepository` and `PlayerStatsPostgresRepository` so
// the server credit path and the API's ladder-locking path genuinely
// serialize against the same key.
export const ADVISORY_LOCK_QUERY = `
	SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || length($2)::text || ':' || $2 || ':' || $3, 0))
`;
