/**
 * 0 ATK vs 0 ATK attack-position battle — Slice 4 (UNGATED era rule probe)
 *
 * Edison/MR1 rule (2010): two Attack Position monsters with 0 ATK battling
 * DESTROY EACH OTHER. Modern rule: NEITHER is destroyed.
 *
 * CRITICAL: unlike ignition priority and the field spell rule, the core does
 * NOT gate this behavior by duel_rule. It has a single implementation path
 * for ATK=0 vs ATK=0 battles.
 *
 * ============================================================================
 * THE VERDICT (confirmed by live engine probe):
 *
 * The bundled WASM core implements MODERN behavior:
 *   → NEITHER monster is destroyed in a 0 ATK vs 0 ATK battle.
 *   → P0 MZONE=1, P0 GRAVE=0, P1 MZONE=1, P1 GRAVE=0 after battle.
 *   → NO MSG_MOVE to GY is emitted during the damage step.
 *   → The behavior is IDENTICAL under duelRule 1 and duelRule 5 (ungated).
 *
 * ROADMAP IMPLICATION: The current WASM core does NOT implement the
 * Edison-correct mutual-destruction rule for 0 ATK vs 0 ATK battles.
 * A core fork or patch is needed to restore Edison behavior. This test
 * documents the ACTUAL observed behavior for tracking purposes and uses
 * it.failing() to mark the ERA-CORRECT assertions so CI stays green while
 * flagging the gap explicitly.
 * ============================================================================
 *
 * Fixture cards (verified in classic.cdb, both vanilla normal monsters, 0/0):
 *   Soitsu            60246171   0 ATK / 0 DEF  Lv3  (P0)
 *   Thousand-Eyes Idol 27125110  0 ATK / 0 DEF  Lv1  (P1)
 *
 * Duel script:
 *   Turn 1 (P0): Normal Summon Soitsu (attack position), end turn.
 *   Turn 2 (P1): Normal Summon Thousand-Eyes Idol (attack position),
 *                enter Battle Phase (TO_BP), declare Idol attacks Soitsu,
 *                auto-respond any windows, reach end of battle resolution.
 *
 * OBSERVED MESSAGE FLOW (duelRule 1 and duelRule 5 — identical):
 *   [SelectBattleCmd] → ATTACK response →
 *   [0]  YGOProMsgHint
 *   [1]  YGOProMsgSelectCard          ← defender selection (auto-responded)
 *   [2]  YGOProMsgAttack              ← attack declared
 *   [3]  SelectChain(p=1, count=0)   ← empty window
 *   [4]  SelectChain(p=0, count=0)   ← empty window
 *   [5]  YGOProMsgHint
 *   [6]  YGOProMsgHint
 *   [7]  SelectChain(p=1, count=0)
 *   [8]  SelectChain(p=0, count=0)
 *   [9]  YGOProMsgDamageStepStart    ← damage step begins
 *   [10] YGOProMsgHint
 *   [11] YGOProMsgHint
 *   [12] SelectChain(p=1, count=0)
 *   [13] SelectChain(p=0, count=0)
 *   [14] YGOProMsgHint
 *   [15] YGOProMsgHint
 *   [16] SelectChain(p=1, count=0)
 *   [17] SelectChain(p=0, count=0)
 *   [18] YGOProMsgHint
 *   [19] YGOProMsgHint
 *   [20] SelectChain(p=1, count=0)
 *   [21] SelectChain(p=0, count=0)
 *   [22] YGOProMsgBattle              ← ATK comparison inside damage step
 *   [23] YGOProMsgHint
 *   [24] YGOProMsgHint
 *   [25] SelectChain(p=1, count=0)
 *   [26] SelectChain(p=0, count=0)
 *   [27] YGOProMsgHint
 *   [28] YGOProMsgHint
 *   [29] SelectChain(p=1, count=0)
 *   [30] SelectChain(p=0, count=0)
 *   [31] YGOProMsgDamageStepEnd      ← damage step ends, NO GY moves
 *   [32] SelectBattleCmd (attackableCards=[], canEp=1)
 *   → No MSG_MOVE to GY for either monster
 *   → P0 MZONE=1, P1 MZONE=1 (neither destroyed)
 *
 * NOTE on MSG_BATTLE position: MSG_BATTLE appears INSIDE the damage step
 * (between DamageStepStart and DamageStepEnd), not before DamageStepStart.
 * MSG_ATTACK precedes DamageStepStart; MSG_BATTLE follows it.
 *
 * REASON BITMASKS (from OcgcoreCommonConstants, for reference):
 *   REASON_DESTROY = 0x1   (1)
 *   REASON_BATTLE  = 0x20  (32)
 */

import {
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectBattleCmd,
	YGOProMsgMove,
	YGOProMsgDamageStepStart,
	YGOProMsgDamageStepEnd,
	YGOProMsgAttack,
	YGOProMsgBattle,
	IdleCmdType,
	BattleCmdType,
	OcgcoreCommonConstants,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";
import { _OcgcoreConstants } from "koishipro-core.js";
import { HeadlessDuel } from "./headless-duel";
import { FIXED_SEED, buildDeck } from "./test-fixtures";

const { OcgcoreScriptConstants } = _OcgcoreConstants;

jest.setTimeout(60_000);

// ---------------------------------------------------------------------------
// Card codes (both verified in resources/current/ygopro/classic/classic.cdb)
// ---------------------------------------------------------------------------
const SOITSU = 60246171; // 0 ATK / 0 DEF, Lv3 vanilla normal monster (P0)
const THOUSAND_EYES_IDOL = 27125110; // 0 ATK / 0 DEF, Lv1 vanilla normal monster (P1)

// ---------------------------------------------------------------------------
// Reason bitmasks (from OcgcoreCommonConstants)
// ---------------------------------------------------------------------------
const REASON_DESTROY = OcgcoreCommonConstants.REASON_DESTROY; // 1 = 0x1
const REASON_BATTLE = OcgcoreCommonConstants.REASON_BATTLE; // 32 = 0x20

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

// P0 deck: Soitsu at position 0 → opens in hand (first drawn card)
const P0_DECK = buildDeck([SOITSU]);

// P1 deck: Thousand-Eyes Idol at position 0 → opens in hand
const P1_DECK = buildDeck([THOUSAND_EYES_IDOL]);

// ---------------------------------------------------------------------------
// Scenario driver
// ---------------------------------------------------------------------------

/**
 * Result returned after driving through the battle resolution.
 *
 * battleMessages: all messages from the ATTACK declaration response through
 *   the next SelectBattleCmd or SelectIdleCmd (exclusive — the stop message
 *   is in finalMessage, not in battleMessages).
 * damageStepSequence: ordered sub-slice of battleMessages spanning from
 *   MSG_DAMAGE_STEP_START to MSG_DAMAGE_STEP_END inclusive. Exposed for
 *   damage-step sub-step assertions in future slices.
 * finalMessage: the SelectBattleCmd or SelectIdleCmd that terminated the drive.
 */
interface BattleResolutionResult {
	battleMessages: YGOProMsgBase[];
	damageStepSequence: YGOProMsgBase[];
	finalMessage: YGOProMsgBase;
}

/**
 * Drive from game start through the full battle resolution sequence:
 *   Turn 1 (P0): Normal Summon Soitsu, end turn.
 *   Turn 2 (P1): Normal Summon Thousand-Eyes Idol, enter BP, declare attack,
 *                run through damage step, collect battle messages.
 *
 * Any intermediate SelectChain / SelectEffectYn / SelectYesNo windows
 * (e.g. damage-step optional effects) are auto-declined by the built-in
 * auto-responder. SelectCard (defender selection prompt) is also auto-handled.
 */
async function driveToPostBattle(duel: HeadlessDuel): Promise<{
	setupMessages: YGOProMsgBase[];
	battle: BattleResolutionResult;
}> {
	const setupMessages: YGOProMsgBase[] = [];

	// ── Turn 1 (P0): Summon Soitsu, end turn ─────────────────────────────────
	{
		const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		setupMessages.push(...r.allMessages);
		const idle = r.targetMessage;

		const soitsuCard = idle.summonableCards.find((c) => c.code === SOITSU);
		if (!soitsuCard) {
			throw new Error(
				`P0 Soitsu (${SOITSU}) not found in summonableCards. ` +
					`Available: ${idle.summonableCards.map((c) => c.code).join(", ")}`,
			);
		}
		duel.setResponse(
			idle.prepareResponse(IdleCmdType.SUMMON, {
				code: soitsuCard.code,
				controller: soitsuCard.controller,
				location: soitsuCard.location,
				sequence: soitsuCard.sequence,
			}),
		);

		// Advance through post-summon chain windows to next SelectIdleCmd
		const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		setupMessages.push(...r2.allMessages);
		// End Turn 1
		duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
	}

	// ── Turn 2 (P1): Summon Thousand-Eyes Idol ───────────────────────────────
	{
		const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		setupMessages.push(...r.allMessages);
		const idle = r.targetMessage;

		const idolCard = idle.summonableCards.find((c) => c.code === THOUSAND_EYES_IDOL);
		if (!idolCard) {
			throw new Error(
				`P1 Thousand-Eyes Idol (${THOUSAND_EYES_IDOL}) not found in summonableCards. ` +
					`Available: ${idle.summonableCards.map((c) => c.code).join(", ")}`,
			);
		}
		duel.setResponse(
			idle.prepareResponse(IdleCmdType.SUMMON, {
				code: idolCard.code,
				controller: idolCard.controller,
				location: idolCard.location,
				sequence: idolCard.sequence,
			}),
		);

		// Advance through post-summon chain windows to next SelectIdleCmd
		const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		setupMessages.push(...r2.allMessages);
		// Enter Battle Phase
		duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_BP));
	}

	// ── Battle Phase: get SelectBattleCmd ────────────────────────────────────
	const bpEntry = await duel.advanceUntil(YGOProMsgSelectBattleCmd);
	setupMessages.push(...bpEntry.allMessages);
	const battleCmd = bpEntry.targetMessage;

	// Validate: Thousand-Eyes Idol must be attackable
	const attackable = battleCmd.attackableCards.find((c) => c.code === THOUSAND_EYES_IDOL);
	if (!attackable) {
		throw new Error(
			`Thousand-Eyes Idol (${THOUSAND_EYES_IDOL}) not found in attackableCards. ` +
				`Available: ${battleCmd.attackableCards.map((c) => c.code).join(", ")}`,
		);
	}

	// Declare attack. The engine auto-selects Soitsu as the only defender;
	// the SelectCard prompt (defender selection) is handled by the built-in
	// auto-responder (picks first available card).
	duel.setResponse(
		battleCmd.prepareResponse(BattleCmdType.ATTACK, {
			code: attackable.code,
			controller: attackable.controller,
			location: attackable.location,
			sequence: attackable.sequence,
		}),
	);

	// Drive through the battle resolution: collect all messages until either
	// SelectBattleCmd (more attacks/ep available) or SelectIdleCmd (BP ended).
	// Damage step messages and MSG_MOVEs are captured here.
	const { allMessages: resolveMessages, targetMessage: finalMessage } =
		await duel.advanceUntilOneOf([YGOProMsgSelectBattleCmd, YGOProMsgSelectIdleCmd]);

	const damageStepSequence = extractDamageStepSequence(resolveMessages);

	return {
		setupMessages,
		battle: {
			battleMessages: resolveMessages,
			damageStepSequence,
			finalMessage,
		},
	};
}

/**
 * Extract the ordered sub-sequence of messages spanning from
 * MSG_DAMAGE_STEP_START to MSG_DAMAGE_STEP_END inclusive.
 *
 * Returns an empty array if the damage step messages are not present
 * (e.g. direct attack with no defender).
 */
function extractDamageStepSequence(messages: YGOProMsgBase[]): YGOProMsgBase[] {
	const startIdx = messages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
	if (startIdx === -1) {
		return [];
	}
	const endIdx = messages.findIndex(
		(m, idx) => idx > startIdx && m instanceof YGOProMsgDamageStepEnd,
	);
	if (endIdx === -1) {
		// DamageStepStart found but no End — return from start to end of array
		return messages.slice(startIdx);
	}
	return messages.slice(startIdx, endIdx + 1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("0 ATK vs 0 ATK attack-position battle (UNGATED era rule probe)", () => {
	// ── Core behavior documentation: what the engine actually does ────────────
	//
	// FINDING: The bundled WASM core implements MODERN behavior (neither
	// monster is destroyed in a 0 ATK vs 0 ATK battle). This matches the
	// post-2011 errata where ties in battle result in no destruction.
	//
	// The Edison-era correct behavior (both destroyed) is documented in the
	// it.failing() tests below. When a future core fork implements the
	// Edison rule, remove the .failing() wrapper and the tests will turn green.

	// ── Damage step structure (confirmed behavior — always passes) ────────────

	describe("damage step message structure (observed — confirmed)", () => {
		let duel: HeadlessDuel;

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

		it("MSG_ATTACK appears before MSG_DAMAGE_STEP_START", async () => {
			const { battle } = await driveToPostBattle(duel);

			const attackIdx = battle.battleMessages.findIndex((m) => m instanceof YGOProMsgAttack);
			const dsStartIdx = battle.battleMessages.findIndex(
				(m) => m instanceof YGOProMsgDamageStepStart,
			);

			expect(attackIdx).toBeGreaterThanOrEqual(0);
			expect(dsStartIdx).toBeGreaterThan(attackIdx);
		});

		it("MSG_BATTLE appears inside the damage step (between START and END)", async () => {
			const { battle } = await driveToPostBattle(duel);

			// NOTE: MSG_BATTLE occurs INSIDE the damage step in this engine version.
			// It does NOT precede DamageStepStart. This is the verified observed ordering.
			const battleIdx = battle.battleMessages.findIndex((m) => m instanceof YGOProMsgBattle);
			const dsStartIdx = battle.battleMessages.findIndex(
				(m) => m instanceof YGOProMsgDamageStepStart,
			);
			const dsEndIdx = battle.battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepEnd);

			expect(battleIdx).toBeGreaterThan(dsStartIdx);
			expect(dsEndIdx).toBeGreaterThan(battleIdx);
		});

		it("damage step sequence is present: START precedes END", async () => {
			const { battle } = await driveToPostBattle(duel);

			expect(battle.damageStepSequence.length).toBeGreaterThan(0);
			expect(battle.damageStepSequence[0]).toBeInstanceOf(YGOProMsgDamageStepStart);
			expect(battle.damageStepSequence[battle.damageStepSequence.length - 1]).toBeInstanceOf(
				YGOProMsgDamageStepEnd,
			);
		});

		it("battle resolves to SelectBattleCmd with no attackers and canEp=1", async () => {
			const { battle } = await driveToPostBattle(duel);

			// After battle resolves, engine returns SelectBattleCmd (not SelectIdleCmd).
			// The SelectBattleCmd has no attackable cards (Idol attacked this turn)
			// and canEp=1 (player can end BP).
			expect(battle.finalMessage).toBeInstanceOf(YGOProMsgSelectBattleCmd);
			const finalBc = battle.finalMessage as YGOProMsgSelectBattleCmd;
			expect(finalBc.attackableCards).toHaveLength(0);
			expect(finalBc.canEp).toBe(1);
		});
	});

	// ── Main assertion — duelRule 1 (Edison/MR1) ──────────────────────────────
	//
	// it.failing() → documents that ERA-CORRECT Edison behavior (both monsters
	// destroyed) is NOT implemented by the current core. When the core is fixed,
	// remove .failing() and this describe block will turn green.

	describe("duelRule 1: era-correct Edison behavior (FAILING — core implements modern rule)", () => {
		let duel: HeadlessDuel;

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

		// eslint-disable-next-line jest/no-disabled-tests
		it.failing("both 0-ATK monsters should be destroyed after battle (Edison rule — currently unimplemented)", async () => {
			const { battle } = await driveToPostBattle(duel);

			// Era-correct: both MZONEs empty, both GYs have 1 card
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(1);
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(1);

			// Era-correct: exactly two MSG_MOVEs to GY with REASON_BATTLE|REASON_DESTROY
			const gyMoves = battle.battleMessages.filter(
				(m): m is YGOProMsgMove =>
					m instanceof YGOProMsgMove &&
					m.current.location === OcgcoreScriptConstants.LOCATION_GRAVE,
			);
			expect(gyMoves).toHaveLength(2);

			for (const move of gyMoves) {
				expect(move.reason & REASON_DESTROY).not.toBe(0);
				expect(move.reason & REASON_BATTLE).not.toBe(0);
			}
		});
	});

	// ── Observed behavior — duelRule 1 (what the core actually does) ──────────

	describe("duelRule 1: observed behavior (MODERN — neither monster destroyed)", () => {
		let duel: HeadlessDuel;

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

		it("neither monster is destroyed (core implements modern: no GY moves, both MZONE=1)", async () => {
			const { battle } = await driveToPostBattle(duel);

			// Both monsters survive under the current core
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(0);
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(0);

			// No MSG_MOVE to GY during battle resolution
			const gyMoves = battle.battleMessages.filter(
				(m): m is YGOProMsgMove =>
					m instanceof YGOProMsgMove &&
					m.current.location === OcgcoreScriptConstants.LOCATION_GRAVE,
			);
			expect(gyMoves).toHaveLength(0);
		});
	});

	// ── Differential probe — duelRule 5 (MR2020) ─────────────────────────────
	//
	// CONFIRMS: behavior is UNGATED — identical outcome under duelRule 1 and 5.
	// Single implementation path regardless of duel_rule value.

	describe("duelRule 5: confirms ungated behavior (same as duelRule 1)", () => {
		let duel: HeadlessDuel;

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 5,
				seed: FIXED_SEED,
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("duelRule 5 produces IDENTICAL outcome to duelRule 1 (neither monster destroyed — ungated)", async () => {
			// CONFIRMED: same behavior across duelRule 1 and 5 = single implementation.
			// The rule is ungated — no era-gating on this battle resolution logic.
			const { battle } = await driveToPostBattle(duel);

			// Same observed result as duelRule 1: both survive
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(0);
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(0);

			// No GY moves either
			const gyMoves = battle.battleMessages.filter(
				(m): m is YGOProMsgMove =>
					m instanceof YGOProMsgMove &&
					m.current.location === OcgcoreScriptConstants.LOCATION_GRAVE,
			);
			expect(gyMoves).toHaveLength(0);
		});

		it("damage step sequence is present and well-formed under duelRule 5", async () => {
			const { battle } = await driveToPostBattle(duel);

			expect(battle.damageStepSequence.length).toBeGreaterThan(0);
			expect(battle.damageStepSequence[0]).toBeInstanceOf(YGOProMsgDamageStepStart);
			expect(battle.damageStepSequence[battle.damageStepSequence.length - 1]).toBeInstanceOf(
				YGOProMsgDamageStepEnd,
			);
		});
	});
});
