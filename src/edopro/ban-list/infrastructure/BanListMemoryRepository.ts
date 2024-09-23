import { Redis } from "../../../shared/db/redis/infrastructure/Redis";
import { BanList } from "../domain/BanList";

const banLists: BanList[] = [];

export default {
	add(banList: BanList): void {
		banLists.push(banList);
	},

	get(): BanList[] {
		return banLists;
	},

	findByHash(hash: number): BanList | null {
		return banLists.find((list) => list.hash === hash) ?? null;
	},

	findByMercuryHash(hash: number): BanList | null {
		return banLists.find((list) => list.mercuryHash === hash) ?? null;
	},

	findByName(name: string): BanList | null {
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
