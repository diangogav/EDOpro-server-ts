/**
 * SEGOC (Simultaneous Effects Go On Chain) — Edison/MR1 era probe.
 *
 * Rule #7 — When multiple triggered effects activate simultaneously, they are
 * placed on the chain in SEGOC order:
 *   (1) Turn Player mandatory triggers
 *   (2) Non-Turn Player mandatory triggers
 *   (3) Turn Player optional triggers
 *   (4) Non-Turn Player optional triggers
 *
 * Sangan (26202165) has a TRIGGER_F (mandatory) effect: when sent from the field
 * to the Graveyard, the controller MUST search their deck for a monster with 1500
 * or less ATK. In SEGOC, mandatory triggers are placed automatically by the engine
 * (no SelectChain window for placement). Each placement emits a YGOProMsgChaining
 * message with the activated effect's code and a chainCount (0-indexed chain link).
 *
 * Scenario:
 *   - P0 (Turn Player on T3) has a Sangan on the field.
 *   - P1 (Non-Turn Player) has a Sangan on the field.
 *   - P0 activates Dark Hole (T3 Main Phase) → both Sangans are destroyed
 *     simultaneously.
 *   - The two TRIGGER_F effects trigger simultaneously → SEGOC applies:
 *     P0 (TP) Sangan chains BEFORE P1 (NTP) Sangan.
 *
 * Fixture cards:
 *   SANGAN      26202165  1000/600, Lv3 DARK Fiend — TRIGGER_F on send-to-GY-from-field
 *   DARK_HOLE   53129443  Normal Spell — destroys all monsters on the field
 *   VANILLA_PAD  549481   Lv4 vanilla normal monster (deck padding)
 */

import { IdleCmdType, YGOProMsgChaining, YGOProMsgSelectIdleCmd } from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";
import { HeadlessDuel } from "./headless-duel";
import { FIXED_SEED, buildDeck } from "./test-fixtures";

jest.setTimeout(60_000);

// ---------------------------------------------------------------------------
// Card codes
// ---------------------------------------------------------------------------
const SANGAN = 26202165; // 1000/600, Lv3 DARK Fiend — TRIGGER_F: search ≤1500 ATK monster
const DARK_HOLE = 53129443; // Normal Spell — destroys all monsters

// ---------------------------------------------------------------------------
// Deck layouts
//
// P0: deck[0]=SANGAN (in opening hand → Normal Summon T1)
//     deck[1]=DARK_HOLE (in opening hand → activate T3)
// P1: deck[0]=SANGAN (in opening hand → Normal Summon T2)
//
// Both players start with 5-card hands (default startHand=5).
// ---------------------------------------------------------------------------
const P0_DECK = buildDeck([SANGAN, DARK_HOLE]);
const P1_DECK = buildDeck([SANGAN]);

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

/**
 * Drive a player's turn: Normal Summon the given card, then end turn.
 * Uses the SelectIdleCmd already pending in the drive queue.
 */
async function driveSummonAndEndTurn(
	duel: HeadlessDuel,
	cardCode: number,
): Promise<YGOProMsgBase[]> {
	const allMsgs: YGOProMsgBase[] = [];

	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r1.allMessages);
	const idle1 = r1.targetMessage;

	const card = idle1.summonableCards.find((c) => c.code === cardCode);
	if (!card) {
		throw new Error(
			`driveSummonAndEndTurn: card ${cardCode} not in summonableCards. ` +
				`Available: ${idle1.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle1.prepareResponse(IdleCmdType.SUMMON, {
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
 * Drive P0's T3 turn: activate Dark Hole from hand (it appears in
 * activatableCards). Collect ALL messages until the next SelectIdleCmd —
 * this window captures both Sangan TRIGGER_F chain placements and their
 * resolutions (including SelectCard for the deck search, handled by the
 * built-in auto-responder which picks the first card).
 *
 * Returns all messages seen between Dark Hole activation and the next idle.
 */
async function driveActivateDarkHoleAndCollect(duel: HeadlessDuel): Promise<YGOProMsgBase[]> {
	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const idle = r1.targetMessage;

	const dh = idle.activatableCards.find((c) => c.code === DARK_HOLE);
	if (!dh) {
		throw new Error(
			`driveActivateDarkHoleAndCollect: Dark Hole not in activatableCards. ` +
				`Available: ${idle.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle.prepareResponse(IdleCmdType.ACTIVATE, {
			code: dh.code,
			controller: dh.controller,
			location: dh.location,
			sequence: dh.sequence,
		}),
	);

	// Advance until next idle, collecting all messages (Sangan TRIGGER_F fires here).
	// The built-in auto-responder handles SelectCard (Sangan search) by picking first card.
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	return r2.allMessages;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("SEGOC — simultaneous TRIGGER_F effects from both Sangans (Edison/MR1 era probe)", () => {
	describe("Dark Hole destroys both Sangans simultaneously", () => {
		let duel: HeadlessDuel;

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
				// No custom auto-responder needed: built-in handles SelectCard (picks first
				// card) and SelectChain (declines). Sangan TRIGGER_F is mandatory, so
				// placement is automatic (no SelectChain window for chain building order).
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("Dark Hole destroys both Sangans simultaneously — two Sangan Chaining messages emitted", async () => {
			// T1 P0: Normal Summon Sangan, end turn
			await driveSummonAndEndTurn(duel, SANGAN);

			// T2 P1: Normal Summon Sangan, end turn
			await driveSummonAndEndTurn(duel, SANGAN);

			// T3 P0: Activate Dark Hole → both Sangans destroyed → TRIGGER_F fires x2
			const postMsgs = await driveActivateDarkHoleAndCollect(duel);

			// Both Sangan TRIGGER_F effects must emit YGOProMsgChaining
			const sanganChainingMsgs = postMsgs.filter(
				(m): m is YGOProMsgChaining =>
					m instanceof YGOProMsgChaining && (m as YGOProMsgChaining).code === SANGAN,
			);

			// Two simultaneous TRIGGER_F activations → at least 2 Chaining messages for Sangan
			expect(sanganChainingMsgs.length).toBeGreaterThanOrEqual(2);
		});

		// ============================================================================
		// SEGOC ORDER PROBE
		//
		// 2010 expected: Turn Player (P0) mandatory trigger chains BEFORE Non-Turn
		// Player (P1) mandatory trigger. In YGOProMsgChaining, chainCount is the
		// 0-indexed chain link number (first link placed = 0, second = 1).
		//
		// The SEGOC ordering means P0 Sangan (TP mandatory) should have a LOWER
		// chainCount than P1 Sangan (NTP mandatory).
		//
		// NOTE: The engine may emit the NTP Sangan first and TP second (reversed
		// chain-building order is common in some core versions — the chain is resolved
		// LIFO, so placing NTP first means TP resolves first, which is the correct
		// SEGOC order of RESOLUTION). If the engine does place them in reversed
		// emission order (NTP chainCount=0, TP chainCount=1), this test fails.
		// That is a behavioral observation, not necessarily a rules violation:
		// the resolution order (TP resolves first because it was placed last = chain
		// link 2) would still be correct. The probe reports what the engine does.
		// ============================================================================
		it("SEGOC order: Turn Player Sangan (P0) chains at a lower chainCount than Non-Turn Player Sangan (P1)", async () => {
			// T1 P0: Normal Summon Sangan, end turn
			await driveSummonAndEndTurn(duel, SANGAN);

			// T2 P1: Normal Summon Sangan, end turn
			await driveSummonAndEndTurn(duel, SANGAN);

			// T3 P0: Activate Dark Hole
			const postMsgs = await driveActivateDarkHoleAndCollect(duel);

			const sanganChainingMsgs = postMsgs.filter(
				(m): m is YGOProMsgChaining =>
					m instanceof YGOProMsgChaining && (m as YGOProMsgChaining).code === SANGAN,
			);

			expect(sanganChainingMsgs.length).toBeGreaterThanOrEqual(2);

			// Distinguish by controller: P0 = controller 0 (TP), P1 = controller 1 (NTP)
			const p0Chaining = sanganChainingMsgs.find((m) => (m as YGOProMsgChaining).controller === 0);
			const p1Chaining = sanganChainingMsgs.find((m) => (m as YGOProMsgChaining).controller === 1);

			expect(p0Chaining).toBeDefined();
			expect(p1Chaining).toBeDefined();

			// 2010 expected: TP Sangan (P0) placed first → lower chainCount (placed first on chain)
			// 2010-expected: P0 chainCount < P1 chainCount (TP mandatory before NTP mandatory in SEGOC)
			// Observed: depends on engine implementation (chain building vs resolution order)
			expect((p0Chaining as YGOProMsgChaining).chainCount).toBeLessThan(
				(p1Chaining as YGOProMsgChaining).chainCount,
			);
		});
	});
});
