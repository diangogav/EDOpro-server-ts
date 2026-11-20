import {
	useYGOProBanListCatalog,
	YGOProBanListCatalog,
} from "@ygopro/ban-list/domain/YGOProBanListCatalog";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { BanList } from "@shared/ban-list/BanList";
import { parseBanListEntry } from "@shared/ban-list/parseBanListEntry";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { ownBanListHash, useEdoproBanLists } from "./ownBanListHash";

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

const HASH_SEED = 0x7dfcee6a;
const WHITELIST_HASH_XOR = 0x0f0f0f0f;

/**
 * The hash the web client computes for a `$whitelist` section: its
 * `foldHashEntry` over every `code limit` row, then the whitelist XOR
 * (evolution-card-game, features/cards/domain/LFList.ts).
 */
function clientWhitelistHash(text: string): number {
	let hash = HASH_SEED;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#") || line.startsWith("!") || line.startsWith("$")) {
			continue;
		}
		const entry = /^(\d+)\s+(\d)\b(?:\s+(\d+))?/.exec(line);
		if (!entry) continue;
		const code = Number.parseInt(entry[1], 10);
		const count = Number.parseInt(entry[2], 10);
		if (code <= 0 || count > 3) continue;
		const folded =
			(((code << 18) | (code >>> 14)) ^ ((code << (27 + count)) | (code >>> (5 - count)))) >>> 0;
		hash = (hash ^ folded) >>> 0;
	}

	return (hash ^ WHITELIST_HASH_XOR) >>> 0;
}

/** The EDOPro copy of a list: every row folded into the hash, no whitelist XOR. */
class EdoproStyleBanList extends BanList {
	public add(cardId: number, quantity: number): void {
		[this.forbidden, this.limited, this.semiLimited, this.all][quantity]?.push(cardId);
		this._hash =
			this._hash ^
			((((cardId >>> 0) << 18) >> 0) | (cardId >> 14)) ^
			((((cardId >>> 0) << (27 + quantity)) >>> 0) | (cardId >>> (5 - quantity)));
	}
}

function edoproList(text: string): EdoproStyleBanList {
	const banList = new EdoproStyleBanList();
	for (const line of text.split("\n")) {
		if (line.startsWith("$whitelist")) banList.whileListed();
		if (line.startsWith("!")) banList.setName(line.substring(1));
		const entry = parseBanListEntry(line);
		if (entry) banList.add(entry.code, entry.limit);
	}

	return banList;
}

function registerEdopro(lists: BanList[]): void {
	useEdoproBanLists({
		findByHash: (hash) => lists.find((list) => list.hash >>> 0 === hash >>> 0) ?? null,
	});
}

const SPEED_FIXTURE = [
	"#[2025.07 Speed Duel]",
	"!2025.07 Speed Duel",
	"$whitelist",
	"#Forbidden",
	"300307012 0 --My Precious Queen!",
	"#Limited 1",
	"46986414 1 --Dark Magician",
	"#Limited 2",
	"89631139 2 --Blue-Eyes White Dragon",
	"#Unlimited",
	"86198326 3 --7 Completed",
	"24140059 3 --A Cat of Ill Omen",
].join("\n");

const SPEED_LIST_FILE = join(process.cwd(), "resources/current/edopro/lflists/Speed.lflist.conf");

describe("ownBanListHash for a whitelist only the EDOPro flow loads", () => {
	beforeEach(() => {
		YGOProRoom.useBanListHashLookup({ hashByName: () => undefined });
		register([list("2026.10 TCG", 0x1)]);
	});

	afterEach(() => {
		useEdoproBanLists(null);
	});

	it("gives the hash a YGOPro-style client computes for the same rows", () => {
		const speed = edoproList(SPEED_FIXTURE);
		registerEdopro([speed]);

		expect(ownBanListHash(speed.hash >>> 0)).toBe(clientWhitelistHash(SPEED_FIXTURE));
		expect(ownBanListHash(speed.hash >>> 0)).not.toBe(speed.hash >>> 0);
	});

	it("is the EDOPro hash with the whitelist XOR folded in", () => {
		const speed = edoproList(SPEED_FIXTURE);
		registerEdopro([speed]);

		expect(ownBanListHash(speed.hash >>> 0)).toBe((speed.hash ^ WHITELIST_HASH_XOR) >>> 0);
	});

	it("gives nothing for an EDOPro list that is not a whitelist", () => {
		const plain = edoproList(SPEED_FIXTURE.replace("$whitelist\n", ""));
		registerEdopro([plain]);

		expect(ownBanListHash(plain.hash >>> 0)).toBeNull();
	});

	it("gives nothing for a hash no EDOPro list carries", () => {
		registerEdopro([edoproList(SPEED_FIXTURE)]);

		expect(ownBanListHash(0x1234)).toBeNull();
	});

	it("gives nothing when the EDOPro lists are not registered", () => {
		expect(ownBanListHash(edoproList(SPEED_FIXTURE).hash >>> 0)).toBeNull();
	});

	// The assembled resources are not part of the repository: this runs where they exist.
	(existsSync(SPEED_LIST_FILE) ? it : it.skip)(
		"gives the client's hash for the Speed Duel list the server ships",
		() => {
			const text = readFileSync(SPEED_LIST_FILE, "utf-8");
			const speed = edoproList(text);
			registerEdopro([speed]);

			const own = ownBanListHash(speed.hash >>> 0);

			expect(speed.isWhiteListed).toBe(true);
			expect(speed.all.length).toBeGreaterThan(1000);
			expect(own).toBe(clientWhitelistHash(text));
			expect(own).not.toBe(0);
		},
	);
});

describe("ownBanListHash", () => {
	beforeEach(() => {
		YGOProRoom.useBanListHashLookup({
			hashByName: (name) => (name === "2010.03 Edison" ? EDOPRO_EDISON : undefined),
		});
	});

	afterAll(() => {
		YGOProRoom.useBanListHashLookup({ hashByName: () => undefined });
	});

	it("keeps the hash of the YGOPro list of that name over one recomputed from the EDOPro rows", () => {
		const edison = edoproList(SPEED_FIXTURE.replace("2025.07 Speed Duel", "2010.03 Edison"));
		YGOProRoom.useBanListHashLookup({
			hashByName: (name) => (name === "2010.03 Edison" ? edison.hash : undefined),
		});
		registerEdopro([edison]);
		register([list("2010.03 Edison", YGOPRO_EDISON)]);

		expect(ownBanListHash(edison.hash >>> 0)).toBe(YGOPRO_EDISON);
		useEdoproBanLists(null);
	});

	it("gives the hash of the YGOPro list that carries the name of the room's list", () => {
		register([list("2026.10 TCG", 0x1), list("2010.03 Edison", YGOPRO_EDISON)]);

		expect(ownBanListHash(EDOPRO_EDISON)).toBe(YGOPRO_EDISON);
	});

	it("matches a list whose hash has the high bit set, which this server keeps signed", () => {
		const onTheWire = 0xbadb011d;
		YGOProRoom.useBanListHashLookup({
			hashByName: (name) => (name === "2010.03 Edison" ? onTheWire | 0 : undefined),
		});
		register([list("2010.03 Edison", YGOPRO_EDISON)]);

		expect(ownBanListHash(onTheWire)).toBe(YGOPRO_EDISON);
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
