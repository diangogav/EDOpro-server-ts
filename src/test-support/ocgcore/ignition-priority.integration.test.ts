/**
 * MR1 ignition priority (Edison rule) — Slice 2
 *
 * Tests the MR1 rule that grants the summoning player a "priority" window to
 * activate ignition effects immediately after a Normal Summon, BEFORE the
 * opponent may respond with traps like Trap Hole.
 *
 * Observed engine message flow after Exiled Force Normal Summon (MR1):
 *   1. SelectChain(player=0, count=0)  — empty priority window: "P0, chain now?"
 *   2. SelectChain(player=1, count=0)  — empty priority window: "P1, chain now?"
 *   3. SelectChain(player=0, count=1, chains=[EF 74131780])  — P0 ignition available
 *   4. SelectChain(player=1, count=1, chains=[Trap Hole 4206964])  — P1 trap available
 *
 * MR1 priority = P0 gets step 3 BEFORE P1's Trap Hole (step 4).
 * If P0 activates in step 3 → step 4 never appears.
 * If P0 declines step 3 → step 4 appears and Trap Hole can destroy EF.
 *
 * MR2+ (duel_rule=2): no step 3 for P0; P1 Trap Hole appears earlier or directly.
 */

import {
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectChain,
	YGOProMsgSummoning,
	YGOProMsgSummoned,
	YGOProMsgNewTurn,
	YGOProMsgMove,
	YGOProMsgSelectTribute,
	IdleCmdType,
	YGOProMessages,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";
import { _OcgcoreConstants } from "koishipro-core.js";
import { HeadlessDuel } from "./headless-duel";
import { FIXED_SEED, buildDeck } from "./test-fixtures";

const { OcgcoreScriptConstants } = _OcgcoreConstants;

jest.setTimeout(60_000);

// ---------------------------------------------------------------------------
// Card codes
// ---------------------------------------------------------------------------
const EXILED_FORCE = 74131780;
const TRAP_HOLE = 4206964;
const VANILLA_P1 = 549481; // Lv4 vanilla used as P1 field presence and Trap Hole target

// ---------------------------------------------------------------------------
// Module constants
// ---------------------------------------------------------------------------

// Headroom above the documented 4-window flow (2 empty + 1 P0 ignition + 1 P1 trap),
// used as the iteration cap in advanceUntilNonEmptyChain.
const MAX_EMPTY_CHAIN_WINDOWS = 10;

// ---------------------------------------------------------------------------
// Deck builder helpers
// ---------------------------------------------------------------------------

// P0 deck: Exiled Force at [0] → opens in hand (cards 1-5) + T1 draw
// P0 opening hand cards come from deck[0..4], T1 draw from deck[5].
// We want EF in opening hand → deck[0] = EF.
const P0_DECK = buildDeck([EXILED_FORCE]);

// P1 deck: vanilla 549481 at [0] (opening hand) + Trap Hole at [1] (opening hand)
// P1 does not draw on T1 (P0's turn). T2 draw comes from deck[5].
const P1_DECK = buildDeck([VANILLA_P1, TRAP_HOLE]);

// ---------------------------------------------------------------------------
// Helper: advance through chain windows until one with count > 0 appears
// ---------------------------------------------------------------------------

/**
 * Advance the duel past empty SelectChain windows (count=0, auto-decline),
 * stopping when a SelectChain with count > 0 is found.
 *
 * Returns { targetMessage, allMessages } where targetMessage is the first
 * SelectChain with count > 0, or throws if none appears within maxChains tries.
 */
async function advanceUntilNonEmptyChain(
	duel: HeadlessDuel,
	maxChains = MAX_EMPTY_CHAIN_WINDOWS,
): Promise<{ targetMessage: YGOProMsgSelectChain; allMessages: YGOProMsgBase[] }> {
	const allMessages: YGOProMsgBase[] = [];
	for (let i = 0; i < maxChains; i++) {
		const r = await duel.advanceUntil(YGOProMsgSelectChain);
		allMessages.push(...r.allMessages);
		if (r.targetMessage.count > 0) {
			return { targetMessage: r.targetMessage, allMessages };
		}
		// Empty chain — decline and continue
		duel.setResponse(r.targetMessage.defaultResponse());
	}
	throw new Error(
		`advanceUntilNonEmptyChain: no non-empty SelectChain found after ${maxChains} tries`,
	);
}

// ---------------------------------------------------------------------------
// Shared scenario driver
// ---------------------------------------------------------------------------

/**
 * Drive the duel from game start to the point where P0 has just Normal Summoned
 * Exiled Force and the engine is waiting for a response to a chain window.
 *
 * Turn timeline:
 *   T1 P0: end turn immediately (TO_EP)
 *   T2 P1: summon vanilla (549481), set Trap Hole (4206964), end turn
 *   T3 P0: summon Exiled Force (74131780)
 *
 * Returns all messages collected across the whole drive.
 */
async function driveToTurn3Summon(duel: HeadlessDuel): Promise<{ allMessages: YGOProMsgBase[] }> {
	const allMessages: YGOProMsgBase[] = [];

	// ── T1 P0: wait for SelectIdleCmd, end turn ──────────────────────────────
	{
		const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		allMessages.push(...r.allMessages);
		const idle = r.targetMessage;
		duel.setResponse(idle.prepareResponse(IdleCmdType.TO_EP));
	}

	// ── T2 P1: summon vanilla, set Trap Hole, end turn ───────────────────────
	{
		// Wait for P1 SelectIdleCmd
		const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		allMessages.push(...r1.allMessages);
		const idle1 = r1.targetMessage;

		// Find vanilla in summonable cards
		const vanillaCard = idle1.summonableCards.find((c) => c.code === VANILLA_P1);
		if (!vanillaCard) {
			throw new Error(
				`P1 vanilla (${VANILLA_P1}) not found in summonableCards. ` +
					`Available: ${idle1.summonableCards.map((c) => c.code).join(", ")}`,
			);
		}
		duel.setResponse(
			idle1.prepareResponse(IdleCmdType.SUMMON, {
				code: vanillaCard.code,
				controller: vanillaCard.controller,
				location: vanillaCard.location,
				sequence: vanillaCard.sequence,
			}),
		);

		// After summon, wait for next SelectIdleCmd to set Trap Hole
		const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		allMessages.push(...r2.allMessages);
		const idle2 = r2.targetMessage;

		// Find Trap Hole in ssetable cards
		const trapHoleCard = idle2.ssetableCards.find((c) => c.code === TRAP_HOLE);
		if (!trapHoleCard) {
			throw new Error(
				`Trap Hole (${TRAP_HOLE}) not found in ssetableCards. ` +
					`Available sset: ${idle2.ssetableCards.map((c) => c.code).join(", ")}`,
			);
		}
		duel.setResponse(
			idle2.prepareResponse(IdleCmdType.SSET, {
				code: trapHoleCard.code,
				controller: trapHoleCard.controller,
				location: trapHoleCard.location,
				sequence: trapHoleCard.sequence,
			}),
		);

		// After set, wait for next SelectIdleCmd to end turn
		const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		allMessages.push(...r3.allMessages);
		const idle3 = r3.targetMessage;
		duel.setResponse(idle3.prepareResponse(IdleCmdType.TO_EP));
	}

	// ── T3 P0: summon Exiled Force ────────────────────────────────────────────
	{
		const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		allMessages.push(...r.allMessages);
		const idle = r.targetMessage;

		const efCard = idle.summonableCards.find((c) => c.code === EXILED_FORCE);
		if (!efCard) {
			throw new Error(
				`Exiled Force (${EXILED_FORCE}) not found in summonableCards for P0. ` +
					`Available: ${idle.summonableCards.map((c) => c.code).join(", ")}`,
			);
		}
		duel.setResponse(
			idle.prepareResponse(IdleCmdType.SUMMON, {
				code: efCard.code,
				controller: efCard.controller,
				location: efCard.location,
				sequence: efCard.sequence,
			}),
		);
	}

	return { allMessages };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MR1 ignition priority (Edison rule)", () => {
	// ── Test 1: Priority window offered ───────────────────────────────────────

	describe("priority window offered", () => {
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

		it("after Exiled Force Normal Summon resolves (MR1), P0 gets SelectChain with ignition effect before P1", async () => {
			const { allMessages: driveMessages } = await driveToTurn3Summon(duel);

			// Engine flow after EF summon (MR1):
			//   SelectChain(player=0, count=0) — empty priority window P0
			//   SelectChain(player=1, count=0) — empty priority window P1
			//   SelectChain(player=0, count=1, chains=[EF]) ← target
			const { targetMessage: chainMsg, allMessages: chainMessages } =
				await advanceUntilNonEmptyChain(duel);
			const allMessages = [...driveMessages, ...chainMessages];

			// Priority window must be for P0 (EF controller)
			expect(chainMsg.player).toBe(0);

			// Must list Exiled Force's ignition effect
			const hasExiledForce = chainMsg.chains.some((c) => c.code === EXILED_FORCE);
			expect(hasExiledForce).toBe(true);

			// EF must be in MZONE for P0 (it was just summoned)
			const mzoneCount = duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE);
			expect(mzoneCount).toBeGreaterThan(0);
		});
	});

	// ── Test 2: Priority used → Trap Hole locked out ─────────────────────────

	describe("priority used → trap locked out", () => {
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

		it("when P0 activates Exiled Force ignition via priority, Trap Hole is NOT available in P1's subsequent chain window", async () => {
			const { allMessages: driveMessages } = await driveToTurn3Summon(duel);

			// Step 1: Advance past empty chain windows to P0's EF ignition SelectChain
			const { targetMessage: chainMsg, allMessages: chainMessages } =
				await advanceUntilNonEmptyChain(duel);
			expect(chainMsg.player).toBe(0);

			const efChain = chainMsg.chains.find((c) => c.code === EXILED_FORCE);
			expect(efChain).toBeDefined();

			// Step 2: Activate EF ignition
			duel.setResponse(
				chainMsg.prepareResponse({
					code: efChain!.code,
					controller: efChain!.controller,
					location: efChain!.location,
					sequence: efChain!.sequence,
					desc: efChain!.desc,
				}),
			);

			// Step 3: Let the engine resolve — SelectCard (pick target) and SelectTribute are
			// handled by the built-in auto-responder. Advance until SelectIdleCmd.
			const { allMessages: resolveMessages } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			const allMessages = [...driveMessages, ...chainMessages, ...resolveMessages];

			// Verify no P1 Trap Hole SelectChain appeared during resolution
			const p1TrapHoleChain = allMessages
				.filter((m) => m instanceof YGOProMsgSelectChain)
				.find(
					(m) =>
						(m as YGOProMsgSelectChain).player === 1 &&
						(m as YGOProMsgSelectChain).chains.some((c) => c.code === TRAP_HOLE),
				);
			expect(p1TrapHoleChain).toBeUndefined();

			// EF should be in P0 GY (tributed as cost)
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBeGreaterThan(0);

			// EF tributed itself → P0 MZONE should be 0
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);

			// P1 vanilla should be destroyed by EF → P1 GY > 0
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_GRAVE)).toBeGreaterThan(0);

			// P1 MZONE should be 0 (vanilla destroyed)
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);
		});
	});

	// ── Test 3: Priority passed → Trap Hole live ─────────────────────────────

	describe("priority passed → trap live", () => {
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

		it("when P0 DECLINES the priority window, P1's SelectChain offers Trap Hole and destroys Exiled Force", async () => {
			const { allMessages: driveMessages } = await driveToTurn3Summon(duel);

			// Step 1: Advance past empty chains to P0's EF ignition window
			const { targetMessage: p0ChainMsg, allMessages: chain1Messages } =
				await advanceUntilNonEmptyChain(duel);
			expect(p0ChainMsg.player).toBe(0);
			expect(p0ChainMsg.chains.some((c) => c.code === EXILED_FORCE)).toBe(true);

			// Step 2: Decline (pass priority)
			duel.setResponse(p0ChainMsg.defaultResponse());

			// Step 3: Advance to P1's SelectChain — should offer Trap Hole
			const { targetMessage: p1ChainMsg, allMessages: chain2Messages } =
				await advanceUntilNonEmptyChain(duel);

			const allMessages = [...driveMessages, ...chain1Messages, ...chain2Messages];

			// P1's chain window must contain Trap Hole
			expect(p1ChainMsg.player).toBe(1);
			const hasTrapHole = p1ChainMsg.chains.some((c) => c.code === TRAP_HOLE);
			expect(hasTrapHole).toBe(true);

			// Step 4: Activate Trap Hole
			const trapHoleChain = p1ChainMsg.chains.find((c) => c.code === TRAP_HOLE);
			duel.setResponse(
				p1ChainMsg.prepareResponse({
					code: trapHoleChain!.code,
					controller: trapHoleChain!.controller,
					location: trapHoleChain!.location,
					sequence: trapHoleChain!.sequence,
					desc: trapHoleChain!.desc,
				}),
			);

			// Step 5: Let chain resolve → Exiled Force destroyed by Trap Hole
			await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// After resolution: EF in P0 GY (destroyed by Trap Hole)
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_GRAVE)).toBeGreaterThan(0);

			// P1 vanilla survives (mzone > 0)
			expect(duel.queryLocationCount(1, OcgcoreScriptConstants.LOCATION_MZONE)).toBeGreaterThan(0);

			// P0 MZONE should be 0 (EF destroyed by Trap Hole)
			expect(duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE)).toBe(0);
		});
	});

	// ── Test 4: Differential — duelRule 2 has no priority window ─────────────

	describe("differential — duelRule 2 has no priority window", () => {
		let duel: HeadlessDuel;

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 2,
				seed: FIXED_SEED,
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("with duelRule 2, the priority window for P0 is NOT offered after Exiled Force summon", async () => {
			const { allMessages: driveMessages } = await driveToTurn3Summon(duel);

			// Collect all SelectChain messages until we reach SelectIdleCmd.
			// We must NOT see a SelectChain with player=0 AND chains[].code===EF.
			const allMessages: YGOProMsgBase[] = [...driveMessages];

			// Advance until SelectIdleCmd, collecting all messages along the way.
			// The built-in auto-responder handles any SelectChain windows that appear.
			const { allMessages: idleMessages } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			allMessages.push(...idleMessages);

			// Assert: no SelectChain where player=0 AND chains include EF ignition appeared
			const p0EfChain = allMessages
				.filter((m) => m instanceof YGOProMsgSelectChain)
				.find(
					(m) =>
						(m as YGOProMsgSelectChain).player === 0 &&
						(m as YGOProMsgSelectChain).chains.some((c) => c.code === EXILED_FORCE),
				);
			expect(p0EfChain).toBeUndefined();
		});
	});
});
