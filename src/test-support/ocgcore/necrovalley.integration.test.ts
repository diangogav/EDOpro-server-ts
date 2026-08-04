/**
 * Necrovalley pre-errata copy 910003011 (alias 47355498) — Edison 2010.
 *
 * Verifies the 910's targeting-only GY-lock against the Edison ruling.
 *
 * SOURCE (edisonformat.com/rulings/relevant-errata — our pre-UTW target):
 *   "The first continuous effect only negates effects that TARGET; effects that
 *    don't target are UNAFFECTED (examples: Rekindling, Treeborn Frog, Red-Eyes
 *    Darkness Metal Dragon)."
 * So in Edison a NON-targeting Special Summon out of the GY must go through.
 * (This is a pre/post-UTW divergence: the modern post-LC3/PSCT Necrovalley DOES
 *  block non-targeting GY moves — yugipedia agrees REDMD is blocked — but Edison
 *  uses the pre-errata reading. The old 511002998 copy over-blocked, matching
 *  modern; 910003011 is the fix and supersedes it in the lflist.)
 *
 * How 910003011 differs from the 511/modern script: it drops the EFFECT_NECRO_VALLEY
 * stamping on GY cards (that flag is what each card's aux.NecroValleyFilter reads to
 * block non-targeting GY summons) and negates ONLY targeting effects at resolution.
 *
 *   Test A (targeting):     Monster Reborn TARGETS a GY card. Under Necrovalley
 *                           it is negated → nothing revived.
 *   Test B (non-targeting): REDMD's ignition SS a Dragon from the GY WITHOUT
 *                           targeting. Under Necrovalley it now RESOLVES → the GY
 *                           Dragon is summoned (MZONE=2), unaffected as Edison
 *                           rules require. (The old 511 gave 1 here — the bug.)
 */
import {
	IdleCmdType,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectSum,
	YGOProMsgSelectUnselectCard,
	YGOProMsgSelectYesNo,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

const REDMD = 88264978; // Red-Eyes Darkness Metal Dragon (official; base cdb + base script)
const LUSTER = 11091375; // Luster Dragon — Lv4 vanilla Dragon (GY target + banish cost)
const DARK_HOLE = 53129443; // destroy all monsters (routes Luster #1 into the GY)
const NECRO = 910003011; // Necrovalley (pre-errata 910, targeting-only GY-lock)
const REBORN = 83764718; // Monster Reborn (TARGETS a card in the GY to SS it)

const LOCATION_MZONE = 0x04;

async function idle(duel: HeadlessDuel): Promise<YGOProMsgSelectIdleCmd> {
	return (await duel.advanceUntil(YGOProMsgSelectIdleCmd)).targetMessage;
}
function findFirst(msg: YGOProMsgSelectCard | YGOProMsgSelectSum, n: number): Uint8Array {
	return msg.prepareResponse(
		msg.cards.slice(0, n).map((c) => ({
			code: c.code,
			controller: c.controller,
			location: c.location,
			sequence: c.sequence,
		})),
	);
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

/** Generic auto-responder: pick the first `min` cards on any SelectCard/SelectSum,
 * decline chains, answer yes to yes/no (REDMD offers no yes/no here). */
function autoResponder(msg: YGOProMsgBase): Uint8Array | undefined {
	if (msg instanceof YGOProMsgSelectSum) return findFirst(msg, Math.max(1, msg.min));
	if (msg instanceof YGOProMsgSelectCard) return findFirst(msg, Math.max(1, msg.min));
	if (msg instanceof YGOProMsgSelectUnselectCard) {
		// REDMD's self-SS banish cost (SelectUnselect): pick the one field Dragon,
		// or finish once nothing more is selectable.
		if (msg.selectableCards.length > 0) {
			const p = msg.selectableCards[0];
			return msg.prepareResponse({
				code: p.code,
				controller: p.controller,
				location: p.location,
				sequence: p.sequence,
			});
		}
		return msg.defaultResponse();
	}
	if (msg instanceof YGOProMsgSelectChain) return msg.defaultResponse();
	if (msg instanceof YGOProMsgSelectEffectYn) return msg.prepareResponse(true);
	if (msg instanceof YGOProMsgSelectYesNo) return msg.prepareResponse(true);
	return undefined;
}

/**
 * REDMD ignition Special Summons a Dragon from the GY (non-targeting).
 * Returns P0's MZONE count after the ignition resolves:
 *   2 → REDMD + the revived Luster (GY summon ALLOWED)
 *   1 → REDMD only (GY summon BLOCKED)
 */
async function runRedmdScenario(withNecrovalley: boolean): Promise<number> {
	const hand = withNecrovalley
		? [LUSTER, DARK_HOLE, NECRO, LUSTER, REDMD]
		: [LUSTER, DARK_HOLE, LUSTER, REDMD];
	const duel = await HeadlessDuel.create({
		decks: [{ main: buildDeck(hand) }, { main: buildDeck([]) }],
		duelRule: 1,
		seed: FIXED_SEED,
		autoResponder,
	});
	try {
		// T1 P0: summon Luster #1, Dark Hole it into the GY, (activate Necrovalley).
		await normalSummon(duel, await idle(duel), LUSTER);
		activate(duel, await idle(duel), DARK_HOLE); // → Luster #1 to GY, field clear
		let m = await idle(duel);
		if (withNecrovalley) {
			activate(duel, m, NECRO); // Field Spell
			m = await idle(duel);
		}
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
		// T2 P1: pass.
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T3 P0: summon Luster #2 (banish cost), SS REDMD (banishing Luster #2), ignite.
		await normalSummon(duel, await idle(duel), LUSTER);
		m = await idle(duel);
		const sp = m.spSummonableCards.find((c) => c.code === REDMD);
		if (!sp)
			throw new Error(`REDMD not SP-summonable (have ${m.spSummonableCards.map((s) => s.code)})`);
		duel.setResponse(
			m.prepareResponse(IdleCmdType.SPSUMMON, {
				code: sp.code,
				controller: sp.controller,
				location: sp.location,
				sequence: sp.sequence,
			}),
		); // hsptg SelectUnselect (banish the field Luster) handled by autoResponder
		m = await idle(duel);
		// REDMD's ignition — SS a Dragon from GY/hand (non-targeting).
		activate(duel, m, REDMD);
		const after = await idle(duel);
		const mz = duel.queryLocationCount(0, LOCATION_MZONE);
		duel.setResponse(after.prepareResponse(IdleCmdType.TO_EP));
		return mz;
	} finally {
		await duel.cleanup();
	}
}

/**
 * Monster Reborn TARGETS a card in the GY to Special Summon it. Returns P0's
 * MZONE count after Reborn resolves:
 *   0 → Reborn negated (Necrovalley stops the targeting-GY effect)
 *   1 → the Luster was revived (Reborn resolved)
 */
async function runRebornScenario(withNecrovalley: boolean): Promise<number> {
	const hand = withNecrovalley ? [LUSTER, DARK_HOLE, NECRO, REBORN] : [LUSTER, DARK_HOLE, REBORN];
	const duel = await HeadlessDuel.create({
		decks: [{ main: buildDeck(hand) }, { main: buildDeck([]) }],
		duelRule: 1,
		seed: FIXED_SEED,
		autoResponder,
	});
	try {
		// T1 P0: summon Luster, Dark Hole it into the GY, (activate Necrovalley), then
		// activate Monster Reborn targeting the Luster in the GY.
		await normalSummon(duel, await idle(duel), LUSTER);
		activate(duel, await idle(duel), DARK_HOLE);
		let m = await idle(duel);
		if (withNecrovalley) {
			activate(duel, m, NECRO);
			m = await idle(duel);
		}
		activate(duel, m, REBORN); // targets Luster in GY (autoResponder picks it)
		const after = await idle(duel);
		const mz = duel.queryLocationCount(0, LOCATION_MZONE);
		duel.setResponse(after.prepareResponse(IdleCmdType.TO_EP));
		return mz;
	} finally {
		await duel.cleanup();
	}
}

describe("Necrovalley (pre-errata) — GY interaction reach", () => {
	it("control: WITHOUT Necrovalley, REDMD Special Summons the Dragon from the GY", async () => {
		expect(await runRedmdScenario(false)).toBe(2); // REDMD + revived Luster
	}, 120000);

	it("WITH Necrovalley (910): REDMD's non-targeting GY summon RESOLVES — unaffected per Edison", async () => {
		// The 910 does not stamp EFFECT_NECRO_VALLEY, so REDMD's aux.NecroValleyFilter
		// no longer excludes the GY Dragon → REDMD revives it. MZONE=2 (REDMD + Dragon).
		expect(await runRedmdScenario(true)).toBe(2);
	}, 120000);

	it("control: WITHOUT Necrovalley, Monster Reborn revives the GY Luster", async () => {
		expect(await runRebornScenario(false)).toBe(1);
	}, 120000);

	it("WITH Necrovalley: Monster Reborn (targeting-GY) is negated — nothing revived", async () => {
		expect(await runRebornScenario(true)).toBe(0);
	}, 120000);
});
