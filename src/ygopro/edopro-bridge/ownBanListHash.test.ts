import {
	useYGOProBanListCatalog,
	YGOProBanListCatalog,
} from "@ygopro/ban-list/domain/YGOProBanListCatalog";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { ownBanListHash } from "./ownBanListHash";

const EDOPRO_EDISON = 0x0ed15011;
const YGOPRO_EDISON = 0x0e150a01;

function list(name: string, hash: number): YGOProBanList {
	return { name, hash } as unknown as YGOProBanList;
}

function register(lists: YGOProBanList[]): void {
	useYGOProBanListCatalog({
		findLFListByIndex: (index: number) => lists[index] ?? null,
	} as unknown as YGOProBanListCatalog);
}

describe("ownBanListHash", () => {
	beforeEach(() => {
		YGOProRoom.useBanListHashLookup({
			hashByName: (name) => (name === "2010.03 Edison" ? EDOPRO_EDISON : undefined),
		});
	});

	afterAll(() => {
		YGOProRoom.useBanListHashLookup({ hashByName: () => undefined });
	});

	it("gives the hash of the YGOPro list that carries the name of the room's list", () => {
		register([list("2026.10 TCG", 0x1), list("2010.03 Edison", YGOPRO_EDISON)]);

		expect(ownBanListHash(EDOPRO_EDISON)).toBe(YGOPRO_EDISON);
	});

	it("gives nothing when no YGOPro list carries that name", () => {
		register([list("2026.10 TCG", 0x1)]);

		expect(ownBanListHash(EDOPRO_EDISON)).toBeNull();
	});

	it("gives nothing for a room with no ban list", () => {
		register([list("2010.03 Edison", YGOPRO_EDISON)]);

		expect(ownBanListHash(0)).toBeNull();
	});
});
