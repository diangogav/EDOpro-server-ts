import { BanList } from "@shared/ban-list/BanList";
import { BanListsByHash } from "@shared/ban-list/BanListsByHash";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";
import { ygoproBanListCatalog } from "@ygopro/ban-list/domain/YGOProBanListCatalog";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

let edoproBanLists: BanListsByHash | null = null;

/** Registers the ban lists the EDOPro flow has loaded; boot calls it when that flow is wired. */
export function useEdoproBanLists(lists: BanListsByHash | null): void {
	edoproBanLists = lists;
}

/**
 * The hash a YGOPro client knows the ban list of an EDOPro room by, or null
 * when this server holds no list of that name for it.
 *
 * A lobby is told its ban list by hash, and each protocol hashes its own copy
 * of a list, so the hash of an EDOPro room names nothing a YGOPro client has.
 * The two copies share a name: the YGOPro list whose name resolves to the
 * room's hash is the one to announce.
 *
 * A whitelist only the EDOPro flow loads (the Speed Duel list) has no YGOPro
 * copy to name. Its client still holds the file and hashes it the YGOPro
 * way, so that hash is computed here from the rows of the EDOPro list.
 */
export function ownBanListHash(edoproHash: number): number | null {
	if (edoproHash === 0) return null;
	const catalog = ygoproBanListCatalog();
	for (let index = 0; ; index++) {
		const list = catalog.findLFListByIndex(index);
		if (list === null) return whitelistHashOfEdoproList(edoproHash);
		// The wire carries the hash unsigned; a loaded list keeps the signed
		// result of the XOR that builds it. Compare both as unsigned.
		if (list.name !== null && YGOProRoom.edoproBanListHash(list.name) >>> 0 === edoproHash >>> 0) {
			return list.hash;
		}
	}
}

/**
 * The hash a YGOPro-style client computes for the whitelist the EDOPro flow
 * announces as `edoproHash`, or null when that flow holds no whitelist under
 * it. A list that is not a whitelist is left alone: the two protocols do not
 * even hash the same rows of it.
 */
function whitelistHashOfEdoproList(edoproHash: number): number | null {
	const list = edoproBanLists?.findByHash(edoproHash) ?? null;
	if (!list?.isWhiteListed) return null;

	return asYgoproWhitelist(list).hash;
}

function asYgoproWhitelist(list: BanList): YGOProBanList {
	const own = new YGOProBanList();
	const buckets: [number[], number][] = [
		[list.forbidden, 0],
		[list.limited, 1],
		[list.semiLimited, 2],
		[list.all, 3],
	];
	for (const [cardIds, quantity] of buckets) {
		for (const cardId of cardIds) {
			own.add(cardId, quantity);
		}
	}
	own.recomputeWhitelistHash();

	return own;
}
