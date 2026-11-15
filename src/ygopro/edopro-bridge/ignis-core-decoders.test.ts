import { IgnisWriter } from "./IgnisWriter.testing";
import {
	YGOProMsgDraw,
	YGOProMsgHint,
	YGOProMsgMove,
	YGOProMsgNewPhase,
	YGOProMsgNewTurn,
	YGOProMsgSelectChain,
	YGOProMsgSelectDisField,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectPlace,
	YGOProMsgStart,
	YGOProMsgSummoned,
	YGOProMsgSummoning,
	YGOProMsgUpdateCard,
	YGOProMsgUpdateData,
} from "ygopro-msg-encode";
import { EMPTY_SLOT, END, QUERY_CODE, QUERY_POSITION, field, u32 } from "./ignisQuery.testing";
import { translateIgnisGameMsg } from "./translateIgnisGameMsg";

const CONTEXT = { duelRule: 5 };
const LOCATION_HAND = 0x02;
const LOCATION_MZONE = 0x04;
const BLUE_EYES = 89631139;
const POT_OF_GREED = 55144522;

function translate<T>(payload: Uint8Array, type: new () => T): T {
	const result = translateIgnisGameMsg(payload, CONTEXT);
	if (result.kind !== "message") throw new Error(`unsupported message ${result.messageType}`);
	expect(result.message).toBeInstanceOf(type);
	return result.message as T;
}

describe("core game messages", () => {
	it("reports a message type it has no decoder for", () => {
		expect(translateIgnisGameMsg(Uint8Array.from([250]), CONTEXT)).toEqual({
			kind: "unsupported",
			messageType: 250,
		});
	});

	it("translates MSG_START and supplies the duel rule from the room", () => {
		const payload = new IgnisWriter()
			.u8(4)
			.u8(1)
			.u32(8000)
			.u32(8000)
			.u16(40)
			.u16(15)
			.u16(42)
			.u16(3)
			.build();

		const message = translate(payload, YGOProMsgStart);

		expect(message.playerType).toBe(1);
		expect(message.duelRule).toBe(5);
		expect([message.startLp0, message.startLp1]).toEqual([8000, 8000]);
		expect(message.player0).toMatchObject({ deckCount: 40, extraCount: 15 });
		expect(message.player1).toMatchObject({ deckCount: 42, extraCount: 3 });
	});

	it("translates MSG_NEW_TURN and the 16-bit MSG_NEW_PHASE", () => {
		expect(translate(new IgnisWriter().u8(40).u8(1).build(), YGOProMsgNewTurn).player).toBe(1);
		expect(translate(new IgnisWriter().u8(41).u16(0x200).build(), YGOProMsgNewPhase).phase).toBe(
			0x200,
		);
	});

	it("translates MSG_DRAW, flagging only face-up cards as known", () => {
		const payload = new IgnisWriter()
			.u8(90)
			.u8(0)
			.u32(2)
			.u32(BLUE_EYES)
			.u32(0x1)
			.u32(0)
			.u32(0xa)
			.build();

		const message = translate(payload, YGOProMsgDraw);

		expect(message.count).toBe(2);
		expect(message.cards).toEqual([(BLUE_EYES | 0x8000_0000) >>> 0, 0]);
	});

	it("translates a select-message hint and leaves a code hint untouched", () => {
		const select = new IgnisWriter()
			.u8(2)
			.u8(3)
			.u8(0)
			.u64(BLUE_EYES * 0x10_0000 + 1)
			.build();
		const code = new IgnisWriter().u8(2).u8(8).u8(1).u64(BLUE_EYES).build();

		expect(translate(select, YGOProMsgHint).desc).toBe(BLUE_EYES * 16 + 1);
		expect(translate(code, YGOProMsgHint)).toMatchObject({ type: 8, player: 1, desc: BLUE_EYES });
	});

	it("translates MSG_SELECT_IDLECMD into a message the YGOPro wire round-trips", () => {
		const payload = new IgnisWriter()
			.u8(11)
			.u8(0)
			.u32(1)
			.u32(BLUE_EYES)
			.u8(0)
			.u8(LOCATION_HAND)
			.u32(2) // summon
			.u32(0) // special summon
			.u32(1)
			.u32(BLUE_EYES)
			.u8(0)
			.u8(LOCATION_MZONE)
			.u8(3) // reposition: 8-bit sequence
			.u32(0) // monster set
			.u32(1)
			.u32(POT_OF_GREED)
			.u8(0)
			.u8(LOCATION_HAND)
			.u32(4) // spell set
			.u32(1)
			.u32(POT_OF_GREED)
			.u8(0)
			.u8(LOCATION_HAND)
			.u32(4)
			.u64(POT_OF_GREED * 0x10_0000)
			.u8(0) // activate
			.u8(1)
			.u8(1)
			.u8(0)
			.build();

		const message = translate(payload, YGOProMsgSelectIdleCmd);

		expect(message.summonableCards).toEqual([
			expect.objectContaining({
				code: BLUE_EYES,
				controller: 0,
				location: LOCATION_HAND,
				sequence: 2,
			}),
		]);
		expect(message.reposableCards[0]).toMatchObject({ location: LOCATION_MZONE, sequence: 3 });
		expect(message.ssetableCards[0]).toMatchObject({ code: POT_OF_GREED, sequence: 4 });
		expect(message.activatableCards[0]).toMatchObject({
			code: POT_OF_GREED,
			desc: POT_OF_GREED * 16,
		});
		expect([message.canBp, message.canEp, message.canShuffle]).toEqual([1, 1, 0]);

		const roundTripped = new YGOProMsgSelectIdleCmd().fromPayload(message.toPayload());
		expect(roundTripped.summonableCount).toBe(1);
		expect(roundTripped.activatableCards[0]).toMatchObject({
			code: POT_OF_GREED,
			desc: POT_OF_GREED * 16,
		});
		expect(roundTripped.canEp).toBe(1);
	});

	it("translates MSG_MOVE with both 10-byte locations", () => {
		const payload = new IgnisWriter()
			.u8(50)
			.u32(BLUE_EYES)
			.u8(0)
			.u8(LOCATION_HAND)
			.u32(3)
			.u32(0xa)
			.u8(0)
			.u8(LOCATION_MZONE)
			.u32(2)
			.u32(0x1)
			.u32(0x10)
			.build();

		const message = translate(payload, YGOProMsgMove);

		expect(message).toMatchObject({
			code: BLUE_EYES,
			previous: { controller: 0, location: LOCATION_HAND, sequence: 3, position: 0xa },
			current: { controller: 0, location: LOCATION_MZONE, sequence: 2, position: 0x1 },
			reason: 0x10,
		});
	});

	it("keeps the material index of a move into an overlay stack", () => {
		const overlay = LOCATION_MZONE | 0x80;
		const payload = new IgnisWriter()
			.u8(50)
			.u32(BLUE_EYES)
			.u8(1)
			.u8(LOCATION_MZONE)
			.u32(0)
			.u32(0x1)
			.u8(1)
			.u8(overlay)
			.u32(4)
			.u32(1)
			.u32(0)
			.build();

		expect(translate(payload, YGOProMsgMove).current).toMatchObject({
			location: overlay,
			sequence: 4,
			position: 1,
		});
	});

	it("translates MSG_SUMMONING and the empty MSG_SUMMONED", () => {
		const summoning = new IgnisWriter()
			.u8(60)
			.u32(BLUE_EYES)
			.u8(1)
			.u8(LOCATION_MZONE)
			.u32(2)
			.u32(0x1)
			.build();

		expect(translate(summoning, YGOProMsgSummoning)).toMatchObject({
			code: BLUE_EYES,
			controller: 1,
			location: LOCATION_MZONE,
			sequence: 2,
			position: 0x1,
		});
		translate(Uint8Array.from([61]), YGOProMsgSummoned);
	});

	it("translates zone prompts so the YGOPro helper lists the free zones", () => {
		const allButOwnMonsterZone2 = 0xffff_fffb;
		const place = new IgnisWriter().u8(18).u8(0).u8(1).u32(allButOwnMonsterZone2).build();
		const disfield = new IgnisWriter().u8(24).u8(1).u8(2).u32(0).build();

		const message = translate(place, YGOProMsgSelectPlace);

		expect(message.getSelectablePlaces()).toEqual([
			{ player: 0, location: LOCATION_MZONE, sequence: 2 },
		]);
		expect(translate(disfield, YGOProMsgSelectDisField)).toMatchObject({
			player: 1,
			count: 2,
			flag: 0,
		});
	});

	it("translates MSG_SELECT_CHAIN, spreading the prompt-level forced flag", () => {
		const payload = new IgnisWriter()
			.u8(16)
			.u8(1)
			.u8(0x7f)
			.u8(1)
			.u32(0x100)
			.u32(0x200)
			.u32(1)
			.u32(POT_OF_GREED)
			.u8(1)
			.u8(LOCATION_HAND)
			.u32(0)
			.u32(0xa)
			.u64(POT_OF_GREED * 0x10_0000 + 1)
			.u8(2)
			.build();

		const message = translate(payload, YGOProMsgSelectChain);

		expect(message).toMatchObject({
			player: 1,
			specialCount: 0x7f,
			hint0: 0x100,
			hint1: 0x200,
			count: 1,
		});
		expect(message.chains[0]).toMatchObject({
			code: POT_OF_GREED,
			controller: 1,
			location: LOCATION_HAND,
			sequence: 0,
			desc: POT_OF_GREED * 16 + 1,
			edesc: 2,
			forced: 1,
		});
	});

	it("translates an empty MSG_SELECT_CHAIN the client can decline", () => {
		const payload = new IgnisWriter().u8(16).u8(0).u8(0).u8(0).u32(0).u32(0).u32(0).build();

		const message = translate(payload, YGOProMsgSelectChain);

		expect(message.chains).toEqual([]);
		expect(Array.from(message.prepareResponse(null))).toEqual([0xff, 0xff, 0xff, 0xff]);
	});

	it("throws on a truncated payload instead of reading zeros", () => {
		const truncated = new IgnisWriter().u8(11).u8(0).u32(1).u32(BLUE_EYES).build();

		expect(() => translateIgnisGameMsg(truncated, CONTEXT)).toThrow(RangeError);
	});
});

const BATTLE_OX = 5053103;

describe("query messages", () => {
	const card = [...field(QUERY_CODE, u32(BATTLE_OX)), ...field(QUERY_POSITION, u32(0x1)), ...END];

	it("translates MSG_UPDATE_DATA, naming the slot of every card", () => {
		const queries = [...EMPTY_SLOT, ...card, ...EMPTY_SLOT];
		const payload = Uint8Array.from([6, 1, 0x04, ...u32(queries.length), ...queries]);

		const result = translateIgnisGameMsg(payload, { duelRule: 5 });

		if (result.kind !== "message") throw new Error("unsupported");
		const message = result.message as YGOProMsgUpdateData;
		expect(message).toBeInstanceOf(YGOProMsgUpdateData);
		expect(message).toMatchObject({ player: 1, location: 0x04 });
		expect(message.cards.map((slot) => slot.empty === true)).toEqual([true, false, true]);
		expect(message.cards[1]).toMatchObject({
			code: BATTLE_OX,
			controller: 1,
			location: 0x04,
			sequence: 1,
		});
	});

	it("translates MSG_UPDATE_CARD for a single slot", () => {
		const payload = Uint8Array.from([7, 0, 0x04, 2, ...card]);

		const result = translateIgnisGameMsg(payload, { duelRule: 5 });

		if (result.kind !== "message") throw new Error("unsupported");
		const message = result.message as YGOProMsgUpdateCard;
		expect(message).toBeInstanceOf(YGOProMsgUpdateCard);
		expect(message).toMatchObject({ controller: 0, location: 0x04, sequence: 2 });
		expect(message.card).toMatchObject({ code: BATTLE_OX, position: 0x1, sequence: 2 });
	});
});
