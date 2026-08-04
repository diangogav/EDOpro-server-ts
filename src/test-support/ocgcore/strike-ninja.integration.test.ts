/**
 * Strike Ninja pre-errata copy 910003013 (alias 41006930) — Edison 2010.
 *
 * SOURCE (edisonformat.com/rulings/relevant-errata): the banish effect is "Once
 * per turn" but has NO 'once per name' — "multiple copies of Strike Ninja can
 * EACH use their effects in the same turn". The modern print keys the limit to
 * the name (base: SetCountLimit(1,41006930)); the 910 drops it to a per-instance
 * soft once-per-turn (SetCountLimit(1)).
 *
 * Delta observable: put TWO Strike Ninjas on the field and 4 DARK monsters in the
 * GY (Card Destruction dumps a hand of them). Activate Ninja #1's banish effect
 * (banishes 2 DARK + itself). Is Ninja #2's effect still activatable this turn?
 *   - 910003013 (pre-errata) → YES (per-instance count).
 *   - 41006930  (official)   → NO  (name-keyed count consumed by #1).
 */
import {
	IdleCmdType,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectSum,
	YGOProMsgSelectYesNo,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

const NINJA_PRE = 910003013;
const NINJA_OFF = 41006930;
const DARK_A = 7359741; // DARK Lv4 vanilla (GY fodder)
const DARK_B = 732302; // DARK Lv4 vanilla (GY fodder)
const CARD_DEST = 72892473; // Card Destruction — dumps the hand of DARK into the GY

async function idle(duel: HeadlessDuel): Promise<YGOProMsgSelectIdleCmd> {
	return (await duel.advanceUntil(YGOProMsgSelectIdleCmd)).targetMessage;
}
function autoResponder(msg: YGOProMsgBase): Uint8Array | undefined {
	if (msg instanceof YGOProMsgSelectCard || msg instanceof YGOProMsgSelectSum) {
		const n = Math.max(1, msg.min);
		return msg.prepareResponse(
			msg.cards.slice(0, n).map((c) => ({
				code: c.code,
				controller: c.controller,
				location: c.location,
				sequence: c.sequence,
			})),
		);
	}
	if (msg instanceof YGOProMsgSelectChain) return msg.defaultResponse();
	if (msg instanceof YGOProMsgSelectEffectYn) return msg.prepareResponse(true);
	if (msg instanceof YGOProMsgSelectYesNo) return msg.prepareResponse(true);
	return undefined;
}
async function normalSummon(
	duel: HeadlessDuel,
	m: YGOProMsgSelectIdleCmd,
	code: number,
): Promise<void> {
	const c = m.summonableCards.find((x) => x.code === code);
	if (!c) throw new Error(`${code} not summonable (have ${m.summonableCards.map((s) => s.code)})`);
	duel.setResponse(
		m.prepareResponse(IdleCmdType.SUMMON, {
			code: c.code,
			controller: c.controller,
			location: c.location,
			sequence: c.sequence,
		}),
	);
}
function activate(duel: HeadlessDuel, m: YGOProMsgSelectIdleCmd, code: number): void {
	const c = m.activatableCards.find((x) => x.code === code);
	if (!c)
		throw new Error(`${code} not activatable (have ${m.activatableCards.map((a) => a.code)})`);
	duel.setResponse(
		m.prepareResponse(IdleCmdType.ACTIVATE, {
			code: c.code,
			controller: c.controller,
			location: c.location,
			sequence: c.sequence,
		}),
	);
}

/** Two Strike Ninjas on field + 4 DARK in GY; activate #1, report whether #2's
 * effect is still activatable this turn. */
async function secondNinjaActivatable(ninja: number): Promise<boolean> {
	const p0 = buildDeck([ninja, ninja, DARK_A, DARK_A, DARK_B, DARK_B, CARD_DEST]);
	const duel = await HeadlessDuel.create({
		decks: [{ main: p0 }, { main: buildDeck([DARK_A]) }],
		duelRule: 1,
		seed: FIXED_SEED,
		autoResponder,
	});
	try {
		// T1 P0: Normal Summon Ninja #1.
		await normalSummon(duel, await idle(duel), ninja);
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T2 P1: pass.
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T3 P0: Normal Summon Ninja #2.
		await normalSummon(duel, await idle(duel), ninja);
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T4 P1: pass.
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T5 P0: Card Destruction dumps the 4 DARK into the GY.
		let m = await idle(duel);
		activate(duel, m, CARD_DEST);
		m = await idle(duel);
		// Activate Ninja #1's banish effect (banishes 2 DARK + itself).
		activate(duel, m, ninja);
		m = await idle(duel);
		// Is Ninja #2 still activatable this turn?
		const canSecond = m.activatableCards.some((c) => c.code === ninja);
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
		return canSecond;
	} finally {
		await duel.cleanup();
	}
}

describe("Strike Ninja — 2010 effect has no 'once per name'", () => {
	it("pre-errata (910003013): a 2nd Strike Ninja CAN use its effect the same turn", async () => {
		expect(await secondNinjaActivatable(NINJA_PRE)).toBe(true);
	}, 120000);

	it("baseline (official 41006930): the 2nd Strike Ninja is blocked (once per name)", async () => {
		expect(await secondNinjaActivatable(NINJA_OFF)).toBe(false);
	}, 120000);
});
