/**
 * MR1 single face-up field spell rule (Edison rule) — Slice 3
 *
 * Core behavior (processor.cpp:4539-4545, gated duel_rule <= 2):
 * When a Field Spell ACTIVATION resolves, the opponent's face-up Field Spell
 * is destroyed by rule (REASON_RULE). Setting a Field Spell face-down destroys
 * nothing. Under duel_rule >= 3 both field spells coexist.
 *
 * Fixture cards (verified in resources/current/ygopro/classic/classic.cdb,
 * scripts in resources/current/ygopro/base/script/):
 *   Sogen 86318356 — vanilla continuous-stat-mod field spell (P0's deck)
 *   Yami  59197169 — vanilla continuous-stat-mod field spell (P1's deck)
 *
 * LOCATION DISCOVERY (confirmed via diagnostic probing):
 *   Field spells in this engine version land in LOCATION_SZONE (8) at
 *   sequence=5, NOT in LOCATION_FZONE (256). queryFieldCount with
 *   LOCATION_FZONE always returns 0 for active field spells.
 *   All location assertions in this file use LOCATION_SZONE.
 *
 * OBSERVED MESSAGE FLOW for field spell activation / rule-based destruction:
 *
 *   T1 P0 activates Sogen:
 *     MSG_MOVE: Sogen HAND(loc=2,seq=0) → SZONE(loc=8,seq=5) reason=0x2000200
 *     YGOProMsgChaining / YGOProMsgChained
 *     SelectChain(count=0) × 2   ← empty windows, auto-declined
 *     ChainSolving / ChainSolved / ChainEnd
 *     SelectChain(count=0) × 2   ← post-resolution empty windows
 *     SelectIdleCmd
 *
 *   T2 P1 activates Yami (MR1, rule-destruction fires):
 *     MSG_MOVE: Yami  HAND(loc=2,seq=0) → SZONE(loc=8,seq=5) reason=0x2000400
 *     YGOProMsgChaining / YGOProMsgChained
 *     SelectChain(count=0) × 2   ← empty windows, auto-declined
 *     ChainSolving / ChainSolved
 *     MSG_MOVE: Sogen SZONE(loc=8,seq=5) → GRAVE(loc=16,seq=0) reason=0x401
 *       ↑ REASON_RULE(0x400)|REASON_DESTROY(0x1) — rule-based destruction
 *     ChainEnd
 *     SelectChain(count=0) × 2
 *     SelectIdleCmd
 *
 *   T2 P1 SETS Yami face-down (no rule-destruction):
 *     MSG_MOVE: Yami  HAND(loc=2,seq=0) → SZONE(loc=8,seq=5) reason=0x2000400
 *     MSG_SET
 *     SelectChain(count=0) × 2
 *     SelectIdleCmd
 *     (no Sogen destruction MSG_MOVE — both SZONE counts remain 1)
 *
 *   T2 P1 activates Yami (duelRule=5, no rule-destruction):
 *     MSG_MOVE: Yami  HAND → SZONE(seq=5) reason=0x2000400
 *     Chaining/Chained/SelectChain × 2 / ChainSolving/ChainSolved/ChainEnd
 *     SelectChain × 2 / SelectIdleCmd
 *     (no Sogen destruction — both P0.SZONE=1, P1.SZONE=1, P0.GRAVE=0)
 *
 * REASON BITMASKS (confirmed from OcgcoreCommonConstants):
 *   REASON_RULE    = 0x400  (1024)
 *   REASON_DESTROY = 0x1   (1)
 *   REASON_EFFECT  = 0x40  (64)
 *   Sogen destruction reason = 0x401 = REASON_RULE | REASON_DESTROY
 *   The REASON_EFFECT bit is NOT set → this is a rule-based destruction,
 *   not a card-effect destruction.
 */

import {
	YGOProMsgSelectIdleCmd,
	YGOProMsgMove,
	IdleCmdType,
	OcgcoreCommonConstants,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";
import { _OcgcoreConstants } from "koishipro-core.js";
import { HeadlessDuel } from "./headless-duel";
import { FIXED_SEED, buildDeck } from "./test-fixtures";

const { OcgcoreScriptConstants } = _OcgcoreConstants;

jest.setTimeout(60_000);

// ---------------------------------------------------------------------------
// Card codes (verified in classic.cdb + scripts present in base/script/)
// ---------------------------------------------------------------------------
const SOGEN = 86318356; // P0's field spell
const YAMI = 59197169; // P1's field spell

// ---------------------------------------------------------------------------
// Constants (verified via OcgcoreCommonConstants and engine probe)
// ---------------------------------------------------------------------------

// Reason bitmasks for MSG_MOVE.reason on Sogen's rule-destruction:
//   reason = 0x401 = REASON_RULE(0x400) | REASON_DESTROY(0x1)
const REASON_RULE = OcgcoreCommonConstants.REASON_RULE; // 1024 = 0x400
const REASON_EFFECT = OcgcoreCommonConstants.REASON_EFFECT; // 64 = 0x40
const REASON_DESTROY = OcgcoreCommonConstants.REASON_DESTROY; // 1 = 0x1

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

// P0 deck: Sogen at positions 0-2 (3 copies in opening hand slots)
// Opening hand is deck[0..4]; T1 draw is deck[5].
const P0_DECK = buildDeck([SOGEN, SOGEN, SOGEN]);

// P1 deck: Yami at positions 0-2 (3 copies in opening hand slots)
const P1_DECK = buildDeck([YAMI, YAMI, YAMI]);

// ---------------------------------------------------------------------------
// Helper: drive Turn 1 (P0 activates Sogen, ends turn)
// ---------------------------------------------------------------------------

/**
 * Drive from game start through Turn 1 where P0 activates Sogen:
 *   1. Advance to first SelectIdleCmd (T1, P0)
 *   2. Activate Sogen (ACTIVATE idle cmd)
 *   3. Advance through activation resolution (SelectPlace auto-handled,
 *      empty SelectChain windows auto-declined) to next SelectIdleCmd
 *   4. End Turn 1 (TO_EP)
 *
 * Returns all messages collected and a flag indicating Sogen was found
 * in the activatable list.
 */
async function driveP0Turn1ActivateSogen(
	duel: HeadlessDuel,
): Promise<{ allMessages: YGOProMsgBase[]; activationFound: boolean }> {
	const allMessages: YGOProMsgBase[] = [];

	// Advance to first SelectIdleCmd (T1, P0)
	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMessages.push(...r1.allMessages);
	const idle1 = r1.targetMessage;

	// Find Sogen in activatable cards
	const sogenCard = idle1.activatableCards.find((c) => c.code === SOGEN);
	if (!sogenCard) {
		return { allMessages, activationFound: false };
	}

	// Activate Sogen — engine emits SelectPlace (field zone), handled by the
	// built-in auto-responder; then empty SelectChain windows, auto-declined;
	// Sogen resolves to SZONE sequence=5 (the field spell slot).
	duel.setResponse(
		idle1.prepareResponse(IdleCmdType.ACTIVATE, {
			code: sogenCard.code,
			controller: sogenCard.controller,
			location: sogenCard.location,
			sequence: sogenCard.sequence,
			desc: sogenCard.desc,
		}),
	);

	// Advance through activation resolution to the next SelectIdleCmd
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMessages.push(...r2.allMessages);
	const idle2 = r2.targetMessage;

	// End Turn 1
	duel.setResponse(idle2.prepareResponse(IdleCmdType.TO_EP));

	return { allMessages, activationFound: true };
}

/**
 * Drive through T1 (P0 activates Sogen) and advance to T2 P1's first
 * SelectIdleCmd. Returns all messages collected and the P1 idle command.
 */
async function driveToP1Turn(duel: HeadlessDuel): Promise<{
	allMessages: YGOProMsgBase[];
	p1Idle: YGOProMsgSelectIdleCmd;
	sogenActivated: boolean;
}> {
	const { allMessages: t1Messages, activationFound } = await driveP0Turn1ActivateSogen(duel);

	// Advance to T2 P1's SelectIdleCmd
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const allMessages = [...t1Messages, ...r.allMessages];

	return { allMessages, p1Idle: r.targetMessage, sogenActivated: activationFound };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MR1 single face-up field spell rule (Edison rule)", () => {
	// ── Test 1: Activation destroys opponent's field spell ───────────────────

	describe("activation destroys opponent's field spell", () => {
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

		it("when P1 activates Yami, Sogen moves to P0 GY and Yami occupies P1 field spell slot", async () => {
			// Setup: T1 P0 activates Sogen, advance to T2 P1's SelectIdleCmd
			const { p1Idle, sogenActivated } = await driveToP1Turn(duel);

			// Guard: Sogen activation must have succeeded
			expect(sogenActivated).toBe(true);

			// After T1 Sogen activation: P0's field spell slot (SZONE seq=5) is occupied
			// NOTE: This engine version places active field spells in LOCATION_SZONE (8) at
			// sequence=5, not LOCATION_FZONE (256). LOCATION_FZONE always returns 0.
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_SZONE)).toBe(1);

			// Find Yami in P1's activatable cards
			const yamiCard = p1Idle.activatableCards.find((c) => c.code === YAMI);
			expect(yamiCard).toBeDefined();

			// P1 activates Yami — engine resolves it, then destroys Sogen by rule
			duel.setResponse(
				p1Idle.prepareResponse(IdleCmdType.ACTIVATE, {
					code: yamiCard!.code,
					controller: yamiCard!.controller,
					location: yamiCard!.location,
					sequence: yamiCard!.sequence,
					desc: yamiCard!.desc,
				}),
			);

			// Advance through activation resolution to the next SelectIdleCmd
			await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// --- Assertions: field state after P1 Yami activation ---

			// Sogen destroyed by rule → P0 GY count > 0
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBeGreaterThan(0);

			// Sogen removed from P0 field spell slot → P0 SZONE = 0
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_SZONE)).toBe(0);

			// Yami now occupies P1's field spell slot (SZONE)
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_SZONE)).toBe(1);
		});
	});

	// ── Test 2: Destruction reason is REASON_RULE ────────────────────────────

	describe("destruction reason is REASON_RULE", () => {
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

		it("MSG_MOVE for Sogen going to GY has REASON_RULE set and REASON_EFFECT clear", async () => {
			// Setup: T1 P0 activates Sogen, advance to T2 P1's SelectIdleCmd
			const { p1Idle } = await driveToP1Turn(duel);

			// Find Yami in P1's activatable cards
			const yamiCard = p1Idle.activatableCards.find((c) => c.code === YAMI);
			expect(yamiCard).toBeDefined();

			// P1 activates Yami
			duel.setResponse(
				p1Idle.prepareResponse(IdleCmdType.ACTIVATE, {
					code: yamiCard!.code,
					controller: yamiCard!.controller,
					location: yamiCard!.location,
					sequence: yamiCard!.sequence,
					desc: yamiCard!.desc,
				}),
			);

			// Collect all messages through activation resolution
			const { allMessages: resolveMessages } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// Find MSG_MOVE for Sogen going to GY
			// Observed: MSG_MOVE code=86318356 prev=(loc=8=SZONE,seq=5) → curr=(loc=16=GRAVE,seq=0)
			// reason=0x401 = REASON_RULE(0x400) | REASON_DESTROY(0x1)
			const sogenDestroyMove = resolveMessages
				.filter((m): m is YGOProMsgMove => m instanceof YGOProMsgMove)
				.find(
					(m) =>
						m.code === SOGEN && (m.current.location & OcgcoreScriptConstants.LOCATION_GRAVE) !== 0,
				);

			// MSG_MOVE for Sogen's rule-based destruction must be present in decoded messages.
			// If this assertion fails, the engine is not surfacing the destruction as a
			// standalone MSG_MOVE visible to clients — document the finding in the test output.
			if (sogenDestroyMove === undefined) {
				const allMoves = resolveMessages.filter(
					(m): m is YGOProMsgMove => m instanceof YGOProMsgMove,
				);
				fail(
					`Expected MSG_MOVE for Sogen (${SOGEN}) to GY not found in decoded messages. ` +
						`All moves: ${allMoves
							.map(
								(m) =>
									`code=${m.code} prev_loc=${m.previous.location} curr_loc=${m.current.location} reason=0x${m.reason.toString(16)}`,
							)
							.join("; ")}`,
				);
			}

			// REASON_RULE bit (0x400 = 1024) must be set
			expect(sogenDestroyMove.reason & REASON_RULE).not.toBe(0);

			// REASON_DESTROY bit (0x1) must be set (this is a destruction move)
			expect(sogenDestroyMove.reason & REASON_DESTROY).not.toBe(0);

			// REASON_EFFECT bit (0x40 = 64) must NOT be set (rule-based, not an effect)
			expect(sogenDestroyMove.reason & REASON_EFFECT).toBe(0);
		});
	});

	// ── Test 3: Setting does NOT destroy the opponent's field spell ──────────

	describe("setting does NOT destroy opponent field spell", () => {
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

		it("when P1 sets Yami face-down, Sogen remains in field spell slot and P0 GY is empty", async () => {
			// Setup: T1 P0 activates Sogen, advance to T2 P1's SelectIdleCmd
			const { p1Idle, sogenActivated } = await driveToP1Turn(duel);

			expect(sogenActivated).toBe(true);

			// Sogen is in P0's field spell slot before P1 acts
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_SZONE)).toBe(1);

			// Find Yami in P1's ssetable cards (spell/trap face-down set)
			const yamiSset = p1Idle.ssetableCards.find((c) => c.code === YAMI);
			expect(yamiSset).toBeDefined();

			// P1 sets Yami face-down — this must NOT trigger rule-based destruction
			duel.setResponse(
				p1Idle.prepareResponse(IdleCmdType.SSET, {
					code: yamiSset!.code,
					controller: yamiSset!.controller,
					location: yamiSset!.location,
					sequence: yamiSset!.sequence,
				}),
			);

			// Advance to next SelectIdleCmd after set action resolves
			await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// --- Assertions after P1 SET ---

			// Sogen still in P0's field spell slot (NOT destroyed)
			// NOTE: After Yami is set, the engine still reports P0.SZONE=1 (Sogen's slot)
			// and P1.SZONE=1 (Yami's set slot). Both use LOCATION_SZONE since SSET puts
			// a face-down spell in seq=5 just like activation does.
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_SZONE)).toBe(1);

			// P0 GY must be empty (Sogen was NOT destroyed)
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(0);

			// Yami is face-down in P1's field spell slot
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_SZONE)).toBe(1);
		});
	});

	// ── Test 4: Differential — duelRule 5, both field spells coexist ─────────

	describe("differential — duelRule 5 allows both field spells simultaneously", () => {
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

		it("with duelRule 5, P1 activates Yami and Sogen is NOT destroyed — both occupy field spell slots", async () => {
			// Setup: T1 P0 activates Sogen, advance to T2 P1's SelectIdleCmd
			const { p1Idle, sogenActivated } = await driveToP1Turn(duel);

			expect(sogenActivated).toBe(true);

			// Sogen in P0's field spell slot under duelRule 5 too
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_SZONE)).toBe(1);

			// Find Yami in P1's activatable cards
			const yamiCard = p1Idle.activatableCards.find((c) => c.code === YAMI);
			expect(yamiCard).toBeDefined();

			// P1 activates Yami — under duelRule=5 no rule-based destruction fires
			duel.setResponse(
				p1Idle.prepareResponse(IdleCmdType.ACTIVATE, {
					code: yamiCard!.code,
					controller: yamiCard!.controller,
					location: yamiCard!.location,
					sequence: yamiCard!.sequence,
					desc: yamiCard!.desc,
				}),
			);

			// Collect all messages through activation resolution
			const { allMessages: resolveMessages } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// --- Differential assertions ---

			// Sogen must NOT be destroyed — still in P0's field spell slot
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_SZONE)).toBe(1);

			// P0 GY must be empty (Sogen was NOT destroyed)
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBe(0);

			// Yami occupies P1's field spell slot
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_SZONE)).toBe(1);

			// No MSG_MOVE for Sogen going to GY (confirm rule-destruction did NOT fire)
			const sogenDestroyMove = resolveMessages
				.filter((m): m is YGOProMsgMove => m instanceof YGOProMsgMove)
				.find(
					(m) =>
						m.code === SOGEN && (m.current.location & OcgcoreScriptConstants.LOCATION_GRAVE) !== 0,
				);
			expect(sogenDestroyMove).toBeUndefined();
		});
	});
});
