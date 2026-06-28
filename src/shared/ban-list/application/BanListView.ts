import { BanList } from "src/shared/ban-list/BanList";

export interface BanListView {
	name: string;
	forbidden: number;
	limited: number;
	semiLimited: number;
}

export function toBanListViews(banLists: BanList[]): BanListView[] {
	return banLists
		.filter((banList) => banList.name !== null)
		.map((banList) => ({
			name: banList.name as string,
			forbidden: banList.forbidden.length,
			limited: banList.limited.length,
			semiLimited: banList.semiLimited.length,
		}));
}
