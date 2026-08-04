/**
 * Black Garden (71645242) — BASELINE of the official modern script.
 *
 * Review workflow step 0: pin the CURRENT engine behavior before researching
 * the 2010 rulings or writing the pre-errata copy. This suite is the
 * regression baseline the future differential tests compare against.
 *
 * What the served script (resources/current/ygopro/base/script/c71645242.lua)
 * binds, per source reading:
 *   - Global listeners on EVENT_SUMMON_SUCCESS and EVENT_SPSUMMON_SUCCESS only
 *     → forced trigger (e4): halve ATK (SET_ATTACK_FINAL, ceil) + spawn a
 *     Rose Token (71645243, 800/800) on the summoning player's OPPONENT's field.
 *   - NO EVENT_MSET listener (face-down Normal Sets ignored) — the expected
 *     2010 gap per docs/edison-erratas.md.
 *   - NO EVENT_FLIP_SUMMON_SUCCESS listener (flip summons ignored) — found
 *     during this baseline read; whether 2010 requires it is a research item.
 *
 * Card codes:
 *   BLACK_GARDEN = 71645242 (Field Spell, legal x3 in Edison)
 *   ROSE_TOKEN   = 71645243 (in base cards.cdb; NOT in classic.cdb)
 *   KOJIKOCY     = 1184620  (1500/1200 vanilla — the summoned monster)
 *   VANILLA_B    = 2863439  (1100/1400 vanilla — the set/flipped monster)
 */

import {
	BattleCmdType,
	IdleCmdType,
	YGOProMsgChaining,
	YGOProMsgDamage,
	YGOProMsgSelectBattleCmd,
	YGOProMsgSelectCard,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectPosition,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

jest.setTimeout(60_000);

const BLACK_GARDEN = 71645242;
const BLACK_GARDEN_PRE_ERRATA = 910003002; // alias=71645242, formats/edison pool
const ROSE_TOKEN = 71645243;
const KOJIKOCY = 1184620;
const VANILLA_B = 2863439;
// Engine-probe tools (legality is irrelevant to the harness — decks bypass
// validation; these exist in the loaded cdbs):
const CYBER_JAR = 34124316; // FLIP: destroy all, both players excavate 5 and SS lvl<=4 in chosen position. BANNED in Edison — used only as a face-down-SS enabler.
const HORUS_LV6 = 11224103; // 2300/1600 Lv6, unaffected by Spell Cards — probes the halving-immunity path.

const LOCATION_MZONE = 0x04;
const POS_FACEDOWN_DEFENSE = 0x8;

function gardenChainings(msgs: YGOProMsgBase[], gardenCode: number = BLACK_GARDEN): number {
	return msgs.filter(
		(m) => m instanceof YGOProMsgChaining && (m as unknown as { code: number }).code === gardenCode,
	).length;
}

function mentionsCode(msgs: YGOProMsgBase[], code: number): boolean {
	return msgs.some((m) => (m as unknown as { code?: number }).code === code);
}

describe("Black Garden — baseline of the official modern script", () => {
	let duel: HeadlessDuel;

	beforeEach(async () => {
		duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([BLACK_GARDEN]) }, { main: buildDeck([KOJIKOCY, VANILLA_B]) }],
			duelRule: 1,
			seed: FIXED_SEED,
		});
	});

	afterEach(async () => {
		await duel.cleanup();
	});

	/** T1 P0: activate Black Garden from hand, end turn. Returns the idle after activation. */
	async function activateGardenT1(): Promise<void> {
		const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const garden = r1.targetMessage.activatableCards.find((c) => c.code === BLACK_GARDEN);
		if (!garden) {
			throw new Error(
				`Black Garden not activatable. Available: ${r1.targetMessage.activatableCards.map((c) => c.code).join(", ")}`,
			);
		}
		duel.setResponse(
			r1.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
				code: garden.code,
				controller: garden.controller,
				location: garden.location,
				sequence: garden.sequence,
			}),
		);
		const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
	}

	it("Normal Summon under Garden: forced trigger fires and a Rose Token spawns on the opponent's field", async () => {
		await activateGardenT1();

		// T2 P1: Normal Summon Kojikocy
		const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const kojikocy = r3.targetMessage.summonableCards.find((c) => c.code === KOJIKOCY);
		if (!kojikocy) throw new Error("Kojikocy not summonable");
		duel.setResponse(
			r3.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
				code: kojikocy.code,
				controller: kojikocy.controller,
				location: kojikocy.location,
				sequence: kojikocy.sequence,
			}),
		);
		const r4 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

		// Garden's forced trigger chained on the summon
		expect(gardenChainings(r4.allMessages)).toBeGreaterThanOrEqual(1);
		// Rose Token materialized...
		expect(mentionsCode(r4.allMessages, ROSE_TOKEN)).toBe(true);
		// ...on P0's field (the opponent of the summoning player): P0 controls
		// no other monster, so MZONE count 1 == the token.
		expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);
		expect(duel.queryLocationCount(1, LOCATION_MZONE)).toBe(1);
	});

	it("Normal SET under Garden: no trigger, no token (modern behavior — the 2010 gap candidate)", async () => {
		await activateGardenT1();

		// T2 P1: MSET Vanilla B (face-down defense)
		const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const setTarget = r3.targetMessage.msetableCards.find((c) => c.code === VANILLA_B);
		if (!setTarget) throw new Error("Vanilla B not msetable");
		duel.setResponse(
			r3.targetMessage.prepareResponse(IdleCmdType.MSET, {
				code: setTarget.code,
				controller: setTarget.controller,
				location: setTarget.location,
				sequence: setTarget.sequence,
			}),
		);
		const r4 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

		expect(gardenChainings(r4.allMessages)).toBe(0);
		expect(mentionsCode(r4.allMessages, ROSE_TOKEN)).toBe(false);
		// No token anywhere: P0 field empty, P1 has only the set monster.
		expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(0);
		expect(duel.queryLocationCount(1, LOCATION_MZONE)).toBe(1);
	});

	it("Flip Summon under Garden: no trigger, no token (modern script binds no flip listener)", async () => {
		await activateGardenT1();

		// T2 P1: MSET Vanilla B, end turn
		const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const setTarget = r3.targetMessage.msetableCards.find((c) => c.code === VANILLA_B);
		if (!setTarget) throw new Error("Vanilla B not msetable");
		duel.setResponse(
			r3.targetMessage.prepareResponse(IdleCmdType.MSET, {
				code: setTarget.code,
				controller: setTarget.controller,
				location: setTarget.location,
				sequence: setTarget.sequence,
			}),
		);
		const r4 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		duel.setResponse(r4.targetMessage.prepareResponse(IdleCmdType.TO_EP));

		// T3 P0: pass
		const r5 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		duel.setResponse(r5.targetMessage.prepareResponse(IdleCmdType.TO_EP));

		// T4 P1: Flip Summon the set monster (REPOS on the face-down card)
		const r6 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const flip = r6.targetMessage.reposableCards.find((c) => c.code === VANILLA_B);
		if (!flip) {
			throw new Error(
				`Vanilla B not repositionable. Available: ${r6.targetMessage.reposableCards.map((c) => c.code).join(", ")}`,
			);
		}
		duel.setResponse(
			r6.targetMessage.prepareResponse(IdleCmdType.REPOS, {
				code: flip.code,
				controller: flip.controller,
				location: flip.location,
				sequence: flip.sequence,
			}),
		);
		const r7 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

		expect(gardenChainings(r7.allMessages)).toBe(0);
		expect(mentionsCode(r7.allMessages, ROSE_TOKEN)).toBe(false);
	});
});

// ───────────────────────────────────────────────────────────────────────────
// Extended baseline: the scenarios that illuminate the 2010-vs-modern deltas.
// Each test creates its own duel (different decks / custom responders).
// ───────────────────────────────────────────────────────────────────────────

/** T1 P0: activate Black Garden from hand, optionally MSET a monster, end turn. */
async function driveGardenT1(
	duel: HeadlessDuel,
	msetCode?: number,
	gardenCode: number = BLACK_GARDEN,
): Promise<void> {
	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const garden = r1.targetMessage.activatableCards.find((c) => c.code === gardenCode);
	if (!garden) throw new Error(`Garden ${gardenCode} not activatable on T1`);
	duel.setResponse(
		r1.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: garden.code,
			controller: garden.controller,
			location: garden.location,
			sequence: garden.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	if (msetCode !== undefined) {
		const set = r2.targetMessage.msetableCards.find((c) => c.code === msetCode);
		if (!set) throw new Error(`Card ${msetCode} not msetable on T1`);
		duel.setResponse(
			r2.targetMessage.prepareResponse(IdleCmdType.MSET, {
				code: set.code,
				controller: set.controller,
				location: set.location,
				sequence: set.sequence,
			}),
		);
		const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		duel.setResponse(r3.targetMessage.prepareResponse(IdleCmdType.TO_EP));
	} else {
		duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
	}
}

/**
 * Normal Summon the given card at the next idle. Returns the messages seen
 * during the summon AND the pending post-summon idle — the CALLER must
 * respond to that idle (responding here would swallow the caller's turn).
 */
async function driveSummon(
	duel: HeadlessDuel,
	code: number,
): Promise<{ msgs: YGOProMsgBase[]; idle: import("ygopro-msg-encode").YGOProMsgSelectIdleCmd }> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.summonableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`${code} not summonable. Available: ${r.targetMessage.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	return { msgs: r2.allMessages, idle: r2.targetMessage };
}

describe("Black Garden — extended baseline: halving math, face-down SS, spell immunity", () => {
	it("halving is real and the Rose Token is exempt: token (800) beats halved Kojikocy (750) for exactly 50 damage", async () => {
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([BLACK_GARDEN]) }, { main: buildDeck([KOJIKOCY]) }],
			duelRule: 1,
			seed: FIXED_SEED,
		});
		try {
			await driveGardenT1(duel);

			// T2 P1: summon Kojikocy (1500 → halved 750; Rose Token 800 to P0), end turn
			const t2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const koji = t2.targetMessage.summonableCards.find((c) => c.code === KOJIKOCY);
			if (!koji) throw new Error("Kojikocy not summonable");
			duel.setResponse(
				t2.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
					code: koji.code,
					controller: koji.controller,
					location: koji.location,
					sequence: koji.sequence,
				}),
			);
			const t2b = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			duel.setResponse(t2b.targetMessage.prepareResponse(IdleCmdType.TO_EP));

			// T3 P0: attack with the Rose Token into Kojikocy.
			// 800 vs 750 proves BOTH numbers: Kojikocy was halved (else the token
			// loses 800 vs 1500) and the token itself was NOT halved (Garden-summoned
			// monsters are exempt; else 400 vs 750 loses).
			const t3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			duel.setResponse(t3.targetMessage.prepareResponse(IdleCmdType.TO_BP));
			const bc = await duel.advanceUntil(YGOProMsgSelectBattleCmd);
			const token = bc.targetMessage.attackableCards.find((c) => c.code === ROSE_TOKEN);
			if (!token) throw new Error("Rose Token cannot attack");
			duel.setResponse(
				bc.targetMessage.prepareResponse(BattleCmdType.ATTACK, {
					code: token.code,
					controller: token.controller,
					location: token.location,
					sequence: token.sequence,
				}),
			);
			const battle = await duel.advanceUntilOneOf([
				YGOProMsgSelectBattleCmd,
				YGOProMsgSelectIdleCmd,
			]);

			const damage = battle.allMessages.find(
				(m): m is YGOProMsgDamage => m instanceof YGOProMsgDamage,
			);
			expect(damage).toBeDefined();
			expect(damage?.player).toBe(1);
			expect(damage?.value).toBe(50);
			// Kojikocy destroyed by battle
			expect(duel.queryLocationCount(1, LOCATION_MZONE)).toBe(0);
		} finally {
			await duel.cleanup();
		}
	});

	it("face-down Special Summons (Cyber Jar) do NOT trigger Garden today — the central 2010 delta", async () => {
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([BLACK_GARDEN, CYBER_JAR]) }, { main: buildDeck([KOJIKOCY]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: (msg) => {
				// Force every position choice to FACE-DOWN DEFENSE so the Cyber Jar
				// mass Special Summon puts everything face-down.
				if (msg instanceof YGOProMsgSelectPosition) {
					if ((msg.positions & POS_FACEDOWN_DEFENSE) !== 0) {
						return msg.prepareResponse(POS_FACEDOWN_DEFENSE);
					}
					return undefined;
				}
				// Attack-target choice: pick the face-down set card (not the Rose
				// Token) so Kojikocy flips the Jar.
				if (msg instanceof YGOProMsgSelectCard) {
					const target = msg.cards.find((c) => c.code !== ROSE_TOKEN);
					if (target) {
						return msg.prepareResponse([
							{
								sequence: target.sequence,
								controller: target.controller,
								location: target.location,
							},
						]);
					}
				}
				return undefined;
			},
		});
		try {
			await driveGardenT1(duel, CYBER_JAR);

			// T2 P1: summon Kojikocy (this DOES trigger Garden — expected noise:
			// Kojikocy 750, token to P0), then attack the set Cyber Jar.
			const t2 = await driveSummon(duel, KOJIKOCY);
			expect(gardenChainings(t2.msgs)).toBeGreaterThanOrEqual(1); // sanity: face-up path works
			duel.setResponse(t2.idle.prepareResponse(IdleCmdType.TO_BP));
			const bc = await duel.advanceUntil(YGOProMsgSelectBattleCmd);
			const koji = bc.targetMessage.attackableCards.find((c) => c.code === KOJIKOCY);
			if (!koji) throw new Error("Kojikocy cannot attack");
			duel.setResponse(
				bc.targetMessage.prepareResponse(BattleCmdType.ATTACK, {
					code: koji.code,
					controller: koji.controller,
					location: koji.location,
					sequence: koji.sequence,
				}),
			);
			// Flip → Cyber Jar: destroys everything, then BOTH players excavate 5
			// and Special Summon their monsters — all FACE-DOWN via our responder.
			const battle = await duel.advanceUntilOneOf([
				YGOProMsgSelectBattleCmd,
				YGOProMsgSelectIdleCmd,
			]);

			// The mass face-down Special Summon happened...
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBeGreaterThanOrEqual(4);
			expect(duel.queryLocationCount(1, LOCATION_MZONE)).toBeGreaterThanOrEqual(4);
			// ...and the CURRENT script ignored it completely: Garden's trigger
			// never chained, so no new token could have been created by it.
			// (A naive "no ROSE_TOKEN code in the batch" check would false-positive
			// here: Cyber Jar DESTROYS the pre-existing token from T2, and its
			// death messages mention the code.)
			// The 2010 ruling says each face-down SS side yields a Rose Token.
			expect(gardenChainings(battle.allMessages)).toBe(0);
		} finally {
			await duel.cleanup();
		}
	});

	it("spell-immune monster (Horus LV6): trigger ACTIVATES but resolves into nothing — no halving AND no token today", async () => {
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([BLACK_GARDEN]) }, { main: buildDeck([KOJIKOCY, HORUS_LV6]) }],
			duelRule: 1,
			seed: FIXED_SEED,
		});
		try {
			await driveGardenT1(duel);

			// T2 P1: summon Kojikocy (trigger + token to P0 — expected), end turn
			const t2 = await driveSummon(duel, KOJIKOCY);
			duel.setResponse(t2.idle.prepareResponse(IdleCmdType.TO_EP));

			// T3 P0: pass
			const t3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			duel.setResponse(t3.targetMessage.prepareResponse(IdleCmdType.TO_EP));

			const tokensBefore = duel.queryLocationCount(0, LOCATION_MZONE);

			// T4 P1: tribute Kojikocy to summon Horus LV6 (unaffected by Spells)
			const t4 = await driveSummon(duel, HORUS_LV6);

			// The trigger still ACTIVATES (the summon registers)...
			expect(gardenChainings(t4.msgs)).toBeGreaterThanOrEqual(1);
			// ...but resolution whiffs entirely: no token spawns because the ONLY
			// summoned monster is immune to the halving. The 2010 ruling says the
			// token must spawn anyway ("even if the Summoned monster is unaffected
			// by the effects of Spell Cards ... a Rose Token is still Special
			// Summoned") — this pins today's divergent behavior.
			expect(mentionsCode(t4.msgs, ROSE_TOKEN)).toBe(false);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(tokensBefore);
		} finally {
			await duel.cleanup();
		}
	});
});

// ───────────────────────────────────────────────────────────────────────────
// PRE-ERRATA copy (910003002) — 2010 behavior per edisonrul.ing historical
// rulings (both Edison schools agree on these deltas):
//   1. Face-down Special Summons DO register the trigger (DP21 added "face-up").
//   2. The Rose Token spawns even when the summoned monster's ATK can't be
//      halved (spell-immune), as long as it is still on the field at resolution.
//   3. Everything else identical to the modern card (sets/flips never trigger,
//      halving math, token exemption, targeted revival).
// ───────────────────────────────────────────────────────────────────────────
describe("Black Garden PRE-ERRATA (910003002) — 2010 behavior", () => {
	it("regression: face-up Normal Summon behaves exactly like the official card (halve + token)", async () => {
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([BLACK_GARDEN_PRE_ERRATA]) }, { main: buildDeck([KOJIKOCY]) }],
			duelRule: 1,
			seed: FIXED_SEED,
		});
		try {
			await driveGardenT1(duel, undefined, BLACK_GARDEN_PRE_ERRATA);
			const t2 = await driveSummon(duel, KOJIKOCY);
			expect(gardenChainings(t2.msgs, BLACK_GARDEN_PRE_ERRATA)).toBeGreaterThanOrEqual(1);
			expect(mentionsCode(t2.msgs, ROSE_TOKEN)).toBe(true);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);
			expect(duel.queryLocationCount(1, LOCATION_MZONE)).toBe(1);
		} finally {
			await duel.cleanup();
		}
	});

	it("guard: Normal SET still triggers NOTHING (the old tracker claim must stay dead)", async () => {
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([BLACK_GARDEN_PRE_ERRATA]) }, { main: buildDeck([VANILLA_B]) }],
			duelRule: 1,
			seed: FIXED_SEED,
		});
		try {
			await driveGardenT1(duel, undefined, BLACK_GARDEN_PRE_ERRATA);
			const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const setTarget = r3.targetMessage.msetableCards.find((c) => c.code === VANILLA_B);
			if (!setTarget) throw new Error("Vanilla B not msetable");
			duel.setResponse(
				r3.targetMessage.prepareResponse(IdleCmdType.MSET, {
					code: setTarget.code,
					controller: setTarget.controller,
					location: setTarget.location,
					sequence: setTarget.sequence,
				}),
			);
			const r4 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			expect(gardenChainings(r4.allMessages, BLACK_GARDEN_PRE_ERRATA)).toBe(0);
			expect(mentionsCode(r4.allMessages, ROSE_TOKEN)).toBe(false);
		} finally {
			await duel.cleanup();
		}
	});

	it("2010 DELTA 1: face-down mass Special Summon (Cyber Jar) DOES register the trigger", async () => {
		const duel = await HeadlessDuel.create({
			decks: [
				{ main: buildDeck([BLACK_GARDEN_PRE_ERRATA, CYBER_JAR]) },
				{ main: buildDeck([KOJIKOCY]) },
			],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: (msg) => {
				if (msg instanceof YGOProMsgSelectPosition) {
					if ((msg.positions & POS_FACEDOWN_DEFENSE) !== 0) {
						return msg.prepareResponse(POS_FACEDOWN_DEFENSE);
					}
					return undefined;
				}
				if (msg instanceof YGOProMsgSelectCard) {
					const target = msg.cards.find((c) => c.code !== ROSE_TOKEN);
					if (target) {
						return msg.prepareResponse([
							{
								sequence: target.sequence,
								controller: target.controller,
								location: target.location,
							},
						]);
					}
				}
				return undefined;
			},
		});
		try {
			await driveGardenT1(duel, CYBER_JAR, BLACK_GARDEN_PRE_ERRATA);
			const t2 = await driveSummon(duel, KOJIKOCY);
			expect(gardenChainings(t2.msgs, BLACK_GARDEN_PRE_ERRATA)).toBeGreaterThanOrEqual(1);
			duel.setResponse(t2.idle.prepareResponse(IdleCmdType.TO_BP));
			const bc = await duel.advanceUntil(YGOProMsgSelectBattleCmd);
			const koji = bc.targetMessage.attackableCards.find((c) => c.code === KOJIKOCY);
			if (!koji) throw new Error("Kojikocy cannot attack");
			duel.setResponse(
				bc.targetMessage.prepareResponse(BattleCmdType.ATTACK, {
					code: koji.code,
					controller: koji.controller,
					location: koji.location,
					sequence: koji.sequence,
				}),
			);
			const battle = await duel.advanceUntilOneOf([
				YGOProMsgSelectBattleCmd,
				YGOProMsgSelectIdleCmd,
			]);

			// Face-down mass SS happened on both sides...
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBeGreaterThanOrEqual(4);
			expect(duel.queryLocationCount(1, LOCATION_MZONE)).toBeGreaterThanOrEqual(4);
			// ...and unlike the official card (baseline pins 0), the 2010 copy's
			// trigger REGISTERS the face-down summons and chains. (Both sides'
			// zones are full after excavating 5, so no Rose Token can spawn —
			// era-correct: the effect still activates when the token can't be
			// summoned.)
			expect(gardenChainings(battle.allMessages, BLACK_GARDEN_PRE_ERRATA)).toBeGreaterThanOrEqual(
				1,
			);
		} finally {
			await duel.cleanup();
		}
	});

	it("2010 DELTA 2: spell-immune monster (Horus LV6) — no halving, but the Rose Token spawns anyway", async () => {
		const duel = await HeadlessDuel.create({
			decks: [
				{ main: buildDeck([BLACK_GARDEN_PRE_ERRATA]) },
				{ main: buildDeck([KOJIKOCY, HORUS_LV6]) },
			],
			duelRule: 1,
			seed: FIXED_SEED,
		});
		try {
			await driveGardenT1(duel, undefined, BLACK_GARDEN_PRE_ERRATA);

			// T2 P1: summon Kojikocy (halve + token #1 to P0), end turn
			const t2 = await driveSummon(duel, KOJIKOCY);
			duel.setResponse(t2.idle.prepareResponse(IdleCmdType.TO_EP));

			// T3 P0: pass
			const t3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			duel.setResponse(t3.targetMessage.prepareResponse(IdleCmdType.TO_EP));

			const tokensBefore = duel.queryLocationCount(0, LOCATION_MZONE);

			// T4 P1: tribute Kojikocy for Horus LV6 (unaffected by Spell Cards)
			const t4 = await driveSummon(duel, HORUS_LV6);

			expect(gardenChainings(t4.msgs, BLACK_GARDEN_PRE_ERRATA)).toBeGreaterThanOrEqual(1);
			// 2010 ruling verbatim: "This effect activates even if the Summoned
			// monster is unaffected by the effects of Spell Cards, its ATK will
			// not be halved, but a Rose Token is still Special Summoned."
			expect(mentionsCode(t4.msgs, ROSE_TOKEN)).toBe(true);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(tokensBefore + 1);
		} finally {
			await duel.cleanup();
		}
	});
});
