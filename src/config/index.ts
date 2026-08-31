import { parseWindbotConfig } from "../ygopro/windbot/infrastructure/WindbotConfig";

/**
 * Honors any explicit numeric env value — including 0 — and falls back only
 * when the variable is unset or non-numeric. The `Number(...) || default`
 * idiom used elsewhere in this file silently turns an explicit 0 into the
 * default, which matters for knobs where 0 is a meaningful operator choice
 * (e.g. a deny-all rate limit).
 */
function numberFromEnv(value: string | undefined, fallback: number): number {
	if (value === undefined || value === "") {
		return fallback;
	}
	const parsed = Number(value);

	return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
	redis: {
		use: process.env.USE_REDIS === "true",
		uri: process.env.REDIS_URI,
	},
	env: process.env.NODE_ENV,
	adminApiKey: process.env.ADMIN_API_KEY,
	postgres: {
		username: process.env.POSTGRES_USER,
		password: process.env.POSTGRES_PASSWORD,
		database: process.env.POSTGRES_DB,
		host: process.env.POSTGRES_HOST ?? "localhost",
		port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : 5432,
	},
	ranking: {
		enabled: process.env.RANK_ENABLED === "true",
	},
	rankGroups: {
		path: process.env.RANK_GROUPS_PATH ?? "./config/rank-groups.json",
	},
	season: Number(process.env.SEASON),
	allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") ?? ["*"],
	rateLimit: {
		enabled: process.env.RATE_LIMIT_ENABLED === "true",
		limit: Number(process.env.RATE_LIMIT),
		window: Number(process.env.RATE_LIMIT_WINDOW),
		// Per-IP budget for ygopro socket JOIN attempts. Deliberately separate
		// from limit/window above (a small per-room wrong-password budget):
		// this one must absorb every join a whole NAT'd LAN plus a flapping
		// mobile reconnect can legitimately produce, so it defaults generous.
		join: {
			// 0 is a valid operator choice here (deny every join), so this knob
			// must not fold an explicit 0 into the default.
			limit: numberFromEnv(process.env.RATE_LIMIT_JOIN, 60),
			window: Number(process.env.RATE_LIMIT_JOIN_WINDOW) || 60,
		},
	},
	servers: {
		host: {
			port: Number(process.env.HOST_PORT),
		},
		mercury: {
			port: Number(process.env.YGOPRO_PORT),
			wsPort: Number(process.env.YGOPRO_WEBSOCKET_PORT) || 4002,
			wsHeartbeatIntervalMs: Number(process.env.YGOPRO_WEBSOCKET_HEARTBEAT_MS) || 30000,
		},
		http: {
			port: Number(process.env.HTTP_PORT),
		},
		websocket: {
			port: Number(process.env.WEBSOCKET_PORT),
			duelPort: Number(process.env.WEBSOCKET_DUEL_PORT) || 4001,
		},
	},
	resources: {
		dir: process.env.RESOURCES_DIR ?? "./resources/current",
		manifestPath: process.env.MANIFEST_PATH ?? "./resources.manifest.json",
		ygopro: {
			extraScripts: process.env?.YGOPRO_EXTRA_SCRIPTS?.split(",") ?? [],
		},
	},
	sideTimeoutMinutes: Number(process.env.SIDE_TIMEOUT_MINUTES) || 3,
	windbot: parseWindbotConfig(process.env),
};
