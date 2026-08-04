/**
 * My Body as a Shield pre-errata copy 910003014 (alias 69279219) — Edison 2010.
 *
 * SOURCE (edisonformat.com/rulings/relevant-errata): "Cannot be activated in the
 * Damage Step." The modern print added Damage-Step legality; the base script
 * marks the effect EFFECT_FLAG_DAMAGE_STEP+EFFECT_FLAG_DAMAGE_CAL. The 910 drops
 * that property.
 *
 * NOTE on coverage: the Damage-Step delta itself is NOT behaviorally testable in
 * the Edison pool — there is NO card that destroys a monster via effect during
 * the Damage Step to trigger My Body there (verified by a repo-wide grep for
 * EFFECT_FLAG_DAMAGE_STEP + destroy). The delta is source-verified and is a
 * one-line property removal. This test is the REGRESSION guard: it confirms the
 * 910 script loads and its normal (non-Damage-Step) negate still works exactly
 * like the official — i.e. dropping the flag did not break the Main-Phase use.
 *
 * Scenario: P0 Sets My Body and has a monster; on P0's next-turn opponent, P1
 * activates Dark Hole (would destroy P0's monster). My Body negates it.
 *   - both codes → the monster survives (Main-Phase negate unaffected by the delta).
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

const MYBODY_PRE = 910003014;
const MYBODY_OFF = 69279219;
const VANILLA = 2863439; // LIGHT Lv4 vanilla — P0's monster
const DARK_HOLE = 53129443; // opponent's destruction spell

const LOCATION_MZONE = 0x04;

async function idle(duel: HeadlessDuel): Promise<YGOProMsgSelectIdleCmd> {
	return (await duel.advanceUntil(YGOProMsgSelectIdleCmd)).targetMessage;
}
function mkResponder(mybody: number) {
	return (msg: YGOProMsgBase): Uint8Array | undefined => {
		if (msg instanceof YGOProMsgSelectChain) {
			const entry = msg.chains.find((c) => c.code === mybody);
			if (entry)
				return msg.prepareResponse({
					code: entry.code,
					controller: entry.controller,
					location: entry.location,
					sequence: entry.sequence,
					desc: entry.desc,
				});
			return msg.defaultResponse();
		}
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
		if (msg instanceof YGOProMsgSelectEffectYn) return msg.prepareResponse(true);
		if (msg instanceof YGOProMsgSelectYesNo) return msg.prepareResponse(true);
		return undefined;
	};
}
async function normalSummon(
	duel: HeadlessDuel,
	m: YGOProMsgSelectIdleCmd,
	code: number,
): Promise<void> {
	const c = m.summonableCards.find((x) => x.code === code);
	if (!c) throw new Error(`${code} not summonable`);
	duel.setResponse(
		m.prepareResponse(IdleCmdType.SUMMON, {
			code: c.code,
			controller: c.controller,
			location: c.location,
			sequence: c.sequence,
		}),
	);
}

/** P0 sets My Body + has a monster; P1 activates Dark Hole; My Body negates it.
 * Returns P0's MZONE count afterward (1 = monster survived / negate worked). */
async function myBodyNegatesDarkHole(mybody: number): Promise<number> {
	const duel = await HeadlessDuel.create({
		decks: [{ main: buildDeck([VANILLA, mybody]) }, { main: buildDeck([DARK_HOLE]) }],
		duelRule: 1,
		seed: FIXED_SEED,
		autoResponder: mkResponder(mybody),
	});
	try {
		// T1 P0: Normal Summon the vanilla, Set My Body face-down, pass.
		let m = await idle(duel);
		await normalSummon(duel, m, VANILLA);
		m = await idle(duel);
		const s = m.ssetableCards.find((c) => c.code === mybody);
		if (!s) throw new Error(`${mybody} not Set-able (have ${m.ssetableCards.map((x) => x.code)})`);
		duel.setResponse(
			m.prepareResponse(IdleCmdType.SSET, {
				code: s.code,
				controller: s.controller,
				location: s.location,
				sequence: s.sequence,
			}),
		);
		m = await idle(duel);
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
		// T2 P1: activate Dark Hole — My Body (P0) responds via the auto-responder.
		m = await idle(duel);
		const dh = m.activatableCards.find((c) => c.code === DARK_HOLE);
		if (!dh)
			throw new Error(
				`Dark Hole not activatable for P1 (have ${m.activatableCards.map((a) => a.code)})`,
			);
		duel.setResponse(
			m.prepareResponse(IdleCmdType.ACTIVATE, {
				code: dh.code,
				controller: dh.controller,
				location: dh.location,
				sequence: dh.sequence,
			}),
		);
		// Drive to the next idle; the My Body chain resolves along the way.
		const after = await idle(duel);
		const mz = duel.queryLocationCount(0, LOCATION_MZONE);
		duel.setResponse(after.prepareResponse(IdleCmdType.TO_EP));
		return mz;
	} finally {
		await duel.cleanup();
	}
}

describe("My Body as a Shield — 910 loads + normal negate unaffected by the Damage-Step delta", () => {
	it("pre-errata (910003014): negates the opponent's Dark Hole — the monster survives", async () => {
		expect(await myBodyNegatesDarkHole(MYBODY_PRE)).toBe(1);
	}, 120000);

	it("baseline (official 69279219): also negates it — same Main-Phase behavior", async () => {
		expect(await myBodyNegatesDarkHole(MYBODY_OFF)).toBe(1);
	}, 120000);
});
