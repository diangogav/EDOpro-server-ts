/**
 * Mark of the Rose pre-errata copy 910003015 (alias 45247637) — Edison 2010.
 *
 * SOURCE (edisonformat.com/rulings/relevant-errata): the two control shifts are
 * "[Trigger] effects, both start a Chain", and "if your opponent plays Cold Wave
 * on their turn, during your Standby Phase the 2nd [Trigger] won't activate" —
 * i.e. the Standby control-REGAIN is a chain-starting Spell effect that Cold Wave
 * (EFFECT_CANNOT_ACTIVATE on Spell/Trap effects) can block.
 *
 * The modern base script makes the Standby regain a PASSIVE flag auto-reset,
 * which Cold Wave cannot stop; the 910 makes it a chain-starting Standby Trigger.
 *
 * Scenario: P0 equips Mark of the Rose onto P1's monster (takes control); at P0's
 * End Phase control returns to P1; then on P0's next turn's Standby the regain
 * fires (or is blocked). We measure P0's monster count after that Standby.
 *   - (910, no Cold Wave)  → P0 regains control (MZONE 1).
 *   - (910, Cold Wave)     → BLOCKED, P1 keeps it (MZONE 0). ← the 2010 delta.
 *   - (official, Cold Wave)→ passive regain ignores Cold Wave (MZONE 1). ← the bug.
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

const MOTR_PRE = 910003015;
const MOTR_OFF = 45247637;
const PLANT = 14181608; // Plant vanilla (banished from GY as MotR's cost)
const TARGET = 2863439; // P1's monster (the control target)
const COLD_WAVE = 60682203;
const DARK_HOLE = 53129443;

const LOCATION_MZONE = 0x04;

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
	if (msg instanceof YGOProMsgSelectChain) {
		// A forced Trigger (MotR's control shifts) must be activated, not declined.
		const forced = msg.chains.find((c) => c.forced);
		if (forced)
			return msg.prepareResponse({
				code: forced.code,
				controller: forced.controller,
				location: forced.location,
				sequence: forced.sequence,
				desc: forced.desc,
			});
		return msg.defaultResponse();
	}
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

/** Returns P0's MZONE count after P0's second turn's Standby (1 = P0 controls the
 * target = regain happened; 0 = P1 still controls it = regain blocked). */
async function p0MonstersAfterStandby(motr: number, withColdWave: boolean): Promise<number> {
	const p1 = withColdWave ? [TARGET, COLD_WAVE] : [TARGET];
	const duel = await HeadlessDuel.create({
		decks: [{ main: buildDeck([PLANT, DARK_HOLE, motr]) }, { main: buildDeck(p1) }],
		duelRule: 1,
		seed: FIXED_SEED,
		autoResponder,
	});
	try {
		// T1 P0: Normal Summon Plant, Dark Hole it into the GY (cost fodder).
		await normalSummon(duel, await idle(duel), PLANT);
		activate(duel, await idle(duel), DARK_HOLE);
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T2 P1: Normal Summon the target monster.
		await normalSummon(duel, await idle(duel), TARGET);
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T3 P0: equip Mark of the Rose onto P1's monster (banish Plant), take control.
		let m = await idle(duel);
		activate(duel, m, motr); // cost (banish Plant) + target (P1's monster) via autoResponder
		m = await idle(duel);
		// P0 now controls the target; end the turn → End-Phase Trigger gives it back.
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
		// T4 P1: (optionally) activate Cold Wave first thing in Main Phase, then pass.
		m = await idle(duel);
		if (withColdWave) {
			activate(duel, m, COLD_WAVE);
			m = await idle(duel);
		}
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
		// T5 P0: the Standby Trigger fires (or is blocked by Cold Wave). Read control.
		const after = await idle(duel);
		const mz = duel.queryLocationCount(0, LOCATION_MZONE);
		duel.setResponse(after.prepareResponse(IdleCmdType.TO_EP));
		return mz;
	} finally {
		await duel.cleanup();
	}
}

describe("Mark of the Rose — 2010 control regain is a chain-starting Trigger (Cold-Wave-blockable)", () => {
	it("pre-errata (910003015), no Cold Wave: P0 regains control at its Standby", async () => {
		expect(await p0MonstersAfterStandby(MOTR_PRE, false)).toBe(1);
	}, 120000);

	it("pre-errata (910003015), Cold Wave: the Standby regain is BLOCKED — P1 keeps the monster", async () => {
		expect(await p0MonstersAfterStandby(MOTR_PRE, true)).toBe(0);
	}, 120000);

	it("baseline (official 45247637), Cold Wave: passive regain ignores Cold Wave — P0 regains", async () => {
		expect(await p0MonstersAfterStandby(MOTR_OFF, true)).toBe(1);
	}, 120000);
});
