import { Redis } from "../../../shared/db/redis/infrastructure/Redis";
import { EdoproBanList } from "../domain/BanList";

const banLists: EdoproBanList[] = [];

export default {
	add(banList: EdoproBanList): void {
		banLists.push(banList);
	},

	get(): EdoproBanList[] {
		return banLists;
	},

	findByHash(hash: number): EdoproBanList | null {
		return banLists.find((list) => list.hash === hash) ?? null;
	},

	findByName(name: string): EdoproBanList | null {
		return banLists.find((list) => list.name === name) ?? null;
	},

	async backup(): Promise<void> {
		const redis = Redis.getInstance();
		if (redis) {
			const names = banLists.filter((banList) => banList.name).map((item) => item.name as string);
			await redis.del("banlists");
			await redis.rpush("banlists", ...names);
		}
	},

	getOnlyWithName(): string[] {
		return banLists.filter((banList) => banList.name).map((item) => item.name as string);
	},
};
