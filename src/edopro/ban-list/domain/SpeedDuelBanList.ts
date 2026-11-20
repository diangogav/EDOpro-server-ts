import { EdoproBanList } from "./BanList";

const SPEED_DUEL_NAME = /speed duel/i;

/**
 * The Speed Duel list among the loaded ones. Its name carries the date it was
 * issued (`2025.07 Speed Duel`), so it is found by what the name says and not
 * by a dated literal; with several loaded, the most recent date wins.
 */
export function findSpeedDuelBanList(lists: readonly EdoproBanList[]): EdoproBanList | null {
	const named = lists.filter((list) => list.name !== null && SPEED_DUEL_NAME.test(list.name));
	named.sort((a, b) => (b.name as string).localeCompare(a.name as string));

	return named[0] ?? null;
}
