/**
 * Armory Arm pre-errata (910003009, alias 29071332) — Edison 2010.
 *
 * Delta (edisonformat.com functional-errata + yugipedia Card_Errata): the
 * Trigger inflicts damage equal to the ATK the destroyed monster had ON THE
 * FIELD (incl. modifiers). The DP08-2009 print (in force during April-2010
 * Edison) says "the destroyed monster's ATK"; TU06 (Aug-2011) errata'd it to
 * "the ATK of the destroyed monster IN THE GRAVEYARD". By the time the Trigger
 * fires the monster is in the GY at BASE ATK, so the base/modern script deals
 * the GY value. The 910 copy snapshots the on-field ATK at
 * EVENT_PRE_DAMAGE_CALCULATE and deals THAT.
 *
 * Scenario (the classic Armory-Arm battle pattern, with a modified defender so
 * the field-vs-GY delta is observable): P0's equipped attacker destroys a P1
 * monster that carries Malevolent Nuzzler (+700). The destroyed monster's base
 * ATK is 1100, on-field ATK is 1800.
 *   - 910 copy  → Armory damage = 1800 (on-field).
 *   - official  → Armory damage = 1100 (GY / base). ← the un-fixed behavior.
 */
import {
	IdleCmdType,
	BattleCmdType,
	YGOProMsgDamage,
	YGOProMsgSelectBattleCmd,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectSum,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

const AA_PRE = 910003009; // Armory Arm pre-errata copy
const AA_OFF = 29071332; // official Armory Arm (baseline)
const EQUIPPED = 8471389; // Lv4 vanilla, ATK 1200 — the equipped attacker
const MAT_L1 = 7902349; // Lv1 vanilla NON-tuner (synchro fodder, 3+1 = Lv4)
const JUNK = 63977008; // Lv3 Tuner
const DEFENDER = 2863439; // Lv4 vanilla, ATK 1100 — P1's monster
const NUZZLER = 99597615; // Malevolent Nuzzler, +700 equip

async function idle(duel: HeadlessDuel): Promise<YGOProMsgSelectIdleCmd> {
	return (await duel.advanceUntil(YGOProMsgSelectIdleCmd)).targetMessage;
}
function pickAll(msg: YGOProMsgSelectCard | YGOProMsgSelectSum): Uint8Array {
	return msg.prepareResponse(
		msg.cards.map((c) => ({
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
/** Activate `code` from the idle, then answer its target-selection SelectCard
 * with the specific `targetCode` (both Nuzzler and Armory's equip offer BOTH
 * fields' monsters, so the target must be chosen explicitly). */
async function activateThenTarget(
	duel: HeadlessDuel,
	m: YGOProMsgSelectIdleCmd,
	code: number,
	targetCode: number,
): Promise<void> {
	const c = m.activatableCards.find((x) => x.code === code);
	if (!c)
		throw new Error(`${code} not activatable (have: ${m.activatableCards.map((a) => a.code)})`);
	duel.setResponse(
		m.prepareResponse(IdleCmdType.ACTIVATE, {
			code: c.code,
			controller: c.controller,
			location: c.location,
			sequence: c.sequence,
		}),
	);
	const sc = (await duel.advanceUntil(YGOProMsgSelectCard)).targetMessage;
	const t = sc.cards.find((x) => x.code === targetCode);
	if (!t) throw new Error(`target ${targetCode} not offered (have ${sc.cards.map((x) => x.code)})`);
	duel.setResponse(
		sc.prepareResponse([
			{ code: t.code, controller: t.controller, location: t.location, sequence: t.sequence },
		]),
	);
}

/** Run the shared scenario with the given Armory Arm code; return the Armory
 * Arm damage value inflicted to P1 (the non-battle CATEGORY_DAMAGE). */
async function runScenario(aaCode: number): Promise<number> {
	const damages: number[] = [];
	const duel = await HeadlessDuel.create({
		decks: [
			{ main: buildDeck([EQUIPPED, MAT_L1, JUNK]), extra: [aaCode] },
			{ main: buildDeck([DEFENDER, NUZZLER]) },
		],
		duelRule: 1,
		seed: FIXED_SEED,
		autoResponder: (msg: YGOProMsgBase): Uint8Array | undefined => {
			if (msg instanceof YGOProMsgSelectSum) return pickAll(msg);
			if (msg instanceof YGOProMsgSelectCard) {
				// Fallback for incidental SelectCards (e.g. the battle target when
				// only one defender exists): pick the first `min`. The important
				// targets (Nuzzler → DEFENDER, Armory equip → EQUIPPED) are handled
				// explicitly via activateThenTarget, so they never reach here.
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
			if (msg instanceof YGOProMsgSelectChain) return msg.defaultResponse(); // decline
			return undefined;
		},
	});
	const collect = (msgs: YGOProMsgBase[]) => {
		for (const m of msgs) if (m instanceof YGOProMsgDamage && m.player === 1) damages.push(m.value);
	};
	try {
		// T1 P0: summon the future equipped attacker.
		await normalSummon(duel, await idle(duel), EQUIPPED);
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T2 P1: summon DEFENDER, equip Malevolent Nuzzler onto it (+700).
		let m = await idle(duel);
		await normalSummon(duel, m, DEFENDER);
		m = await idle(duel);
		await activateThenTarget(duel, m, NUZZLER, DEFENDER); // Nuzzler → DEFENDER
		m = await idle(duel);
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
		// T3 P0: summon the Lv1 synchro material.
		await normalSummon(duel, await idle(duel), MAT_L1);
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T4 P1: pass.
		duel.setResponse((await idle(duel)).prepareResponse(IdleCmdType.TO_EP));
		// T5 P0: summon Junk → Synchro Armory Arm (Junk + MAT_L1) → equip to EQUIPPED → attack.
		await normalSummon(duel, await idle(duel), JUNK);
		m = await idle(duel);
		const aa = m.spSummonableCards.find((c) => c.code === aaCode);
		if (!aa) throw new Error(`${aaCode} not Synchro-summonable`);
		duel.setResponse(
			m.prepareResponse(IdleCmdType.SPSUMMON, {
				code: aa.code,
				controller: aa.controller,
				location: aa.location,
				sequence: aa.sequence,
			}),
		);
		m = await idle(duel);
		await activateThenTarget(duel, m, aaCode, EQUIPPED); // Armory equip → EQUIPPED
		m = await idle(duel);
		// Enter Battle Phase, attack with EQUIPPED.
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_BP));
		const bp = (await duel.advanceUntil(YGOProMsgSelectBattleCmd)).targetMessage;
		const att = bp.attackableCards.find((c) => c.code === EQUIPPED);
		if (!att) throw new Error("EQUIPPED cannot attack");
		duel.setResponse(
			bp.prepareResponse(BattleCmdType.ATTACK, {
				code: att.code,
				controller: att.controller,
				location: att.location,
				sequence: att.sequence,
			}),
		);
		// Drive to the next idle, collecting all damage messages (battle + Armory).
		const { allMessages } = await duel.advanceUntilOneOf([
			YGOProMsgSelectIdleCmd,
			YGOProMsgSelectBattleCmd,
		]);
		collect(allMessages);
		// Battle damage = attacker(2200) − defender(1800 w/ Nuzzler) = 400; the
		// OTHER damage is Armory Arm's (the destroyed monster's ATK).
		const armory = damages.find((d) => d !== 400);
		if (armory === undefined) throw new Error(`no Armory damage seen; damages=[${damages}]`);
		return armory;
	} finally {
		await duel.cleanup();
	}
}

describe("Armory Arm — 2010 damage uses the destroyed monster's ON-FIELD ATK", () => {
	it("pre-errata (910003009): inflicts the on-field ATK (1800, with Nuzzler)", async () => {
		expect(await runScenario(AA_PRE)).toBe(1800);
	}, 120000);

	it("baseline (official 29071332): inflicts the GY/base ATK (1100)", async () => {
		expect(await runScenario(AA_OFF)).toBe(1100);
	}, 120000);
});
