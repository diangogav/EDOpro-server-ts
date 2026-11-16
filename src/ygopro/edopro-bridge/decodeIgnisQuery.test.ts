import { IgnisReader } from "./IgnisReader";
import { decodeIgnisQuery } from "./decodeIgnisQuery";
import { EMPTY_SLOT, END, QUERY_CODE, QUERY_POSITION, field, u16, u32 } from "./ignisQuery.testing";

const QUERY_RACE = 0x80;
const QUERY_ATTACK = 0x100;
const QUERY_EQUIP_CARD = 0x4000;
const QUERY_OVERLAY_CARD = 0x10000;
const QUERY_COUNTERS = 0x20000;
const QUERY_OWNER = 0x40000;
const QUERY_IS_PUBLIC = 0x100000;
const QUERY_LINK = 0x800000;
const BATTLE_OX = 5053103;

function decode(bytes: number[]): ReturnType<typeof decodeIgnisQuery> {
	return decodeIgnisQuery(new IgnisReader(Uint8Array.from(bytes)));
}

describe("decodeIgnisQuery", () => {
	it("reads scalar fields and records which ones arrived", () => {
		const query = decode([
			...field(QUERY_CODE, u32(BATTLE_OX)),
			...field(QUERY_POSITION, u32(0x1)),
			...field(QUERY_ATTACK, u32(1700)),
			...field(QUERY_OWNER, [1]),
			...END,
		]);

		expect(query).toMatchObject({ code: BATTLE_OX, position: 0x1, attack: 1700, owner: 1 });
		expect(query.flags).toBe(QUERY_CODE | QUERY_POSITION | QUERY_ATTACK | QUERY_OWNER);
		expect(query.defense).toBeUndefined();
	});

	it("reads the 64-bit race and a negative attack", () => {
		const query = decode([
			...field(QUERY_RACE, [...u32(0), ...u32(1)]),
			...field(QUERY_ATTACK, u32(0xffff_fffe)),
			...END,
		]);

		expect(query.race).toBe(0x1_0000_0000);
		expect(query.attack).toBe(-2);
	});

	it("reads overlay materials, counters and the link pair", () => {
		const query = decode([
			...field(QUERY_OVERLAY_CARD, [...u32(2), ...u32(BATTLE_OX), ...u32(89631139)]),
			...field(QUERY_COUNTERS, [...u32(1), ...u32(0x1 | (3 << 16))]),
			...field(QUERY_LINK, [...u32(2), ...u32(0x28)]),
			...END,
		]);

		expect(query.overlayCards).toEqual([BATTLE_OX, 89631139]);
		expect(query.counters).toEqual([expect.objectContaining({ type: 1, count: 3 })]);
		expect(query).toMatchObject({ link: 2, linkMarker: 0x28 });
	});

	it("reads an equip target as a 10-byte location", () => {
		const query = decode([...field(QUERY_EQUIP_CARD, [1, 0x04, ...u32(3), ...u32(0x1)]), ...END]);

		expect(query.equipCard).toMatchObject({
			controller: 1,
			location: 0x04,
			sequence: 3,
			position: 0x1,
		});
	});

	it("skips a field it has no slot for without losing the next one", () => {
		const query = decode([
			...field(QUERY_IS_PUBLIC, [1]),
			...field(QUERY_CODE, u32(BATTLE_OX)),
			...END,
		]);

		expect(query.code).toBe(BATTLE_OX);
		expect(query.flags).toBe(QUERY_CODE);
	});

	it("marks a slot with no card as empty", () => {
		expect(decode(EMPTY_SLOT)).toMatchObject({ empty: true, flags: 0 });
	});

	it("rejects a field that declares fewer bytes than its value needs", () => {
		const lying = [...u16(4 + 2), ...u32(QUERY_CODE), ...u32(BATTLE_OX), ...END];

		expect(() => decode(lying)).toThrow(/declared 6/);
	});
});
