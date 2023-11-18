import { BanList } from "./BanList";

export interface BanListRepository {
	add(banList: BanList): void;
	get(): BanList[];
	findByHash(hash: number): BanList | null;
	findByName(name: string): BanList | null;
	backup(): Promise<void>;
}
