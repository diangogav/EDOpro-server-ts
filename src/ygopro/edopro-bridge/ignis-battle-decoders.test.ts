import { IgnisWriter } from "./IgnisWriter.testing";
import {
	BattleCmdType,
	IndexResponse,
	YGOProMsgAttack,
	YGOProMsgBattle,
	YGOProMsgDamage,
	YGOProMsgDamageStepStart,
	YGOProMsgLpUpdate,
	YGOProMsgPayLpCost,
	YGOProMsgPosChange,
	YGOProMsgRecover,
	YGOProMsgSelectBattleCmd,
	YGOProMsgWin,
} from "ygopro-msg-encode";
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

describe("battle and life point messages", () => {
	it("translates MSG_SELECT_BATTLECMD and builds the attack response from it", () => {
		const payload = new IgnisWriter()
			.u8(10)
			.u8(1)
			.u32(1)
			.u32(POT_OF_GREED)
			.u8(1)
			.u8(LOCATION_HAND)
			.u32(0)
			.u64(POT_OF_GREED * 0x10_0000)
			.u8(0)
			.u32(2)
			.u32(BLUE_EYES)
			.u8(1)
			.u8(LOCATION_MZONE)
			.u8(2)
			.u8(1)
			.u32(BLUE_EYES)
			.u8(1)
			.u8(LOCATION_MZONE)
			.u8(3)
			.u8(0)
			.u8(1)
			.u8(1)
			.build();

		const message = translate(payload, YGOProMsgSelectBattleCmd);

		expect(message.activatableCards[0]).toMatchObject({
			code: POT_OF_GREED,
			desc: POT_OF_GREED * 16,
		});
		expect(message.attackableCards).toEqual([
			expect.objectContaining({ code: BLUE_EYES, sequence: 2, directAttack: 1 }),
			expect.objectContaining({ code: BLUE_EYES, sequence: 3, directAttack: 0 }),
		]);
		expect([message.canM2, message.canEp]).toEqual([1, 1]);
		expect(Array.from(message.prepareResponse(BattleCmdType.ATTACK, IndexResponse(1)))).toEqual([
			1, 0, 1, 0,
		]);
	});

	it("translates MSG_ATTACK, leaving the defender zeroed on a direct attack", () => {
		const payload = new IgnisWriter()
			.u8(110)
			.u8(1)
			.u8(LOCATION_MZONE)
			.u32(2)
			.u32(0x1)
			.u8(0)
			.u8(0)
			.u32(0)
			.u32(0)
			.build();

		expect(translate(payload, YGOProMsgAttack)).toMatchObject({
			attacker: { controller: 1, location: LOCATION_MZONE, sequence: 2, position: 0x1 },
			defender: { controller: 0, location: 0, sequence: 0 },
		});
	});

	it("translates MSG_BATTLE with both sides and their battle-destroyed flags", () => {
		const payload = new IgnisWriter()
			.u8(111)
			.u8(1)
			.u8(LOCATION_MZONE)
			.u32(2)
			.u32(0x1)
			.u32(3000)
			.u32(2500)
			.u8(0)
			.u8(0)
			.u8(LOCATION_MZONE)
			.u32(1)
			.u32(0x1)
			.u32(1700)
			.u32(1000)
			.u8(1)
			.build();

		expect(translate(payload, YGOProMsgBattle)).toMatchObject({
			attacker: { location: { controller: 1, sequence: 2 }, atk: 3000, def: 2500 },
			attackerBattleState: 0,
			defender: { location: { controller: 0, sequence: 1 }, atk: 1700, def: 1000 },
			defenderBattleState: 1,
		});
		translate(Uint8Array.from([113]), YGOProMsgDamageStepStart);
	});

	it("translates the life point messages", () => {
		const amount = (type: number): Uint8Array => new IgnisWriter().u8(type).u8(1).u32(1700).build();

		expect(translate(amount(91), YGOProMsgDamage)).toMatchObject({ player: 1, value: 1700 });
		expect(translate(amount(92), YGOProMsgRecover)).toMatchObject({ player: 1, value: 1700 });
		expect(translate(amount(94), YGOProMsgLpUpdate)).toMatchObject({ player: 1, lp: 1700 });
		expect(translate(amount(100), YGOProMsgPayLpCost)).toMatchObject({ player: 1, cost: 1700 });
	});

	it("translates MSG_POS_CHANGE and MSG_WIN", () => {
		const posChange = new IgnisWriter()
			.u8(53)
			.u32(BLUE_EYES)
			.u8(0)
			.u8(LOCATION_MZONE)
			.u8(2)
			.u8(0x1)
			.u8(0x4)
			.build();

		expect(translate(posChange, YGOProMsgPosChange)).toMatchObject({
			code: BLUE_EYES,
			card: { controller: 0, location: LOCATION_MZONE, sequence: 2 },
			previousPosition: 0x1,
			currentPosition: 0x4,
		});
		expect(translate(Uint8Array.from([5, 1, 0x1]), YGOProMsgWin)).toMatchObject({
			player: 1,
			type: 1,
		});
	});
});
