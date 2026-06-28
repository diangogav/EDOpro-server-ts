import { BanList } from "src/shared/ban-list/BanList";

export interface BanListEntry {
	id: number;
	name: string | null;
}

export interface BanListDetailView {
	name: string;
	isWhitelist: boolean;
	forbidden: BanListEntry[];
	limited: BanListEntry[];
	semiLimited: BanListEntry[];
	whitelisted: BanListEntry[];
}

export type CardNameResolver = (id: number) => string | null;

export function toBanListDetail(banList: BanList, resolve: CardNameResolver): BanListDetailView {
	const entries = (ids: number[]): BanListEntry[] => ids.map((id) => ({ id, name: resolve(id) }));

	return {
		name: banList.name as string,
		isWhitelist: banList.isWhiteListed,
		forbidden: entries(banList.forbidden),
		limited: entries(banList.limited),
		semiLimited: entries(banList.semiLimited),
		whitelisted: banList.isWhiteListed ? entries(banList.all) : [],
	};
}
