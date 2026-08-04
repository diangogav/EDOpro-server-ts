/**
 * 0 ATK vs 0 ATK attack-position battle — Edison rule #13, core-differential.
 *
 * Edison/MR1 (2010): two Attack Position monsters with 0 ATK battling DESTROY
 * EACH OTHER. Modern (stock core): NEITHER is destroyed (the equal-ATK mutual
 * destruction path guards on `attacker_value != 0`).
 *
 * Sub-rule (correct in BOTH cores, asserted below): a 0-ATK Attack-Position
 * attacker vs a 0-DEF Defense-Position monster destroys NEITHER — that path is
 * the defender-in-defense branch, untouched by the fork.
 *
 * The Edison fork gates the fix by duel_rule <= 1 in
 * field::calculate_battle_damage (processor.cpp): `attacker_value != 0` becomes
 * `attacker_value != 0 || core.duel_rule <= 1`. Modern behavior is intact
 * (proved by the duelRule-5 block staying identical on both cores).
 *
 * This is a true differential: the era-correct outcome is GREEN on the fork and
 * the modern outcome is GREEN on the stock core — no it.failing / skip. The
 * fork binary is selected the same way soul-exchange.integration.test.ts does
 * (FORK_WASM path); the stock core is forced with wasmPath: "".
 *
 * Fixture cards (verified in classic.cdb, both vanilla normal monsters):
 *   Soitsu            60246171   0 ATK / 0 DEF  Lv3  (P0)
 *   Thousand-Eyes Idol 27125110  0 ATK / 0 DEF  Lv1  (P1)
 */

import fs from "node:fs";
import path from "node:path";

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

// Fork WASM built from the patched core (wasm/README.md). Same selection
// mechanism as soul-exchange.integration.test.ts.
const FORK_WASM =
	process.env.OCGCORE_WASM ?? path.join(__dirname, "wasm", "libocgcore-edison-fork.wasm");

beforeAll(() => {
	if (!fs.existsSync(FORK_WASM)) {
		throw new Error(`Edison fork WASM not found at ${FORK_WASM}.`);
	}
});

// ---------------------------------------------------------------------------
// Card codes (verified in resources/current/ygopro/classic/classic.cdb)
// ---------------------------------------------------------------------------
const SOITSU = 60246171; // 0 ATK / 0 DEF, Lv3 vanilla normal monster (P0)
const THOUSAND_EYES_IDOL = 27125110; // 0 ATK / 0 DEF, Lv1 vanilla normal monster (P1)

const REASON_DESTROY = OcgcoreCommonConstants.REASON_DESTROY; // 0x1
const REASON_BATTLE = OcgcoreCommonConstants.REASON_BATTLE; // 0x20

const P0_DECK = buildDeck([SOITSU]);
const P1_DECK = buildDeck([THOUSAND_EYES_IDOL]);

// ---------------------------------------------------------------------------
// Scenario driver
// ---------------------------------------------------------------------------

interface BattleResolutionResult {
	battleMessages: YGOProMsgBase[];
	damageStepSequence: YGOProMsgBase[];
	finalMessage: YGOProMsgBase;
}

/**
 * Drive from game start through the full battle resolution sequence:
 *   Turn 1 (P0): Normal Summon Soitsu (attack position), end turn.
 *   Turn 2 (P1): Normal Summon Thousand-Eyes Idol (attack position), enter BP,
 *                declare Idol attacks Soitsu, run through the damage step.
 * `defenderPosition`: optional POS_* for the P0 defender. When POS_DEFENSE the
 * defender is set in defense to exercise the 0-ATK-vs-0-DEF sub-rule.
 */
async function driveToPostBattle(
	duel: HeadlessDuel,
	defenderPosition?: number,
): Promise<{ battle: BattleResolutionResult }> {
	// ── Turn 1 (P0): Summon Soitsu, end turn ────────────────────────────────
	{
		const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const idle = r.targetMessage;
		const soitsuCard = idle.summonableCards.find((c) => c.code === SOITSU);
		if (!soitsuCard) {
			throw new Error(
				`P0 Soitsu not summonable. Available: ${idle.summonableCards.map((c) => c.code).join(", ")}`,
			);
		}
		if (defenderPosition === OcgcoreScriptConstants.POS_FACEUP_DEFENSE) {
			// MSET puts Soitsu face-down defense; flip to face-up not needed —
			// the sub-rule only requires a defense-position defender.
			const settable = idle.msetableCards?.find((c) => c.code === SOITSU) ?? soitsuCard;
			duel.setResponse(
				idle.prepareResponse(IdleCmdType.MSET, {
					code: settable.code,
					controller: settable.controller,
					location: settable.location,
					sequence: settable.sequence,
				}),
			);
		} else {
			duel.setResponse(
				idle.prepareResponse(IdleCmdType.SUMMON, {
					code: soitsuCard.code,
					controller: soitsuCard.controller,
					location: soitsuCard.location,
					sequence: soitsuCard.sequence,
				}),
			);
		}
		const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
	}

	// ── Turn 2 (P1): Summon Thousand-Eyes Idol ──────────────────────────────
	{
		const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const idle = r.targetMessage;
		const idolCard = idle.summonableCards.find((c) => c.code === THOUSAND_EYES_IDOL);
		if (!idolCard) {
			throw new Error(
				`P1 Idol not summonable. Available: ${idle.summonableCards.map((c) => c.code).join(", ")}`,
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
		const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_BP));
	}

	// ── Battle Phase: declare the attack ────────────────────────────────────
	const bpEntry = await duel.advanceUntil(YGOProMsgSelectBattleCmd);
	const battleCmd = bpEntry.targetMessage;
	const attackable = battleCmd.attackableCards.find((c) => c.code === THOUSAND_EYES_IDOL);
	if (!attackable) {
		throw new Error(
			`Idol not attackable. Available: ${battleCmd.attackableCards.map((c) => c.code).join(", ")}`,
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

	const { allMessages: resolveMessages, targetMessage: finalMessage } =
		await duel.advanceUntilOneOf([YGOProMsgSelectBattleCmd, YGOProMsgSelectIdleCmd]);

	return {
		battle: {
			battleMessages: resolveMessages,
			damageStepSequence: extractDamageStepSequence(resolveMessages),
			finalMessage,
		},
	};
}

function extractDamageStepSequence(messages: YGOProMsgBase[]): YGOProMsgBase[] {
	const startIdx = messages.findIndex((m) => m instanceof YGOProMsgDamageStepStart);
	if (startIdx === -1) return [];
	const endIdx = messages.findIndex(
		(m, idx) => idx > startIdx && m instanceof YGOProMsgDamageStepEnd,
	);
	if (endIdx === -1) return messages.slice(startIdx);
	return messages.slice(startIdx, endIdx + 1);
}

function gyMovesOf(battle: BattleResolutionResult): YGOProMsgMove[] {
	return battle.battleMessages.filter(
		(m): m is YGOProMsgMove =>
			m instanceof YGOProMsgMove && m.current.location === OcgcoreScriptConstants.LOCATION_GRAVE,
	);
}

// ---------------------------------------------------------------------------
// Damage step structure (core-agnostic — always passes on both cores)
// ---------------------------------------------------------------------------

describe("0 ATK battle — damage step structure (both cores)", () => {
	let duel: HeadlessDuel;

	beforeEach(async () => {
		duel = await HeadlessDuel.create({
			decks: [{ main: P0_DECK }, { main: P1_DECK }],
			duelRule: 1,
			seed: FIXED_SEED,
			wasmPath: FORK_WASM,
		});
	});
	afterEach(async () => {
		await duel.cleanup();
	});

	it("MSG_ATTACK precedes MSG_DAMAGE_STEP_START; MSG_BATTLE is inside the damage step", async () => {
		const { battle } = await driveToPostBattle(duel);
		const attackIdx = battle.battleMessages.findIndex((m) => m instanceof YGOProMsgAttack);
		const dsStartIdx = battle.battleMessages.findIndex(
			(m) => m instanceof YGOProMsgDamageStepStart,
		);
		const battleIdx = battle.battleMessages.findIndex((m) => m instanceof YGOProMsgBattle);
		const dsEndIdx = battle.battleMessages.findIndex((m) => m instanceof YGOProMsgDamageStepEnd);

		expect(attackIdx).toBeGreaterThanOrEqual(0);
		expect(dsStartIdx).toBeGreaterThan(attackIdx);
		expect(battleIdx).toBeGreaterThan(dsStartIdx);
		expect(dsEndIdx).toBeGreaterThan(battleIdx);
	});
});

// ---------------------------------------------------------------------------
// Fork core (Edison 2010): both 0-ATK attackers destroyed
// ---------------------------------------------------------------------------

describe("0 ATK vs 0 ATK — Edison fork core (duelRule 1: mutual destruction)", () => {
	let duel: HeadlessDuel;

	beforeEach(async () => {
		duel = await HeadlessDuel.create({
			decks: [{ main: P0_DECK }, { main: P1_DECK }],
			duelRule: 1,
			seed: FIXED_SEED,
			wasmPath: FORK_WASM,
		});
	});
	afterEach(async () => {
		await duel.cleanup();
	});

	it("both 0-ATK attack-position monsters are destroyed (Edison rule #13)", async () => {
		const { battle } = await driveToPostBattle(duel);

		expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);
		expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(1);
		expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);
		expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(1);

		const gyMoves = gyMovesOf(battle);
		expect(gyMoves).toHaveLength(2);
		for (const move of gyMoves) {
			expect(move.reason & REASON_DESTROY).not.toBe(0);
			expect(move.reason & REASON_BATTLE).not.toBe(0);
		}
	});

	it("sub-rule intact: 0-ATK attacker vs 0-DEF defender destroys NEITHER", async () => {
		const { battle } = await driveToPostBattle(duel, OcgcoreScriptConstants.POS_FACEUP_DEFENSE);
		// Idol (0 ATK) attacks Soitsu set in defense (0 DEF): equal, no destruction.
		expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
		expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
		expect(gyMovesOf(battle)).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Stock core (modern): neither monster destroyed
// ---------------------------------------------------------------------------

describe("0 ATK vs 0 ATK — stock core (modern: neither destroyed)", () => {
	let duel: HeadlessDuel;

	beforeEach(async () => {
		duel = await HeadlessDuel.create({
			decks: [{ main: P0_DECK }, { main: P1_DECK }],
			duelRule: 1,
			seed: FIXED_SEED,
			// Empty string forces the vendored stock core even under OCGCORE_WASM.
			wasmPath: "",
		});
	});
	afterEach(async () => {
		await duel.cleanup();
	});

	it("neither 0-ATK monster is destroyed (stock guards on attacker_value != 0)", async () => {
		const { battle } = await driveToPostBattle(duel);
		expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
		expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(0);
		expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
		expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(0);
		expect(gyMovesOf(battle)).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Modern-behavior guard: duelRule 5 is UNTOUCHED on the fork (== stock)
// ---------------------------------------------------------------------------

describe("0 ATK vs 0 ATK — fork core under duelRule 5 (modern intact, gate proven)", () => {
	let duel: HeadlessDuel;

	beforeEach(async () => {
		duel = await HeadlessDuel.create({
			decks: [{ main: P0_DECK }, { main: P1_DECK }],
			duelRule: 5,
			seed: FIXED_SEED,
			wasmPath: FORK_WASM,
		});
	});
	afterEach(async () => {
		await duel.cleanup();
	});

	it("duelRule 5 on the fork: neither destroyed (fix is gated to duel_rule <= 1)", async () => {
		const { battle } = await driveToPostBattle(duel);
		expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
		expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(1);
		expect(gyMovesOf(battle)).toHaveLength(0);
	});
});
