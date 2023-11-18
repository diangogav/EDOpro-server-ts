import { Redis } from "../../shared/db/redis/infrastructure/Redis";
import { BanList } from "../domain/BanList";
import { BanListRepository } from "../domain/BanListRepository";

export class BanListMemoryRepository implements BanListRepository {
	private static readonly banLists: BanList[] = [];
	add(banList: BanList): void {
		BanListMemoryRepository.banLists.push(banList);
	}

	get(): BanList[] {
		return BanListMemoryRepository.banLists;
	}

	findByHash(hash: number): BanList | null {
		return BanListMemoryRepository.banLists.find((list) => list.hash === hash) ?? null;
	}

	findByName(name: string): BanList | null {
		return BanListMemoryRepository.banLists.find((list) => list.name === name) ?? null;
	}

	async backup(): Promise<void> {
		const names = this.get()
			.filter((banList) => banList.name)
			.map((item) => item.name as string);
		const redis = Redis.getInstance();
		await redis.connect();
		await redis.client.del("banlists");
		await redis.client.rPush("banlists", names);
		await redis.client.quit();
	}
}
