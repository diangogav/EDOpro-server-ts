import * as dotenv from "dotenv";

dotenv.config();

export const config = {
	redis: {
		uri: process.env.REDIS_URI,
	},
};
