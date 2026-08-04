/**
 * Ultimate Offering pre-errata (511003023) — Edison 2010 ruling probe
 *
 * The 2010 ruling for Ultimate Offering (Continuous Trap) is:
 *   When Ultimate Offering's effect resolves, the additional Normal Summon/Set
 *   happens DURING EFFECT RESOLUTION — the engine does not open a summon-response
 *   chain window for the opponent. Solemn Judgment CANNOT negate that summon.
 *
 * Card codes:
 *   ULTIMATE_OFFERING_PRE_ERRATA = 511003023   (alias=80604091, Continuous Trap)
 *   SOLEMN_JUDGMENT              = 41420027    (Counter Trap — negate summon)
 *   KOJIKOCY                     = 1184620     (1500/1200 Lv4 vanilla — summoned via UO)
 *
 * Flow (for both tests):
 *   T1 P0: SSET Ultimate Offering face-down, end turn
 *   T2 P1: [Test 2: SSET Solemn Judgment face-down], end turn
 *   T3 P0: Activate UO from SZONE (idle activatable → flips it face-up/activates).
 *          After UO is on field face-up, its QUICK_O effect (EVENT_FREE_CHAIN) appears
 *          in a SelectChain window during Main Phase. Activate it → cost: pay 500 LP →
 *          SelectCard picks KOJIKOCY → Duel.SummonOrSet → KOJIKOCY goes to MZONE.
 *
 * Engine note on activation sequence:
 *   c511003023.lua (classic-engine port) has two registered effects:
 *   1. e1 (EFFECT_TYPE_ACTIVATE, EVENT_FREE_CHAIN) — fires when the card is
 *      activated from the S/T zone (flips it face-up as Continuous Trap).
 *   2. e3 (EFFECT_TYPE_QUICK_O, EVENT_FREE_CHAIN, LOCATION_SZONE) — fires while
 *      UO is face-up in SZONE during any free-chain window (Main Phase, Battle Phase).
 *      Activation pays 500 LP cost, then offers SelectCard (pick monster to summon),
 *      then calls Duel.Summon / Duel.MSet depending on SelectPosition response.
 *
 * Classic-engine adaptation note:
 *   The original EDOPro script used Card.CanSummonOrSet and Duel.SummonOrSet —
 *   functions not available in the bundled WASM (classic/YGOPro) engine.
 *   The adapted script uses c:IsSummonable(true,nil) or c:IsMSetable(true,nil)
 *   as the filter, and Duel.Summon / Duel.MSet as the summon call.
 *
 * 2010 rulings enforced (see per-test comments):
 *   Test 2 — the summon during resolution opens NO negation window (Solemn cannot
 *   respond): enforced via EFFECT_CANNOT_DISABLE_SUMMON in s.summon2010.
 *   Test 3 — phase condition per UDE Netrep ruling (2003-2004, unchanged through
 *   Edison): usable ONLY during the controller's Main Phase 1/2 and the
 *   opponent's Battle Phase. Sources: goatformat.com/rulings8.html (Netrep
 *   verbatim), edisonformat.com rules U-Z.
 *
 * Ruling source: edisonformat.com individual rulings U
 */

import {
	BattleCmdType,
	YGOProMsgNewPhase,
	YGOProMsgNewTurn,
	YGOProMsgSelectBattleCmd,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectChain,
	YGOProMsgMove,
	YGOProMsgPayLpCost,
	IdleCmdType,
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
const ULTIMATE_OFFERING_PRE_ERRATA = 511003023; // alias=80604091, Continuous Trap, QUICK_O summon effect
const SOLEMN_JUDGMENT = 41420027; // Counter Trap — negate summon/spell/trap, pay half LP
const KOJIKOCY = 1184620; // 1500/1200, Lv4, vanilla — summoned via UO

// ---------------------------------------------------------------------------
// Helper: drive a player's turn by ending immediately (no summon, no action).
// ---------------------------------------------------------------------------
async function drivePassTurn(duel: HeadlessDuel): Promise<YGOProMsgBase[]> {
	const allMsgs: YGOProMsgBase[] = [];
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r.allMessages);
	duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
	return allMsgs;
}

// ---------------------------------------------------------------------------
// Helper: drive Turn 1 SSET only (no summon), then end turn.
// Requires targetCode to be in P0's ssetableCards.
// ---------------------------------------------------------------------------
async function driveSSet(duel: HeadlessDuel, targetCode: number): Promise<YGOProMsgBase[]> {
	const allMsgs: YGOProMsgBase[] = [];

	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r1.allMessages);
	const idle = r1.targetMessage;

	const card = idle.ssetableCards.find((c) => c.code === targetCode);
	if (!card) {
		throw new Error(
			`driveSSet: card ${targetCode} not in ssetableCards. ` +
				`Available ssetable: ${idle.ssetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle.prepareResponse(IdleCmdType.SSET, {
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

// ---------------------------------------------------------------------------
// Helper: activate a card by code from the idle cmd's activatableCards list.
// Returns without ending the turn (leaves P0 in Main Phase).
// ---------------------------------------------------------------------------
async function activateFromIdle(
	duel: HeadlessDuel,
	targetCode: number,
): Promise<{ msgs: YGOProMsgBase[]; idle: YGOProMsgSelectIdleCmd }> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const idle = r.targetMessage;

	const card = idle.activatableCards.find((c) => c.code === targetCode);
	if (!card) {
		throw new Error(
			`activateFromIdle: card ${targetCode} not in activatableCards. ` +
				`Available activatable: ${idle.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle.prepareResponse(IdleCmdType.ACTIVATE, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);

	return { msgs: r.allMessages, idle };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Ultimate Offering pre-errata (511003023) — Edison 2010 ruling", () => {
	// ────────────────────────────────────────────────────────────────────────
	// Test 1: LP cost paid and monster summoned to MZONE
	// ────────────────────────────────────────────────────────────────────────
	//
	// Scenario:
	//   P0 deck: [UO, KOJIKOCY] + vanillas → opening hand has both
	//   T1 P0: SSET Ultimate Offering, end turn (KOJIKOCY stays in hand)
	//   T2 P1: end turn (pass)
	//   T3 P0: activate UO from SZONE (idle activatable) → UO face-up
	//          UO's QUICK_O effect fires in SelectChain → activate it →
	//          pay 500 LP → SelectCard picks KOJIKOCY → summon to MZONE
	//
	// Assertions:
	//   - KOJIKOCY appears in P0's MZONE
	//   - A YGOProMsgDamage for player=0 with value=500 is present (LP cost)
	// ────────────────────────────────────────────────────────────────────────
	describe("Test 1: 500 LP cost paid and KOJIKOCY summoned to MZONE", () => {
		let duel: HeadlessDuel;

		const P0_DECK = buildDeck([ULTIMATE_OFFERING_PRE_ERRATA, KOJIKOCY]);
		const P1_DECK = buildDeck([]);

		// Track whether the QUICK_O effect was activated in a SelectChain window
		let quickOActivated = false;
		// All messages collected after QUICK_O activation until next SelectIdleCmd
		const postActivationMsgs: YGOProMsgBase[] = [];

		beforeEach(async () => {
			quickOActivated = false;
			postActivationMsgs.length = 0;

			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
				// Activate UO's QUICK_O effect the first time it appears for P0 in a chain window.
				// The built-in auto-responder declines all SelectChain by default, so we override
				// it here to pick the UO effect when seen.
				autoResponder: (msg) => {
					if (msg instanceof YGOProMsgSelectChain && !quickOActivated) {
						const chain = msg as YGOProMsgSelectChain;
						if (chain.player === 0) {
							const uoEntry = chain.chains.find((c) => c.code === ULTIMATE_OFFERING_PRE_ERRATA);
							if (uoEntry) {
								quickOActivated = true;
								return chain.prepareResponse({
									code: uoEntry.code,
									controller: uoEntry.controller,
									location: uoEntry.location,
									sequence: uoEntry.sequence,
									desc: uoEntry.desc,
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

		it("activates UO QUICK_O effect, deducts 500 LP from P0, and summons KOJIKOCY to P0 MZONE", async () => {
			// T1 P0: SSET Ultimate Offering face-down, end turn
			await driveSSet(duel, ULTIMATE_OFFERING_PRE_ERRATA);

			// T2 P1: end turn (no actions)
			await drivePassTurn(duel);

			// T3 P0: Activate UO from SZONE (idle activatable — continuous trap activation)
			await activateFromIdle(duel, ULTIMATE_OFFERING_PRE_ERRATA);

			// After UO's ACTIVATE effect resolves, its QUICK_O effect (EVENT_FREE_CHAIN)
			// should fire as a SelectChain window while UO is face-up in SZONE.
			// The autoResponder activates it. Drive until the next SelectIdleCmd to let it resolve.
			const { allMessages: postMsgs } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			postActivationMsgs.push(...postMsgs);

			// ── Assertion: QUICK_O was activated ──────────────────────────────
			expect(quickOActivated).toBe(true);

			// ── Assertion: KOJIKOCY is in P0's MZONE ──────────────────────────
			// The engine summons KOJIKOCY during resolution of UO's QUICK_O effect.
			expect(
				duel.queryLocationCount(0, OcgcoreScriptConstants.LOCATION_MZONE),
			).toBeGreaterThanOrEqual(1);

			// Confirm KOJIKOCY moved to P0 MZONE via YGOProMsgMove
			const kojiInMzone = postActivationMsgs.some(
				(m): m is YGOProMsgMove =>
					m instanceof YGOProMsgMove &&
					(m as YGOProMsgMove).code === KOJIKOCY &&
					(m as YGOProMsgMove).current.location === OcgcoreScriptConstants.LOCATION_MZONE,
			);
			expect(kojiInMzone).toBe(true);

			// ── Assertion: 500 LP cost paid (YGOProMsgPayLpCost player=0, cost=500) ──
			// ocgcore encodes Duel.PayLPCost as MSG_PAY_LPCOST decoded as YGOProMsgPayLpCost.
			const lpCostMsg = postActivationMsgs.find(
				(m): m is YGOProMsgPayLpCost =>
					m instanceof YGOProMsgPayLpCost &&
					(m as YGOProMsgPayLpCost).player === 0 &&
					(m as YGOProMsgPayLpCost).cost === 500,
			);
			expect(lpCostMsg).toBeDefined();
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Test 2: No summon-negation window — Solemn Judgment cannot respond
	// ────────────────────────────────────────────────────────────────────────
	//
	// The 2010 Edison ruling:
	//   The additional Normal Summon from Ultimate Offering happens INSIDE EFFECT
	//   RESOLUTION — the engine does NOT open a summon-response chain window for the
	//   opponent. Solemn Judgment cannot be activated in response to that summon.
	//
	// Scenario:
	//   P0 deck: [UO, KOJIKOCY] + vanillas
	//   P1 deck: [SOLEMN_JUDGMENT] + vanillas
	//   T1 P0: SSET Ultimate Offering, end turn
	//   T2 P1: SSET Solemn Judgment, end turn
	//   T3 P0: Activate UO → QUICK_O fires → activate it → KOJIKOCY summoned.
	//          During UO QUICK_O resolution, check that no SelectChain for P1
	//          containing Solemn Judgment appears.
	//
	// If the engine DOES open a window for Solemn (post-errata behavior), the test
	// is wrapped in it.failing with a documentation comment.
	// ────────────────────────────────────────────────────────────────────────
	describe("Test 2: No summon-negation window — Solemn Judgment cannot respond to the summon during resolution", () => {
		let duel: HeadlessDuel;

		const P0_DECK = buildDeck([ULTIMATE_OFFERING_PRE_ERRATA, KOJIKOCY]);
		const P1_DECK = buildDeck([SOLEMN_JUDGMENT]);

		let quickOActivated = false;
		// Track if we are currently "inside" UO QUICK_O resolution (after activation, before next idle)
		let trackingResolution = false;
		// All SelectChain messages seen after QUICK_O activation and before next SelectIdleCmd
		const resolutionChains: YGOProMsgSelectChain[] = [];

		beforeEach(async () => {
			quickOActivated = false;
			trackingResolution = false;
			resolutionChains.length = 0;

			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: (msg) => {
					// Activate UO's QUICK_O effect once for P0
					if (msg instanceof YGOProMsgSelectChain && !quickOActivated) {
						const chain = msg as YGOProMsgSelectChain;
						if (chain.player === 0) {
							const uoEntry = chain.chains.find((c) => c.code === ULTIMATE_OFFERING_PRE_ERRATA);
							if (uoEntry) {
								quickOActivated = true;
								trackingResolution = true;
								return chain.prepareResponse({
									code: uoEntry.code,
									controller: uoEntry.controller,
									location: uoEntry.location,
									sequence: uoEntry.sequence,
									desc: uoEntry.desc,
								});
							}
						}
					}

					// While tracking resolution, record all SelectChain messages
					if (trackingResolution && msg instanceof YGOProMsgSelectChain) {
						resolutionChains.push(msg as YGOProMsgSelectChain);
					}

					return undefined; // fall back to built-in (declines all chains)
				},
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		// 2010 ruling: the summon during UO resolution is NOT a summon-response timing.
		// Solemn Judgment should NOT appear in any SelectChain for P1 during resolution.
		//
		// HOW THE SCRIPT ENFORCES IT (2026-08-01, verified against core source):
		//   A mid-chain Duel.Summon is deliberately DEFERRED by the core to after the
		//   chain ends (libduel.cpp duel_summon: core.summon_reserved) — modern
		//   "immediately after this effect resolves" semantics, where the summon-
		//   negation window (summon proc case 13, EVENT_SUMMON) opens because the
		//   chain is empty by then. Summon proc case 12 skips that window when the
		//   summoned card is affected by EFFECT_CANNOT_DISABLE_SUMMON, so the script
		//   registers it scoped to the summoned card (s.summon2010 in c511003023.lua)
		//   before calling Duel.Summon. Field-type + EFFECT_FLAG_IGNORE_RANGE +
		//   EFFECT_FLAG_SET_AVAILABLE is required: a SINGLE-type effect with
		//   RESETS_STANDARD (the first attempt) dies when the card moves to the field,
		//   BEFORE the case-12 check runs — that failed experiment was misread as
		//   "core gap; not fixable in Lua". It is fixable; this test proves it.
		it("Solemn Judgment is NOT offered to P1 in any chain window during UO QUICK_O resolution (2010: summon during resolution opens no negation window)", async () => {
			// T1 P0: SSET Ultimate Offering, end turn
			await driveSSet(duel, ULTIMATE_OFFERING_PRE_ERRATA);

			// T2 P1: SSET Solemn Judgment, end turn
			await driveSSet(duel, SOLEMN_JUDGMENT);

			// T3 P0: Activate UO from SZONE
			await activateFromIdle(duel, ULTIMATE_OFFERING_PRE_ERRATA);

			// Drive through resolution until next SelectIdleCmd.
			// autoResponder collects all SelectChain messages during this phase.
			await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// Stop tracking
			trackingResolution = false;

			// ── Assertion: QUICK_O was activated ──────────────────────────────
			expect(quickOActivated).toBe(true);

			// ── Assertion: Solemn was NOT offered to P1 during resolution ──────
			// 2010 ruling: summon during operation resolution → no summon-response window.
			const solemnOfferedToP1 = resolutionChains.some(
				(chainMsg) =>
					chainMsg.player === 1 && chainMsg.chains.some((c) => c.code === SOLEMN_JUDGMENT),
			);

			// If this fails, the EFFECT_CANNOT_DISABLE_SUMMON registration in
			// s.summon2010 (c511003023.lua) regressed — see the comment above the test.
			expect(solemnOfferedToP1).toBe(false);
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Test 3: phase condition — 2010 Netrep ruling
	// ────────────────────────────────────────────────────────────────────────
	//
	// UDE Netrep (2003-2004, unchanged through March 2010; goatformat.com/rulings8.html):
	//   "You can only activate its effect of additional normal summons during YOUR
	//    Main Phase 1 and 2, and during your OPPONENT'S Battle Phase."
	// The card itself may be FLIPPED face-up during any phase — only the summon
	// effect (QUICK_O) is phase-restricted.
	//
	// Scenario: P0 sets UO on T1. On P1's turn the autoResponder flips UO face-up
	// at the first free-chain window (any phase — legal). Then we walk P1's Main
	// Phase → Battle Phase, and P0's own Battle Phase on T3, annotating every
	// SelectChain offered to P0 with the current turn player and phase.
	// ────────────────────────────────────────────────────────────────────────
	describe("Test 3: phase condition — own Main Phase / opponent's Battle Phase only", () => {
		const PHASE_MAIN1 = 0x4;
		const PHASE_MAIN2 = 0x100;
		const BATTLE_PHASES = new Set([0x8, 0x10, 0x80]); // BATTLE_START, BATTLE_STEP, BATTLE

		interface AnnotatedOffer {
			turn: number;
			phase: number;
			hasUO: boolean;
		}

		it("QUICK_O is offered in the opponent's Battle Phase but NOT in the opponent's Main Phase nor the controller's own Battle Phase", async () => {
			let flipDone = false;

			const duel = await HeadlessDuel.create({
				decks: [
					{ main: buildDeck([ULTIMATE_OFFERING_PRE_ERRATA, KOJIKOCY]) },
					{ main: buildDeck([]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				// Flip UO face-up at the first opportunity on P1's turn; decline everything else.
				autoResponder: (msg) => {
					if (msg instanceof YGOProMsgSelectChain && !flipDone && msg.player === 0) {
						const entry = msg.chains.find((c) => c.code === ULTIMATE_OFFERING_PRE_ERRATA);
						if (entry) {
							flipDone = true;
							return msg.prepareResponse({
								code: entry.code,
								controller: entry.controller,
								location: entry.location,
								sequence: entry.sequence,
								desc: entry.desc,
							});
						}
					}
					return undefined;
				},
			});

			const allMessages: YGOProMsgBase[] = [];
			try {
				// T1 P0: SSET UO, end turn
				await driveSSet(duel, ULTIMATE_OFFERING_PRE_ERRATA);

				// T2 P1: advance to Main Phase idle (flip happens on the way)
				const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
				allMessages.push(...r1.allMessages);
				duel.setResponse(r1.targetMessage.prepareResponse(IdleCmdType.TO_BP));

				// P1 Battle Phase (no attackers) → End Phase
				const r2 = await duel.advanceUntil(YGOProMsgSelectBattleCmd);
				allMessages.push(...r2.allMessages);
				duel.setResponse(r2.targetMessage.prepareResponse(BattleCmdType.TO_EP));

				// T3 P0: Main Phase idle → own Battle Phase.
				// Sanity for "usable in own Main Phase": the turn player is offered the
				// QUICK_O through the idle command's activatable list, not via SELECT_CHAIN.
				const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
				allMessages.push(...r3.allMessages);
				const ownMainActivatable = r3.targetMessage.activatableCards.some(
					(c) => c.code === ULTIMATE_OFFERING_PRE_ERRATA,
				);
				duel.setResponse(r3.targetMessage.prepareResponse(IdleCmdType.TO_BP));

				const r4 = await duel.advanceUntil(YGOProMsgSelectBattleCmd);
				allMessages.push(...r4.allMessages);

				// Annotate every SelectChain offered to P0 with turn player and phase
				let turn = 0;
				let phase = 0;
				const annotated: AnnotatedOffer[] = [];
				let flipIdx = -1;
				for (const m of allMessages) {
					if (m instanceof YGOProMsgNewTurn) turn = m.player;
					if (m instanceof YGOProMsgNewPhase) phase = m.phase;
					if (m instanceof YGOProMsgSelectChain && m.player === 0) {
						const hasUO = m.chains.some((c) => c.code === ULTIMATE_OFFERING_PRE_ERRATA);
						if (hasUO && flipIdx === -1) flipIdx = annotated.length; // the flip offer itself
						annotated.push({ turn, phase, hasUO });
					}
				}
				expect(flipDone).toBe(true);
				expect(flipIdx).toBeGreaterThanOrEqual(0);

				// Only windows AFTER the flip count: from there on, any UO offer is the QUICK_O.
				const postFlip = annotated.slice(flipIdx + 1);

				// 2010 ruling: NOT usable during the opponent's Main Phase
				const opponentMainOffers = postFlip.filter(
					(a) => a.turn === 1 && (a.phase === PHASE_MAIN1 || a.phase === PHASE_MAIN2) && a.hasUO,
				);
				expect(opponentMainOffers).toHaveLength(0);

				// 2010 ruling: usable during the opponent's Battle Phase
				const opponentBattleOffers = postFlip.filter(
					(a) => a.turn === 1 && BATTLE_PHASES.has(a.phase) && a.hasUO,
				);
				expect(opponentBattleOffers.length).toBeGreaterThan(0);

				// 2010 ruling: NOT usable during the controller's own Battle Phase
				const ownBattleOffers = postFlip.filter(
					(a) => a.turn === 0 && BATTLE_PHASES.has(a.phase) && a.hasUO,
				);
				expect(ownBattleOffers).toHaveLength(0);

				// Sanity: usable during the controller's own Main Phase (idle activatable)
				expect(ownMainActivatable).toBe(true);
			} finally {
				await duel.cleanup();
			}
		});
	});
});
