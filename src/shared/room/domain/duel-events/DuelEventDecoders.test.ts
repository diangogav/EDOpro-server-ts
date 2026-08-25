/**
 * One decoder per DuelEventKind, shared by both pipelines.
 *
 * The wire layout under test holds for BOTH producers:
 *  - classic core: payloads below are generated with ygopro-msg-encode, the same
 *    encoder this server ships in production for the ygopro pipeline.
 *  - EDOPro core: emission sites in edo9300/ygopro-core write the identical
 *    layout — operations.cpp:603 (MSG_DAMAGE), :674 (MSG_RECOVER),
 *    :749 (MSG_PAY_LPCOST): write<uint8_t>(playerid); write<uint32_t>(amount);
 *    processor.cpp:3334 (MSG_NEW_TURN): write<uint8_t>(turn_player).
 */
import {
	YGOProMsgDamage,
	YGOProMsgNewTurn,
	YGOProMsgPayLpCost,
	YGOProMsgRecover,
} from "ygopro-msg-encode";

import {
	buildDamageDealt,
	buildLifeRecovered,
	buildLpCostPaid,
	buildTurnStarted,
	decodeDamageDealt,
	decodeLifeRecovered,
	decodeLpCostPaid,
	decodeTurnStarted,
	DuelEventContext,
} from "./DuelEventDecoders";
import { DUEL_EVENT_KINDS } from "./DuelEvents";

// EDOPro rooms resolve team as firstToPlay ^ player; ygopro rooms pass their
// own resolveTeam. The decoders must stay pipeline-agnostic: the mapping is
// injected, never assumed.
const xorCtx = (firstToPlay: number): DuelEventContext => ({
	roomId: 42,
	turn: 3,
	resolveTeam: (player: number) => firstToPlay ^ player,
});

const wire = {
	damage: (player: number, amount: number): Buffer =>
		Buffer.from(new YGOProMsgDamage().fromPartial({ player, value: amount }).toPayload()),
	recover: (player: number, amount: number): Buffer =>
		Buffer.from(new YGOProMsgRecover().fromPartial({ player, value: amount }).toPayload()),
	lpCost: (player: number, cost: number): Buffer =>
		Buffer.from(new YGOProMsgPayLpCost().fromPartial({ player, cost }).toPayload()),
	newTurn: (player: number): Buffer =>
		Buffer.from(new YGOProMsgNewTurn().fromPartial({ player }).toPayload()),
};

describe("DuelEvents vocabulary", () => {
	it("names exactly the four duel-event kinds", () => {
		expect(DUEL_EVENT_KINDS).toEqual([
			"duel.damage",
			"duel.recover",
			"duel.lp-cost",
			"duel.turn-start",
		]);
	});
});

describe("decodeDamageDealt", () => {
	it("decodes a classic-encoded MSG_DAMAGE payload", () => {
		// [0x5b, 0x01, e8 03 00 00] — player 1 takes 1000
		const event = decodeDamageDealt(wire.damage(1, 1000), xorCtx(0));

		expect(event).toEqual({ roomId: 42, team: 1, amount: 1000, turn: 3 });
	});

	it("applies the injected team mapping (firstToPlay = 1 flips the team)", () => {
		const event = decodeDamageDealt(wire.damage(1, 1000), xorCtx(1));

		expect(event.team).toBe(0);
	});

	it("rejects a buffer whose type byte is not MSG_DAMAGE", () => {
		expect(() => decodeDamageDealt(wire.recover(0, 500), xorCtx(0))).toThrow(/91/);
	});
});

describe("decodeLifeRecovered", () => {
	it("decodes a classic-encoded MSG_RECOVER payload", () => {
		const event = decodeLifeRecovered(wire.recover(0, 500), xorCtx(0));

		expect(event).toEqual({ roomId: 42, team: 0, amount: 500, turn: 3 });
	});

	it("rejects a mismatched type byte", () => {
		expect(() => decodeLifeRecovered(wire.damage(0, 500), xorCtx(0))).toThrow(/92/);
	});
});

describe("decodeLpCostPaid", () => {
	it("decodes a classic-encoded MSG_PAY_LPCOST payload", () => {
		const event = decodeLpCostPaid(wire.lpCost(1, 800), xorCtx(0));

		expect(event).toEqual({ roomId: 42, team: 1, amount: 800, turn: 3 });
	});

	it("rejects a mismatched type byte", () => {
		expect(() => decodeLpCostPaid(wire.newTurn(0), xorCtx(0))).toThrow(/100/);
	});
});

describe("decodeTurnStarted", () => {
	it("decodes a classic-encoded MSG_NEW_TURN payload, keeping the raw turn player", () => {
		// Both cores emit exactly one NEW_TURN per turn; player is the core turn
		// player (0/1), never a tag partner code. Kept raw: turn-player team
		// resolution differs per pipeline and is not this event's business.
		const event = decodeTurnStarted(wire.newTurn(1), xorCtx(0));

		expect(event).toEqual({ roomId: 42, player: 1, turn: 3 });
	});

	it("rejects a mismatched type byte", () => {
		expect(() => decodeTurnStarted(wire.damage(0, 100), xorCtx(0))).toThrow(/40/);
	});
});

describe("cross-pipeline equivalence (build* from typed fields === decode* from wire)", () => {
	// The ygopro pipeline receives already-decoded messages (msg.player,
	// msg.value); it calls build* with those fields. The EDOPro pipeline calls
	// decode* with the raw buffer. Same logical event MUST produce the same
	// object — this is what makes consumer data comparable across room types.
	const ctx = xorCtx(0);

	it("damage", () => {
		expect(buildDamageDealt({ player: 1, amount: 1000 }, ctx)).toEqual(
			decodeDamageDealt(wire.damage(1, 1000), ctx),
		);
	});

	it("recover", () => {
		expect(buildLifeRecovered({ player: 0, amount: 500 }, ctx)).toEqual(
			decodeLifeRecovered(wire.recover(0, 500), ctx),
		);
	});

	it("lp cost", () => {
		expect(buildLpCostPaid({ player: 1, amount: 800 }, ctx)).toEqual(
			decodeLpCostPaid(wire.lpCost(1, 800), ctx),
		);
	});

	it("turn start", () => {
		expect(buildTurnStarted({ player: 1 }, ctx)).toEqual(decodeTurnStarted(wire.newTurn(1), ctx));
	});
});
