import { Redis } from "../../shared/db/redis/infrastructure/Redis";
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

	findByName(name: string): BanList | null {
		return banLists.find((list) => list.name === name) ?? null;
	},

	async backup(): Promise<void> {
		const names = banLists.filter((banList) => banList.name).map((item) => item.name as string);
		const redis = Redis.getInstance();
		await redis.connect();
		await redis.client.del("banlists");
		await redis.client.rPush("banlists", names);
		await redis.client.quit();
	},

	getOnlyWithName(): string[] {
		return banLists.filter((banList) => banList.name).map((item) => item.name as string);
	},
};
