import { ygoproBanListCatalog } from "@ygopro/ban-list/domain/YGOProBanListCatalog";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

/**
 * The hash a YGOPro client knows the ban list of an EDOPro room by, or null
 * when this server holds no list of that name for it.
 *
 * A lobby is told its ban list by hash, and each protocol hashes its own copy
 * of a list, so the hash of an EDOPro room names nothing a YGOPro client has.
 * The two copies share a name: the YGOPro list whose name resolves to the
 * room's hash is the one to announce.
 */
export function ownBanListHash(edoproHash: number): number | null {
	if (edoproHash === 0) return null;
	const catalog = ygoproBanListCatalog();
	for (let index = 0; ; index++) {
		const list = catalog.findLFListByIndex(index);
		if (list === null) return null;
		if (list.name !== null && YGOProRoom.edoproBanListHash(list.name) === edoproHash) {
			return list.hash;
		}
	}
}
