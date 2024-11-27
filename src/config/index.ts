import * as dotenv from "dotenv";

dotenv.config();

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
		enabled: process.env.RANK_ENABLED,
	},
	season: 4,
};
