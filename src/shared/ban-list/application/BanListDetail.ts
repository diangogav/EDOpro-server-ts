import { BanList } from "src/shared/ban-list/BanList";

export interface BanListEntry {
	id: number;
	name: string | null;
	points?: number;
}

export interface BanListDetailView {
	name: string;
	isWhitelist: boolean;
	isGenesys: boolean;
	forbidden: BanListEntry[];
	limited: BanListEntry[];
	semiLimited: BanListEntry[];
	whitelisted: BanListEntry[];
}

export type CardNameResolver = (id: number) => string | null;

export function toBanListDetail(banList: BanList, resolve: CardNameResolver): BanListDetailView {
	const entries = (ids: number[]): BanListEntry[] =>
		ids.map((id) => ({ id, name: resolve(id), points: banList.points.get(id) }));

	// Genesys lists everything at 3 copies (the `all` bucket) and restricts by
	// point cost instead of a whitelist flag, so surface `all` for it too and
	// order by cost so the priciest cards lead the list.
	const whitelisted =
		banList.isWhiteListed || banList.isGenesys()
			? entries(banList.all).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
			: [];

	return {
		name: banList.name as string,
		isWhitelist: banList.isWhiteListed,
		isGenesys: banList.isGenesys(),
		forbidden: entries(banList.forbidden),
		limited: entries(banList.limited),
		semiLimited: entries(banList.semiLimited),
		whitelisted,
	};
}
