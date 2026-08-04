/**
 * Damage-step behavior tests — Slice 5
 *
 * Probes four distinct damage-step behaviors in the Edison/MR1 era engine:
 *
 *   1. Flip effect timing — Man-Eater Bug's FLIP activates in damage step
 *      substep 6 (after damage calculation), NOT at flip time.
 *
 *   2. Window masking — Quick-Play Spells MUST be SET face-down in a previous
 *      turn to be usable on the opponent's turn. When SET: Rush Recklessly
 *      (ATK modifier, EFFECT_FLAG_DAMAGE_STEP) is offered in battle-step
 *      windows AND inside the damage step; Mystical Space Typhoon (non-ATK
 *      modifier, no EFFECT_FLAG_DAMAGE_STEP) is offered in battle-step windows
 *      but is masked out inside the damage step. Hand-held quick-plays cannot
 *      be activated on the opponent's turn — the engine correctly offers
 *      nothing in that case (rules-correct behavior, not a gap).
 *
 *   3. Honest era probe — observes which damage-step substep windows offer
 *      Honest's quick effect from hand. The Lua condition
 *      `phase~=PHASE_DAMAGE or Duel.IsDamageCalculated()` means Honest is
 *      available only BEFORE damage calculation. Reports the VERDICT in
 *      comments and uses it.failing for the 2010-era-correct expectation.
 *
 *   4. Honest resolution math — activates Honest during the observed window
 *      and asserts ATK gain, battle outcome, and damage value.
 *
 * ============================================================================
 * DAMAGE STEP SUBSTEP MAP (from zero-atk-battle observed sequence):
 *
 *   Before DamageStepStart:
 *     [2]  MSG_ATTACK
 *     [3]  SelectChain(p=1, count=0)   ← battle step P1 window
 *     [4]  SelectChain(p=0, count=0)   ← battle step P0 window
 *     [5]  Hint
 *     [6]  Hint
 *     [7]  SelectChain(p=1, count=0)   ← battle step P1 second window
 *     [8]  SelectChain(p=0, count=0)   ← battle step P0 second window
 *
 *   [9]  MSG_DAMAGE_STEP_START         ← substep 0 begins
 *     [10] Hint / [11] Hint
 *     [12] SelectChain(p=1, count=?)   ← substep 1 window (P1)
 *     [13] SelectChain(p=0, count=?)   ← substep 1 window (P0) — ATK modifiers here
 *     [14] Hint / [15] Hint
 *     [16] SelectChain(p=1, count=?)   ← substep 2 window (P1)
 *     [17] SelectChain(p=0, count=?)   ← substep 2 window (P0) — ATK modifiers here
 *     [18] Hint / [19] Hint
 *     [20] SelectChain(p=1, count=?)   ← substep 3 window (P1) — pre-calc
 *     [21] SelectChain(p=0, count=?)   ← substep 3 window (P0) — pre-calc
 *     [22] MSG_BATTLE                  ← damage calculation occurs
 *     [23] Hint / [24] Hint
 *     [25] SelectChain(p=1, count=?)   ← substep 5 window (P1) — post-calc
 *     [26] SelectChain(p=0, count=?)   ← substep 5 window (P0) — FLIP effects here
 *     [27] Hint / [28] Hint
 *     [29] SelectChain(p=1, count=?)   ← substep 6 window (P1)
 *     [30] SelectChain(p=0, count=?)   ← substep 6 window (P0)
 *   [31] MSG_DAMAGE_STEP_END
 * ============================================================================
 *
 * Fixture cards (verified in base/cards.cdb + classic/classic.cdb):
 *   Man-Eater Bug    54652250   450/600  Lv2 FLIP: destroy 1 monster
 *   Kojikocy          1184620  1500/1200 Lv4 vanilla (in VANILLA_POOL)
 *   Rush Recklessly  70046172   quick-play +700 ATK, EFFECT_FLAG_DAMAGE_STEP
 *   MST               5318639   quick-play S/T removal, NO EFFECT_FLAG_DAMAGE_STEP
 *   Honest (Pre-Era) 910003001   quick effect: LIGHT gains opponent ATK — 2010 window (PHASE_DAMAGE_CAL)
 *   LIGHT vanilla     2863439   1100/1400 Lv4 LIGHT vanilla (Demon's Mirror)
 */

import {
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectBattleCmd,
	YGOProMsgSelectCard,
	YGOProMsgMove,
	YGOProMsgDamageStepStart,
	YGOProMsgDamageStepEnd,
	YGOProMsgAttack,
	YGOProMsgBattle,
	YGOProMsgSelectChain,
	YGOProMsgChaining,
	YGOProMsgDamage,
	IdleCmdType,
	BattleCmdType,
	OcgcoreCommonConstants,
} from "ygopro-msg-encode";
import type { YGOProMsgBase, YGOProMsgResponseBase } from "ygopro-msg-encode";
import { _OcgcoreConstants } from "koishipro-core.js";
import { HeadlessDuel } from "./headless-duel";
import { FIXED_SEED, buildDeck } from "./test-fixtures";

const { OcgcoreScriptConstants } = _OcgcoreConstants;

jest.setTimeout(60_000);

// ---------------------------------------------------------------------------
// Card codes
// ---------------------------------------------------------------------------
const MAN_EATER_BUG = 54652250; // 450/600, Lv2, FLIP: destroy 1 monster
const KOJIKOCY = 1184620; // 1500/1200, Lv4, vanilla
const RUSH_RECKLESSLY = 70046172; // quick-play +700 ATK, EFFECT_FLAG_DAMAGE_STEP
const MST = 5318639; // Mystical Space Typhoon, no EFFECT_FLAG_DAMAGE_STEP
// Pre-errata Honest (910003001) has 2010 damage-cal window; official (37742478) does not.
const HONEST_PRE_ERRATA = 910003001; // alias=37742478, 1100/1900, Lv4, LIGHT — offered in PHASE_DAMAGE_CAL
const HONEST_OFFICIAL = 37742478; // 1100/1900, Lv4, LIGHT — NOT offered in damage-cal window (modern ruling)
const LIGHT_VANILLA = 2863439; // 1100/1400, Lv4, LIGHT vanilla (Demon's Mirror)

// ---------------------------------------------------------------------------
// Reason bitmasks
// ---------------------------------------------------------------------------
const REASON_DESTROY = OcgcoreCommonConstants.REASON_DESTROY; // 0x1  = 1
const REASON_BATTLE = OcgcoreCommonConstants.REASON_BATTLE; // 0x20 = 32
const REASON_EFFECT = OcgcoreCommonConstants.REASON_EFFECT; // 0x40 = 64

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Drive Turn 1 for a player: Normal Summon the given card code, then end turn.
 * Returns all messages seen during this turn.
 */
async function driveT1Summon(duel: HeadlessDuel, cardCode: number): Promise<YGOProMsgBase[]> {
	const allMsgs: YGOProMsgBase[] = [];

	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r1.allMessages);
	const idle = r1.targetMessage;

	const card = idle.summonableCards.find((c) => c.code === cardCode);
	if (!card) {
		throw new Error(
			`T1 Summon: card ${cardCode} not in summonableCards. ` +
				`Available: ${idle.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle.prepareResponse(IdleCmdType.SUMMON, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);

	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r2.allMessages);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));

	return allMsgs;
}

/**
 * Drive Turn 1 for P0: MSET (face-down monster set) the given card, then end turn.
 */
async function driveT1MSet(duel: HeadlessDuel, cardCode: number): Promise<YGOProMsgBase[]> {
	const allMsgs: YGOProMsgBase[] = [];

	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r1.allMessages);
	const idle = r1.targetMessage;

	const card = idle.msetableCards.find((c) => c.code === cardCode);
	if (!card) {
		throw new Error(
			`T1 MSET: card ${cardCode} not in msetableCards. ` +
				`Available: ${idle.msetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle.prepareResponse(IdleCmdType.MSET, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);

	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r2.allMessages);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));

	return allMsgs;
}

/**
 * Drive Turn 1 for P0: Normal Summon a monster AND SSET (face-down spell/trap set)
 * one spell/trap from hand, then end turn.
 * Returns all messages seen during this turn.
 */
async function driveT1SummonAndSSet(
	duel: HeadlessDuel,
	monsterCode: number,
	spellCode: number,
): Promise<YGOProMsgBase[]> {
	const allMsgs: YGOProMsgBase[] = [];

	// Step 1: Summon the monster
	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r1.allMessages);
	const idle1 = r1.targetMessage;

	const monster = idle1.summonableCards.find((c) => c.code === monsterCode);
	if (!monster) {
		throw new Error(
			`T1 SummonAndSSet: monster ${monsterCode} not in summonableCards. ` +
				`Available: ${idle1.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle1.prepareResponse(IdleCmdType.SUMMON, {
			code: monster.code,
			controller: monster.controller,
			location: monster.location,
			sequence: monster.sequence,
		}),
	);

	// Step 2: SSET the spell/trap
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r2.allMessages);
	const idle2 = r2.targetMessage;

	const spell = idle2.ssetableCards.find((c) => c.code === spellCode);
	if (!spell) {
		throw new Error(
			`T1 SummonAndSSet: spell ${spellCode} not in ssetableCards. ` +
				`Available ssetable: ${idle2.ssetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle2.prepareResponse(IdleCmdType.SSET, {
			code: spell.code,
			controller: spell.controller,
			location: spell.location,
			sequence: spell.sequence,
		}),
	);

	// Step 3: End turn
	const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r3.allMessages);
	duel.setResponse(r3.targetMessage.prepareResponse(IdleCmdType.TO_EP));

	return allMsgs;
}

/**
 * Drive Turn 1 for P0: Normal Summon a monster AND SSET two spells/traps, then end turn.
 * Returns all messages seen during this turn.
 */
async function driveT1SummonAndSSetTwo(
	duel: HeadlessDuel,
	monsterCode: number,
	spell1Code: number,
	spell2Code: number,
): Promise<YGOProMsgBase[]> {
	const allMsgs: YGOProMsgBase[] = [];

	// Step 1: Summon the monster
	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r1.allMessages);
	const idle1 = r1.targetMessage;

	const monster = idle1.summonableCards.find((c) => c.code === monsterCode);
	if (!monster) {
		throw new Error(
			`T1 SummonAndSSetTwo: monster ${monsterCode} not in summonableCards. ` +
				`Available: ${idle1.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle1.prepareResponse(IdleCmdType.SUMMON, {
			code: monster.code,
			controller: monster.controller,
			location: monster.location,
			sequence: monster.sequence,
		}),
	);

	// Step 2: SSET spell1
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r2.allMessages);
	const idle2 = r2.targetMessage;

	const spell1 = idle2.ssetableCards.find((c) => c.code === spell1Code);
	if (!spell1) {
		throw new Error(
			`T1 SummonAndSSetTwo: spell1 ${spell1Code} not in ssetableCards. ` +
				`Available ssetable: ${idle2.ssetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle2.prepareResponse(IdleCmdType.SSET, {
			code: spell1.code,
			controller: spell1.controller,
			location: spell1.location,
			sequence: spell1.sequence,
		}),
	);

	// Step 3: SSET spell2
	const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r3.allMessages);
	const idle3 = r3.targetMessage;

	const spell2 = idle3.ssetableCards.find((c) => c.code === spell2Code);
	if (!spell2) {
		throw new Error(
			`T1 SummonAndSSetTwo: spell2 ${spell2Code} not in ssetableCards. ` +
				`Available ssetable: ${idle3.ssetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle3.prepareResponse(IdleCmdType.SSET, {
			code: spell2.code,
			controller: spell2.controller,
			location: spell2.location,
			sequence: spell2.sequence,
		}),
	);

	// Step 4: End turn
	const r4 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r4.allMessages);
	duel.setResponse(r4.targetMessage.prepareResponse(IdleCmdType.TO_EP));

	return allMsgs;
}

/**
 * Drive Turn 2 for a player: Normal Summon the given card, then enter Battle Phase.
 * Returns all messages seen + the SelectBattleCmd target.
 */
async function driveT2SummonToBP(
	duel: HeadlessDuel,
	cardCode: number,
): Promise<{ setupMsgs: YGOProMsgBase[]; battleCmd: YGOProMsgSelectBattleCmd }> {
	const setupMsgs: YGOProMsgBase[] = [];

	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	setupMsgs.push(...r1.allMessages);
	const idle = r1.targetMessage;

	const card = idle.summonableCards.find((c) => c.code === cardCode);
	if (!card) {
		throw new Error(
			`T2 Summon: card ${cardCode} not in summonableCards. ` +
				`Available: ${idle.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle.prepareResponse(IdleCmdType.SUMMON, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);

	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	setupMsgs.push(...r2.allMessages);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_BP));

	const r3 = await duel.advanceUntil(YGOProMsgSelectBattleCmd);
	setupMsgs.push(...r3.allMessages);

	return { setupMsgs, battleCmd: r3.targetMessage };
}

/**
 * Declare an attack with the given attacker code and drive through battle
 * resolution, collecting all messages until the next SelectBattleCmd or
 * SelectIdleCmd.
 *
 * Returns battleMessages (all collected) and finalMessage (the stop target).
 */
async function declareAttackAndCollect(
	duel: HeadlessDuel,
	battleCmd: YGOProMsgSelectBattleCmd,
	attackerCode: number,
): Promise<{ battleMessages: YGOProMsgBase[]; finalMessage: YGOProMsgBase }> {
	const attackable = battleCmd.attackableCards.find((c) => c.code === attackerCode);
	if (!attackable) {
		throw new Error(
			`Attacker ${attackerCode} not in attackableCards. ` +
				`Available: ${battleCmd.attackableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		battleCmd.prepareResponse(BattleCmdType.ATTACK, {
			code: attackable.code,
			controller: attackable.controller,
			location: attackable.location,
			sequence: attackable.sequence,
		}),
	);

	const { allMessages: battleMessages, targetMessage: finalMessage } = await duel.advanceUntilOneOf(
		[YGOProMsgSelectBattleCmd, YGOProMsgSelectIdleCmd],
	);

	return { battleMessages, finalMessage };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Damage step behavior (Edison/MR1 era probe — Slice 5)", () => {
	// ────────────────────────────────────────────────────────────────────────
	// Test 1: FLIP effect activates in substep 6 (after damage calculation)
	// ────────────────────────────────────────────────────────────────────────
	describe("Test 1: FLIP effect timing — Man-Eater Bug activates in substep 6 (after MSG_BATTLE)", () => {
		let duel: HeadlessDuel;

		// P0: MEB at [0] → face-down set T1
		// P1: Kojikocy at [0] → summon T2, attack MEB
		const P0_DECK = buildDeck([MAN_EATER_BUG]);
		const P1_DECK = buildDeck([KOJIKOCY]);

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
				// Custom auto-responder: for SelectCard (MEB flip effect target),
				// prefer Kojikocy (P1's monster) over MEB itself.
				autoResponder: (msg) => {
					if (msg instanceof YGOProMsgSelectCard) {
						// Prefer Kojikocy as the FLIP effect target
						const koji = msg.cards.find((c) => c.code === KOJIKOCY);
						if (koji) {
							return msg.prepareResponse([
								{ sequence: koji.sequence, controller: koji.controller, location: koji.location },
							]);
						}
					}
					return undefined; // fall back to built-in
				},
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("MEB FLIP activates after MSG_BATTLE, Kojikocy destroyed by effect, MEB destroyed by battle", async () => {
			// T1 P0: MSET Man-Eater Bug
			await driveT1MSet(duel, MAN_EATER_BUG);

			// T2 P1: Summon Kojikocy, enter BP
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);

			// Kojikocy declares attack on MEB (face-down — auto-handled defender pick)
			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);

			// ── Locate structural anchors ──────────────────────────────────
			const dsStartIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
			const dsEndIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepEnd);
			const battleMsgIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgBattle);

			expect(dsStartIdx).toBeGreaterThanOrEqual(0);
			expect(dsEndIdx).toBeGreaterThan(dsStartIdx);
			expect(battleMsgIdx).toBeGreaterThan(dsStartIdx);
			expect(dsEndIdx).toBeGreaterThan(battleMsgIdx);

			// ── MEB FLIP must activate AFTER MSG_BATTLE (substep 6 window) ──
			// YGOProMsgChaining carries code of the activated effect
			const mebChainingIdx = battleMessages.findIndex(
				(m) => m instanceof YGOProMsgChaining && (m as YGOProMsgChaining).code === MAN_EATER_BUG,
			);
			expect(mebChainingIdx).toBeGreaterThan(battleMsgIdx);
			// ...and still inside the damage step
			expect(mebChainingIdx).toBeLessThan(dsEndIdx);
			// ...and after DamageStepStart
			expect(mebChainingIdx).toBeGreaterThan(dsStartIdx);

			// ── Kojikocy destroyed by MEB's effect ────────────────────────
			const kojiMove = battleMessages.find(
				(m): m is YGOProMsgMove =>
					m instanceof YGOProMsgMove &&
					(m as YGOProMsgMove).code === KOJIKOCY &&
					(m as YGOProMsgMove).current.location === OcgcoreScriptConstants.LOCATION_GRAVE,
			) as YGOProMsgMove | undefined;

			expect(kojiMove).toBeDefined();
			expect((kojiMove!.reason & REASON_EFFECT) !== 0).toBe(true);
			expect((kojiMove!.reason & REASON_DESTROY) !== 0).toBe(true);

			// ── MEB destroyed by battle (1500 ATK > 600 DEF) ──────────────
			const mebMove = battleMessages.find(
				(m): m is YGOProMsgMove =>
					m instanceof YGOProMsgMove &&
					(m as YGOProMsgMove).code === MAN_EATER_BUG &&
					(m as YGOProMsgMove).current.location === OcgcoreScriptConstants.LOCATION_GRAVE,
			) as YGOProMsgMove | undefined;

			expect(mebMove).toBeDefined();
			expect((mebMove!.reason & REASON_BATTLE) !== 0).toBe(true);
			expect((mebMove!.reason & REASON_DESTROY) !== 0).toBe(true);

			// ── Post-resolution field state ────────────────────────────────
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBeGreaterThan(0);
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_GRAVE)).toBeGreaterThan(0);
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Test 2: Window masking — ATK modifier vs non-ATK modifier in damage step
	// ────────────────────────────────────────────────────────────────────────
	//
	// Quick-Play Spells CANNOT be activated from the hand on the opponent's
	// turn — they MUST be SET face-down on a previous turn. The engine correctly
	// offers nothing when cards are hand-held. The real masking test uses SET
	// cards: both RR and MST are SET T1, then P1 attacks T2 — we observe which
	// chain windows each card appears in.
	describe("Test 2: window masking — RR offered in DS, MST masked in DS", () => {
		let duel: HeadlessDuel;

		// P0 opening hand (deck[0..4]): LIGHT_VANILLA, RR, MST, then vanillas
		// P1: Kojikocy at [0]
		// MST is limited to 1 per deck in Edison — only 1 copy in deck.
		const P0_DECK = buildDeck([LIGHT_VANILLA, RUSH_RECKLESSLY, MST]);
		const P1_DECK = buildDeck([KOJIKOCY]);

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		// ============================================================================
		// RULES RATIONALE (Quick-Play Spells from hand on opponent's turn):
		//
		//   Quick-Play Spells held in hand CANNOT be activated on the opponent's turn
		//   under both 2010 (Edison) and modern rules. They must be SET face-down
		//   during a previous Main Phase. The engine correctly produces empty chain
		//   windows in this scenario — this is rules-correct behavior, not a gap.
		//
		//   VERDICT:
		//     - Both RR and MST are absent from ALL chain windows when in hand.
		//     - This is CORRECT. No era gap here.
		// ============================================================================

		it("rules-correct: hand-held quick-play spells are never offered in chain windows on opponent's turn", async () => {
			// T1 P0: Summon LIGHT_VANILLA (1100 ATK), end turn (RR + MST stay in hand)
			await driveT1Summon(duel, LIGHT_VANILLA);

			// T2 P1: Summon Kojikocy, enter BP
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);

			// Kojikocy attacks P0's LIGHT_VANILLA
			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);

			// ── Partition chain windows by position relative to DS ─────────
			const dsStartIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
			const dsEndIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepEnd);

			expect(dsStartIdx).toBeGreaterThanOrEqual(0);
			expect(dsEndIdx).toBeGreaterThan(dsStartIdx);

			// Pre-DS battle-step chain windows (before DamageStepStart)
			const preDsChains = battleMessages
				.slice(0, dsStartIdx)
				.filter((m): m is YGOProMsgSelectChain => m instanceof YGOProMsgSelectChain);

			// In-damage-step chain windows (between DamageStepStart and DamageStepEnd)
			const inStepChains = battleMessages
				.slice(dsStartIdx + 1, dsEndIdx)
				.filter((m): m is YGOProMsgSelectChain => m instanceof YGOProMsgSelectChain);

			// Rules-correct: hand-held QPs absent from ALL windows (pre-DS and in-DS)
			const rrInPreDs = preDsChains.some((m) => m.chains.some((c) => c.code === RUSH_RECKLESSLY));
			const mstInPreDs = preDsChains.some((m) => m.chains.some((c) => c.code === MST));
			const rrInStep = inStepChains.some((m) => m.chains.some((c) => c.code === RUSH_RECKLESSLY));
			const mstInStep = inStepChains.some((m) => m.chains.some((c) => c.code === MST));

			expect(rrInPreDs).toBe(false);
			expect(mstInPreDs).toBe(false);
			expect(rrInStep).toBe(false);
			expect(mstInStep).toBe(false);
		});

		// ============================================================================
		// SET CARDS PROBE — the real masking test:
		//
		//   T1 P0: Summon LIGHT_VANILLA + SET Rush Recklessly + SET MST face-down.
		//   T2 P1: Summon Kojikocy, enter BP, attack LIGHT_VANILLA.
		//
		//   Expected per 2010 rules:
		//     (a) Battle-step windows (pre-MSG_DAMAGE_STEP_START): both RR and MST
		//         should be offered (they are live face-down quick-plays).
		//     (b) In-DS windows (between DAMAGE_STEP_START and DAMAGE_STEP_END):
		//         RR should appear in at least one pre-MSG_BATTLE window (substeps
		//         1-3: ATK modifiers legal per 2010 Edison); MST should NOT appear
		//         in ANY in-DS window (no EFFECT_FLAG_DAMAGE_STEP).
		//
		//   OBSERVED behavior is confirmed by the assertions below. If the engine
		//   contradicts the 2010 expectation, that is documented as an it.failing.
		// ============================================================================

		it("SET cards probe: both RR and MST offered in battle-step windows when SET face-down", async () => {
			// T1 P0: Summon LIGHT_VANILLA + SET both spells face-down, end turn
			await driveT1SummonAndSSetTwo(duel, LIGHT_VANILLA, RUSH_RECKLESSLY, MST);

			// T2 P1: Summon Kojikocy, enter BP
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);

			// Kojikocy attacks P0's LIGHT_VANILLA — collect all messages
			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);

			const dsStartIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
			expect(dsStartIdx).toBeGreaterThanOrEqual(0);

			// Battle-step chain windows = those BEFORE DamageStepStart
			const battleStepChains = battleMessages
				.slice(0, dsStartIdx)
				.filter((m): m is YGOProMsgSelectChain => m instanceof YGOProMsgSelectChain);

			const rrInBattleStep = battleStepChains.some((m) =>
				m.chains.some((c) => c.code === RUSH_RECKLESSLY),
			);
			const mstInBattleStep = battleStepChains.some((m) => m.chains.some((c) => c.code === MST));

			// Both SET quick-plays should appear in battle-step windows
			expect(rrInBattleStep).toBe(true);
			expect(mstInBattleStep).toBe(true);
		});

		it("SET cards probe: MST is absent from all in-DS chain windows (no EFFECT_FLAG_DAMAGE_STEP)", async () => {
			// T1 P0: Summon LIGHT_VANILLA + SET both spells face-down, end turn
			await driveT1SummonAndSSetTwo(duel, LIGHT_VANILLA, RUSH_RECKLESSLY, MST);

			// T2 P1: Summon Kojikocy, enter BP
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);

			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);

			const dsStartIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
			const dsEndIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepEnd);

			expect(dsStartIdx).toBeGreaterThanOrEqual(0);
			expect(dsEndIdx).toBeGreaterThan(dsStartIdx);

			// In-DS chain windows (between DamageStepStart and DamageStepEnd)
			const inStepChains = battleMessages
				.slice(dsStartIdx + 1, dsEndIdx)
				.filter((m): m is YGOProMsgSelectChain => m instanceof YGOProMsgSelectChain);

			// MST has no EFFECT_FLAG_DAMAGE_STEP — must be absent from all in-DS windows
			const mstInStep = inStepChains.some((m) => m.chains.some((c) => c.code === MST));
			expect(mstInStep).toBe(false);
		});

		it("SET cards probe: RR is offered in at least one pre-MSG_BATTLE in-DS window (ATK modifier, EFFECT_FLAG_DAMAGE_STEP)", async () => {
			// T1 P0: Summon LIGHT_VANILLA + SET both spells face-down, end turn
			await driveT1SummonAndSSetTwo(duel, LIGHT_VANILLA, RUSH_RECKLESSLY, MST);

			// T2 P1: Summon Kojikocy, enter BP
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);

			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);

			const dsStartIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
			const dsEndIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepEnd);
			const battleMsgIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgBattle);

			expect(dsStartIdx).toBeGreaterThanOrEqual(0);
			expect(dsEndIdx).toBeGreaterThan(dsStartIdx);
			expect(battleMsgIdx).toBeGreaterThan(dsStartIdx);

			// Pre-MSG_BATTLE in-DS chain windows (substeps 1-3: ATK modifiers legal)
			const preCalcInStepChains = battleMessages
				.slice(dsStartIdx + 1, battleMsgIdx)
				.filter((m): m is YGOProMsgSelectChain => m instanceof YGOProMsgSelectChain);

			const rrInPreCalc = preCalcInStepChains.some((m) =>
				m.chains.some((c) => c.code === RUSH_RECKLESSLY),
			);

			// RR has EFFECT_FLAG_DAMAGE_STEP — must appear in at least one pre-MSG_BATTLE in-DS window
			expect(rrInPreCalc).toBe(true);
		});

		it("damage step has at least one chain pair (P1/P0 windows)", async () => {
			await driveT1Summon(duel, LIGHT_VANILLA);
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);
			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);

			const dsStartIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
			const dsEndIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepEnd);

			const inStepChains = battleMessages
				.slice(dsStartIdx + 1, dsEndIdx)
				.filter((m) => m instanceof YGOProMsgSelectChain);

			// Damage step always has at least 2 chain windows (even for vanilla battles)
			expect(inStepChains.length).toBeGreaterThanOrEqual(2);
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Test 3: Honest era probe — observed activation windows
	// ────────────────────────────────────────────────────────────────────────
	//
	// ============================================================================
	// HONEST VERDICT (2010 Edison era, post-fix):
	//
	//   Lua script: c910003001.lua — resources/current/ygopro/formats/edison/script/
	//   (assembled from evolution-assets/card-scripts/edison/c910003001.lua).
	//   The base script c37742478.lua was REVERTED to pristine modern behavior.
	//     - Pre-errata copy (910003001) has EFFECT_FLAG_DAMAGE_CAL + TIMING_DAMAGE_CAL.
	//     - Condition updated to allow PHASE_DAMAGE (substeps 1-3) AND PHASE_DAMAGE_CAL
	//       (during damage calculation).
	//
	//   ENGINE BEHAVIOR (empirically verified via window-count probe, 2026-08-01):
	//     The pre-MSG_BATTLE slice always contains 6 chain windows (3 pairs) —
	//     EFFECT_FLAG_DAMAGE_CAL does NOT insert an extra window pair. What the
	//     flag changes is Honest's ELIGIBILITY: the pre-errata copy is offered in
	//     3 of those windows (the last one, right before MSG_BATTLE, is the
	//     damage-calculation window), while the official copy is offered in only
	//     2 and never in that last window. The 3-vs-2 offer count and the
	//     last-window offer are the observable 2010 difference.
	//
	//   2010 TCG ruling: Honest can be activated "during damage calculation."
	//   In the engine this is PHASE_DAMAGE_CAL, which occurs in the pre-MSG_BATTLE
	//   cluster. After MSG_BATTLE, Honest is no longer offered (IsDamageCalculated()
	//   returns true in PHASE_DAMAGE; PHASE_DAMAGE_CAL window has already closed).
	//
	//   VERDICT:
	//     - Honest is offered in at least one pre-MSG_BATTLE chain window.
	//       (This was true with EFFECT_FLAG_DAMAGE_STEP alone, and remains true with
	//       the additional EFFECT_FLAG_DAMAGE_CAL window — the engine adds an extra
	//       chain opportunity in PHASE_DAMAGE_CAL before emitting MSG_BATTLE.)
	//     - Honest is NOT offered in post-MSG_BATTLE windows (substeps 5-6).
	// ============================================================================
	describe("Test 3: Honest era probe — activation window observation", () => {
		let duel: HeadlessDuel;

		// P0: LIGHT_VANILLA (1100 ATK) at [0], Honest (Pre-Errata 910003001) at [1] → both in opening hand
		// P1: Kojikocy (1500 ATK) at [0]
		const P0_DECK = buildDeck([LIGHT_VANILLA, HONEST_PRE_ERRATA]);
		const P1_DECK = buildDeck([KOJIKOCY]);

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("Honest is offered in at least one pre-MSG_BATTLE damage-step window (substeps 1-3 AND damage-cal window)", async () => {
			// T1 P0: Summon LIGHT_VANILLA (Honest stays in hand), end turn
			await driveT1Summon(duel, LIGHT_VANILLA);

			// T2 P1: Summon Kojikocy, BP, attack LIGHT_VANILLA
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);
			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);

			const dsStartIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
			const dsEndIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepEnd);
			const battleMsgIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgBattle);

			expect(dsStartIdx).toBeGreaterThanOrEqual(0);
			expect(dsEndIdx).toBeGreaterThan(dsStartIdx);
			expect(battleMsgIdx).toBeGreaterThan(dsStartIdx);

			// Chain windows inside DS but BEFORE MSG_BATTLE.
			// This cluster includes substeps 1-3 (EFFECT_FLAG_DAMAGE_STEP windows) AND
			// the PHASE_DAMAGE_CAL window (added by EFFECT_FLAG_DAMAGE_CAL per 2010 ruling).
			// The engine fires PHASE_DAMAGE_CAL before emitting MSG_BATTLE.
			const preCalcChains = battleMessages
				.slice(dsStartIdx + 1, battleMsgIdx)
				.filter((m): m is YGOProMsgSelectChain => m instanceof YGOProMsgSelectChain);

			// Chain windows inside DS but AFTER MSG_BATTLE (substeps 5-6).
			// Honest is NOT offered here — IsDamageCalculated() returns true in
			// PHASE_DAMAGE once MSG_BATTLE has been emitted, and PHASE_DAMAGE_CAL
			// window is closed.
			const postCalcChains = battleMessages
				.slice(battleMsgIdx + 1, dsEndIdx)
				.filter((m): m is YGOProMsgSelectChain => m instanceof YGOProMsgSelectChain);

			const honestInPreCalc = preCalcChains.some((m) =>
				m.chains.some((c) => c.code === HONEST_PRE_ERRATA),
			);
			const honestInPostCalc = postCalcChains.some((m) =>
				m.chains.some((c) => c.code === HONEST_PRE_ERRATA),
			);

			// 2010 behavior: Honest offered in pre-MSG_BATTLE windows
			// (includes both substeps 1-3 and the PHASE_DAMAGE_CAL chain window).
			expect(honestInPreCalc).toBe(true);

			// Honest is NOT offered in post-MSG_BATTLE substep 5-6 windows.
			// The PHASE_DAMAGE_CAL window fires before MSG_BATTLE, not after.
			expect(honestInPostCalc).toBe(false);
		});

		it("Honest is offered in the damage-calculation window (2010 TCG ruling — PHASE_DAMAGE_CAL, pre-MSG_BATTLE)", async () => {
			// 2010 TCG ruling: Honest can be activated "during damage calculation."
			// Engine implementation (probe-verified 2026-08-01): the pre-MSG_BATTLE
			// cluster always has 6 chain windows (3 pairs) regardless of the flag —
			// EFFECT_FLAG_DAMAGE_CAL does NOT add a window pair. It extends Honest's
			// eligibility into the LAST pre-MSG_BATTLE window (the damage-calculation
			// window): pre-errata is offered in 3 owner windows, official in only 2.
			//
			// NOTE: The previous it.failing checked for Honest in post-MSG_BATTLE windows —
			// that was the wrong window encoding. The damage-cal chain window fires
			// before MSG_BATTLE, not after.

			await driveT1Summon(duel, LIGHT_VANILLA);
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);
			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);

			const dsStartIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
			const battleMsgIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgBattle);

			expect(dsStartIdx).toBeGreaterThanOrEqual(0);
			expect(battleMsgIdx).toBeGreaterThan(dsStartIdx);

			// All pre-MSG_BATTLE in-DS chain windows (substeps 1-3 plus PHASE_DAMAGE_CAL)
			const preCalcChains = battleMessages
				.slice(dsStartIdx + 1, battleMsgIdx)
				.filter((m): m is YGOProMsgSelectChain => m instanceof YGOProMsgSelectChain);

			// 3 window pairs; EFFECT_FLAG_DAMAGE_CAL inserts NO extra pair (probe-verified).
			expect(preCalcChains.length).toBe(6);

			// Pre-errata Honest is offered in 3 pre-MSG_BATTLE windows. The official
			// copy gets only 2 (see the guard test below) — the extra offer IS the
			// 2010 ruling made observable.
			const honestWindowCount = preCalcChains.filter((m) =>
				m.chains.some((c) => c.code === HONEST_PRE_ERRATA),
			).length;
			expect(honestWindowCount).toBe(3);

			// The LAST pre-MSG_BATTLE chain window is the damage-calculation window;
			// the pre-errata copy must be offered there.
			const lastWindow = preCalcChains[preCalcChains.length - 1];
			expect(lastWindow.chains.some((c) => c.code === HONEST_PRE_ERRATA)).toBe(true);
		});

		it("official Honest (37742478, modern script) is NOT offered in the damage-calculation window — 2 offers vs pre-errata's 3", async () => {
			// Guard test: verifies Task A revert — base c37742478.lua is pristine (PHASE_DAMAGE only, not PHASE_DAMAGE_CAL).
			// Observable difference (probe-verified): both copies see the same 6 pre-MSG_BATTLE
			// windows, but the official copy is offered in only 2 of them and NEVER in the
			// last one (the damage-calculation window). If this fails, the base script was
			// not properly reverted.
			const P0_DECK_OFFICIAL = buildDeck([LIGHT_VANILLA, HONEST_OFFICIAL]);
			const P1_DECK = buildDeck([KOJIKOCY]);
			const duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK_OFFICIAL }, { main: P1_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
			});
			await driveT1Summon(duel, LIGHT_VANILLA);
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);
			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);
			const dsStartIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
			const battleIdx = battleMessages.findIndex((m) => m instanceof YGOProMsgBattle);
			expect(dsStartIdx).toBeGreaterThanOrEqual(0);
			expect(battleIdx).toBeGreaterThan(dsStartIdx);
			// Pre-MSG_BATTLE in-DS chain windows
			const preCalcChains = battleMessages
				.slice(dsStartIdx + 1, battleIdx)
				.filter((m): m is YGOProMsgSelectChain => m instanceof YGOProMsgSelectChain);
			// Same 6 windows as pre-errata — the flag never changes the window count.
			expect(preCalcChains.length).toBe(6);
			// Official Honest: offered in only 2 windows, never in the last
			// (damage-calculation) one. Pre-errata gets 3 including the last.
			const honestWindowCount = preCalcChains.filter((m) =>
				m.chains.some((c) => c.code === HONEST_OFFICIAL),
			).length;
			expect(honestWindowCount).toBe(2);
			const lastWindow = preCalcChains[preCalcChains.length - 1];
			expect(lastWindow.chains.some((c) => c.code === HONEST_OFFICIAL)).toBe(false);
			await duel.cleanup();
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Test 4: Honest resolution math
	// ────────────────────────────────────────────────────────────────────────
	//
	// Activates Honest during the damage step:
	//   P0's LIGHT_VANILLA (1100 ATK) gains Kojikocy's ATK (1500) → 2600 ATK
	//   Battle result: 2600 vs 1500 → Kojikocy destroyed, P0 monster survives
	//   Battle damage to P1: 2600 - 1500 = 1100
	//
	// TODO: Honest-vs-Honest (both players chain Honest) is a separate test
	//       scenario not implemented here.
	// ────────────────────────────────────────────────────────────────────────
	describe("Test 4: Honest resolution math — ATK gain + battle outcome + damage value", () => {
		let duel: HeadlessDuel;

		// P0: LIGHT_VANILLA (1100 ATK) at [0], Honest (Pre-Errata 910003001) at [1] → both in opening hand
		// P1: Kojikocy (1500 ATK) at [0]
		const P0_DECK = buildDeck([LIGHT_VANILLA, HONEST_PRE_ERRATA]);
		const P1_DECK = buildDeck([KOJIKOCY]);

		// Track whether we activated Honest
		let honestActivated = false;

		beforeEach(async () => {
			honestActivated = false;

			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
				// Custom auto-responder: activate Honest when P0 has a window offering it
				autoResponder: (msg: YGOProMsgResponseBase) => {
					if (msg instanceof YGOProMsgSelectChain && !honestActivated) {
						const chain = msg as YGOProMsgSelectChain;
						// Only activate for P0 (controller 0)
						if (chain.player === 0) {
							const honestEntry = chain.chains.find((c) => c.code === HONEST_PRE_ERRATA);
							if (honestEntry) {
								honestActivated = true;
								return chain.prepareResponse({
									code: honestEntry.code,
									controller: honestEntry.controller,
									location: honestEntry.location,
									sequence: honestEntry.sequence,
									desc: honestEntry.desc,
								});
							}
						}
					}
					return undefined; // fall back to built-in
				},
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("Honest grants Kojikocy ATK (1500) to LIGHT_VANILLA, Kojikocy destroyed, P1 takes 1100 damage", async () => {
			// T1 P0: Summon LIGHT_VANILLA, end turn
			await driveT1Summon(duel, LIGHT_VANILLA);

			// T2 P1: Summon Kojikocy, BP, attack LIGHT_VANILLA
			const { battleCmd } = await driveT2SummonToBP(duel, KOJIKOCY);
			const { battleMessages } = await declareAttackAndCollect(duel, battleCmd, KOJIKOCY);

			// Honest must have been activated
			if (!honestActivated) {
				throw new Error(
					"Honest was not activated during the damage step. " +
						"No chain window offered Honest for P0. " +
						"Check the pre-calc substep windows in Test 3 results.",
				);
			}

			// ── Kojikocy destroyed by battle ──────────────────────────────
			// With Honest, LIGHT_VANILLA has 2600 ATK vs Kojikocy 1500 → Kojikocy loses
			const kojiMove = battleMessages.find(
				(m): m is YGOProMsgMove =>
					m instanceof YGOProMsgMove &&
					(m as YGOProMsgMove).code === KOJIKOCY &&
					(m as YGOProMsgMove).current.location === OcgcoreScriptConstants.LOCATION_GRAVE,
			) as YGOProMsgMove | undefined;

			expect(kojiMove).toBeDefined();
			expect((kojiMove!.reason & REASON_BATTLE) !== 0).toBe(true);
			expect((kojiMove!.reason & REASON_DESTROY) !== 0).toBe(true);

			// ── LIGHT_VANILLA survives ─────────────────────────────────────
			// P0 MZONE=1 (LIGHT_VANILLA is still there).
			// P0 GY=1 because Honest itself goes to GY as the activation cost
			// (the script sends Honest to GY before the ATK gain resolves).
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
			// LIGHT_VANILLA must NOT be in GY (it survived the battle)
			const lightVanillaInGy = battleMessages.some(
				(m): m is YGOProMsgMove =>
					m instanceof YGOProMsgMove &&
					(m as YGOProMsgMove).code === LIGHT_VANILLA &&
					(m as YGOProMsgMove).current.location === OcgcoreScriptConstants.LOCATION_GRAVE,
			);
			expect(lightVanillaInGy).toBe(false);

			// ── P1 MZONE empty, GY has Kojikocy ───────────────────────────
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_GRAVE)).toBeGreaterThan(0);

			// ── Battle damage to P1: 2600 - 1500 = 1100 ───────────────────
			// MSG_DAMAGE carries player + value
			const damageMsg = battleMessages.find(
				(m): m is YGOProMsgDamage =>
					m instanceof YGOProMsgDamage && (m as YGOProMsgDamage).player === 1,
			) as YGOProMsgDamage | undefined;

			expect(damageMsg).toBeDefined();
			expect(damageMsg!.value).toBe(1100);
		});
	});
});
