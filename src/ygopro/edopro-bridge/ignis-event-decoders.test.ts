import {
	YGOProMsgBecomeTarget,
	YGOProMsgChainSolving,
	YGOProMsgChaining,
	YGOProMsgConfirmCards,
	YGOProMsgDeckTop,
	YGOProMsgPlayerHint,
	YGOProMsgReloadField,
	YGOProMsgSet,
	YGOProMsgShuffleSetCard,
	YGOProMsgSpSummoning,
	YGOProMsgSwapGraveDeck,
} from "ygopro-msg-encode";
import { translateIgnisGameMsg } from "./translateIgnisGameMsg";
import { IgnisWriter } from "./IgnisWriter.testing";

const CONTEXT = { duelRule: 5 };
const HAND = 0x02;
const MZONE = 0x04;
const GRAVE = 0x10;
const BORA = 49003716;
const SHURA = 58820853;
const CARD_DESC = 0x10_0000;

function translate<T>(writer: IgnisWriter, type: new () => T): T {
	const result = translateIgnisGameMsg(writer.build(), CONTEXT);
	if (result.kind !== "message") throw new Error(`not translated: ${JSON.stringify(result)}`);
	expect(result.message).toBeInstanceOf(type);
	return result.message as T;
}

describe("Ignis events", () => {
	it("translates MSG_SET and MSG_SPSUMMONING as code plus location", () => {
		const body = (type: number): IgnisWriter =>
			new IgnisWriter().u8(type).u32(BORA).location(1, MZONE, 3, 0x1);

		expect(translate(body(54), YGOProMsgSet)).toMatchObject({
			code: BORA,
			controller: 1,
			sequence: 3,
		});
		expect(translate(body(62), YGOProMsgSpSummoning)).toMatchObject({
			code: BORA,
			location: MZONE,
			position: 0x1,
		});
	});

	it("translates MSG_CHAINING with the activation location, text and chain link", () => {
		const writer = new IgnisWriter()
			.u8(70)
			.u32(BORA)
			.location(0, MZONE, 2, 0x1)
			.u8(0)
			.u8(MZONE)
			.u32(2)
			.u64(BORA * CARD_DESC + 1)
			.u32(3);

		expect(translate(writer, YGOProMsgChaining)).toMatchObject({
			code: BORA,
			controller: 0,
			location: MZONE,
			sequence: 2,
			chainCardLocation: { controller: 0, location: MZONE, sequence: 2 },
			desc: BORA * 16 + 1,
			chainCount: 3,
		});
		expect(translate(new IgnisWriter().u8(72).u8(3), YGOProMsgChainSolving).chainCount).toBe(3);
	});

	it("packs each target of MSG_BECOME_TARGET into one word", () => {
		const writer = new IgnisWriter().u8(83).u32(1).location(1, MZONE, 2, 0x1);

		expect(translate(writer, YGOProMsgBecomeTarget).targets).toEqual([
			1 | (MZONE << 8) | (2 << 16) | (0x1 << 24),
		]);
	});

	it("translates MSG_CONFIRM_CARDS", () => {
		const writer = new IgnisWriter().u8(31).u8(1).u32(1).u32(BORA).u8(0).u8(HAND).u32(4);

		expect(translate(writer, YGOProMsgConfirmCards)).toMatchObject({
			player: 1,
			count: 1,
			cards: [{ code: BORA, controller: 0, location: HAND, sequence: 4 }],
		});
	});

	it("pairs old and new locations of MSG_SHUFFLE_SET_CARD", () => {
		const writer = new IgnisWriter()
			.u8(36)
			.u8(MZONE)
			.u8(2)
			.location(0, MZONE, 0, 0x8)
			.location(0, MZONE, 1, 0x8)
			.location(0, MZONE, 1, 0x8)
			.location(0, MZONE, 0, 0x8);

		const message = translate(writer, YGOProMsgShuffleSetCard);

		expect(
			message.cards.map((card) => [card.oldLocation.sequence, card.newLocation.sequence]),
		).toEqual([
			[0, 1],
			[1, 0],
		]);
	});

	it("flags a face-up deck top the YGOPro way", () => {
		const writer = new IgnisWriter().u8(38).u8(0).u32(0).u32(BORA).u32(0x1);

		expect(translate(writer, YGOProMsgDeckTop).code).toBe((BORA | 0x8000_0000) >>> 0);
	});

	it("translates the effect text of a player hint", () => {
		const writer = new IgnisWriter()
			.u8(165)
			.u8(0)
			.u8(6)
			.u64(BORA * CARD_DESC + 2);

		expect(translate(writer, YGOProMsgPlayerHint)).toMatchObject({
			player: 0,
			type: 6,
			value: BORA * 16 + 2,
		});
	});

	it("translates the board a rejoining player receives, with the Master Rule read from the flags", () => {
		const emptyZones = (writer: IgnisWriter, zones: number): IgnisWriter => {
			for (let i = 0; i < zones; i++) writer.u8(0);

			return writer;
		};
		const writer = new IgnisWriter().u8(162).u32(0xd0700);
		// First player: one monster with two materials in zone 0, nothing else on the field.
		writer.u32(8000).u8(1).u8(0x1).u32(2);
		emptyZones(writer, 6);
		emptyZones(writer, 8).u32(34).u32(5).u32(1).u32(0).u32(15).u32(0);
		writer.u32(6300);
		emptyZones(writer, 7);
		emptyZones(writer, 8).u32(35).u32(4).u32(0).u32(0).u32(0).u32(0);
		writer
			.u32(1)
			.u32(BORA)
			.location(0, MZONE, 0, 0x1)
			.u8(0)
			.u8(MZONE)
			.u32(0)
			.u64(BORA * CARD_DESC + 1);

		const message = translate(writer, YGOProMsgReloadField);

		expect(message.duelRule).toBe(1);
		expect(message.players[0]).toMatchObject({
			lp: 8000,
			deckCount: 34,
			handCount: 5,
			extraCount: 15,
		});
		expect(message.players[0].mzone[0]).toMatchObject({ occupied: 1, position: 0x1, xyzCount: 2 });
		expect(message.players[1]).toMatchObject({ lp: 6300, deckCount: 35, handCount: 4 });
		expect(message.chains[0]).toMatchObject({
			code: BORA,
			chainCardLocation: MZONE,
			triggerLocation: MZONE,
			desc: BORA * 16 + 1,
		});
	});

	it("keeps only the player of MSG_SWAP_GRAVE_DECK", () => {
		const writer = new IgnisWriter().u8(35).u8(1).u32(40).u8(0xff);

		expect(translate(writer, YGOProMsgSwapGraveDeck).player).toBe(1);
	});

	it("drops bookkeeping messages without calling them unsupported", () => {
		expect(translateIgnisGameMsg(Uint8Array.from([80, 1, 0, 0, 0]), CONTEXT)).toEqual({
			kind: "ignored",
			messageType: 80,
		});
	});
});
