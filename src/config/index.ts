// import * as dotenv from "dotenv";

// dotenv.config();

export const config = {
	redis: {
		uri: process.env.REDIS_URI,
	},
	env: process.env.NODE_ENV,
};
