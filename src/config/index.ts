import * as dotenv from "dotenv";

dotenv.config();

export const config = {
	redis: {
		use: process.env.USE_REDIS === "true",
		uri: process.env.REDIS_URI,
	},
	env: process.env.NODE_ENV,
	adminApiKey: process.env.ADMIN_API_KEY,
};
