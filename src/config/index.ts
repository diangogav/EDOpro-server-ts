import * as dotenv from "dotenv";

dotenv.config();

export const config = {
	useRedis: process.env.USE_REDIS === 'true',
	redis: {
		uri: process.env.REDIS_URI,
	},
	env: process.env.NODE_ENV,
	adminApiKey: process.env.ADMIN_API_KEY,
};
