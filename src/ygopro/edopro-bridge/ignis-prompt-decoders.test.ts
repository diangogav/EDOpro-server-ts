import {
	YGOProMsgAnnounceCard,
	YGOProMsgAnnounceRace,
	YGOProMsgSelectCard,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectOption,
	YGOProMsgSelectPosition,
	YGOProMsgSelectSum,
	YGOProMsgSelectTribute,
	YGOProMsgSelectUnselectCard,
	YGOProMsgSortCard,
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

describe("Ignis prompts", () => {
	it("translates MSG_SELECT_POSITION, the prompt after choosing a Special Summon zone", () => {
		const message = translate(
			new IgnisWriter().u8(19).u8(0).u32(BORA).u8(0x5),
			YGOProMsgSelectPosition,
		);

		expect(message).toMatchObject({ player: 0, code: BORA, positions: 0x5 });
		expect(Array.from(message.prepareResponse(0x1))).toEqual([1, 0, 0, 0]);
	});

	it("translates MSG_SELECT_EFFECTYN with the card and the effect text", () => {
		const writer = new IgnisWriter()
			.u8(12)
			.u8(1)
			.u32(BORA)
			.location(1, MZONE, 2, 0x1)
			.u64(BORA * CARD_DESC + 1);

		expect(translate(writer, YGOProMsgSelectEffectYn)).toMatchObject({
			player: 1,
			code: BORA,
			controller: 1,
			location: MZONE,
			sequence: 2,
			desc: BORA * 16 + 1,
		});
	});

	it("translates every text of MSG_SELECT_OPTION", () => {
		const writer = new IgnisWriter()
			.u8(14)
			.u8(0)
			.u8(2)
			.u64(BORA * CARD_DESC)
			.u64(1150);

		expect(translate(writer, YGOProMsgSelectOption).options).toEqual([BORA * 16, 1150]);
	});

	it("translates MSG_SELECT_CARD with 32-bit bounds and full locations", () => {
		const writer = new IgnisWriter()
			.u8(15)
			.u8(0)
			.u8(1)
			.u32(1)
			.u32(2)
			.u32(2)
			.u32(BORA)
			.location(0, GRAVE, 3, 0x1)
			.u32(SHURA)
			.location(0, MZONE | 0x80, 1, 2);

		const message = translate(writer, YGOProMsgSelectCard);

		expect(message).toMatchObject({ cancelable: 1, min: 1, max: 2, count: 2 });
		expect(message.cards[0]).toMatchObject({ code: BORA, location: GRAVE, sequence: 3 });
		expect(message.cards[1]).toMatchObject({
			code: SHURA,
			location: MZONE | 0x80,
			sequence: 1,
			subsequence: 2,
		});
	});

	it("translates MSG_SELECT_TRIBUTE with the release weight of each card", () => {
		const writer = new IgnisWriter()
			.u8(20)
			.u8(0)
			.u8(0)
			.u32(1)
			.u32(1)
			.u32(1)
			.u32(BORA)
			.u8(0)
			.u8(MZONE)
			.u32(2)
			.u8(1);

		expect(translate(writer, YGOProMsgSelectTribute).cards[0]).toMatchObject({
			code: BORA,
			sequence: 2,
			releaseParam: 1,
		});
	});

	it("translates MSG_SELECT_SUM with its forced and optional cards", () => {
		const writer = new IgnisWriter()
			.u8(23)
			.u8(0)
			.u8(0)
			.u32(8)
			.u32(1)
			.u32(2)
			.u32(1)
			.u32(SHURA)
			.location(0, HAND, 0, 0xa)
			.u32(4)
			.u32(1)
			.u32(BORA)
			.location(0, MZONE, 2, 0x1)
			.u32(4);

		const message = translate(writer, YGOProMsgSelectSum);

		expect(message).toMatchObject({ player: 0, mode: 0, sumVal: 8, min: 1, max: 2 });
		expect(message.mustSelectCards).toEqual([expect.objectContaining({ code: SHURA, opParam: 4 })]);
		expect(message.cards).toEqual([
			expect.objectContaining({ code: BORA, sequence: 2, opParam: 4 }),
		]);
	});

	it("translates MSG_SELECT_UNSELECT_CARD with both lists", () => {
		const writer = new IgnisWriter()
			.u8(26)
			.u8(0)
			.u8(1)
			.u8(0)
			.u32(1)
			.u32(3)
			.u32(1)
			.u32(BORA)
			.location(0, HAND, 0, 0xa)
			.u32(1)
			.u32(SHURA)
			.location(0, HAND, 1, 0xa);

		const message = translate(writer, YGOProMsgSelectUnselectCard);

		expect(message).toMatchObject({
			finishable: 1,
			cancelable: 0,
			selectableCount: 1,
			unselectableCount: 1,
		});
		expect(message.unselectableCards[0]).toMatchObject({ code: SHURA, sequence: 1 });
	});

	it("reads chain sorting as the same prompt as card sorting", () => {
		const body = (type: number): IgnisWriter =>
			new IgnisWriter().u8(type).u8(0).u32(1).u32(BORA).u8(0).u32(MZONE).u32(2);

		expect(translate(body(25), YGOProMsgSortCard).cards[0]).toMatchObject({
			code: BORA,
			location: MZONE,
			sequence: 2,
		});
		expect(translate(body(21), YGOProMsgSortCard).count).toBe(1);
	});

	it("moves an announce-card operator from the high word to the YGOPro opcode", () => {
		const TYPE_MONSTER = 0x1;
		const OPCODE_ISTYPE = 0x4000_0102;
		const writer = new IgnisWriter()
			.u8(142)
			.u8(0)
			.u8(2)
			.u32(TYPE_MONSTER)
			.u32(0)
			.u32(0)
			.u32(OPCODE_ISTYPE);

		expect(translate(writer, YGOProMsgAnnounceCard).opcodes).toEqual([TYPE_MONSTER, OPCODE_ISTYPE]);
	});

	it("translates the 64-bit race mask of MSG_ANNOUNCE_RACE", () => {
		const writer = new IgnisWriter().u8(140).u8(0).u8(1).u64(0x1_0000_0001);

		expect(translate(writer, YGOProMsgAnnounceRace)).toMatchObject({
			count: 1,
			availableRaces: 0x1_0000_0001,
		});
	});
});
