/**
 * No response window for hand-size discard — Edison/MR1 era probe.
 *
 * Rule #11 — When a player must discard cards at the End Phase due to
 * exceeding the hand limit (6 cards), NO chain window opens for Set Quick-Play
 * Spells or Trap Cards. The forced discard is not a card effect — it is a game
 * mechanic — so it cannot be responded to with Quick-Effects or face-down
 * quick-plays.
 *
 * Probe:
 *   P0 Sets Rush Recklessly face-down on T1 (after having a large opening hand).
 *   By T3, P0 has 7 cards in hand and goes to End Phase without playing any
 *   cards → must discard 1 card (hand limit = 6). We verify that NO SelectChain
 *   window containing Rush Recklessly is emitted before the discard SelectCard.
 *
 * Setup (startHand=6):
 *   Opening hand = deck[0..5] = 6 cards (VANILLA_LIGHT, RR, 4 pads).
 *   T1 P0: Draw Phase draws deck[6] → 7 cards. SSet Rush Recklessly → 6 in hand.
 *          End turn.
 *   T2 P1: pass.
 *   T3 P0: Draw Phase draws 1 more card → 7 in hand. End turn without playing →
 *          End Phase: 7 cards > 6 limit → forced discard SelectCard appears.
 *
 * NOTE on T1 Draw Phase behavior:
 *   In this engine (MR1, duelRule=1), Turn 1 Player DOES have a Draw Phase
 *   (the first-turn no-draw rule is not applied by default). startHand=6 means
 *   the opening hand is deck[0..5]; deck[6] is the T1 draw (7 total before
 *   any action). P0 then SSets RR → 6 in hand → no overflow on T1.
 *   T2 P1: pass (no card change for P0). T3 P0: draws 1 → 7 in hand again.
 *
 * Assertion:
 *   Between the TO_EP response (T3 End Phase entry) and the resulting
 *   SelectCard (discard prompt), no SelectChain that contains RUSH_RECKLESSLY
 *   in its chains list is emitted. A SelectCard (discard) IS emitted,
 *   confirming the overflow scenario was reached.
 *
 * Fixture cards:
 *   RUSH_RECKLESSLY  70046172  Quick-Play Spell — +700 ATK, EFFECT_FLAG_DAMAGE_STEP
 *   VANILLA_LIGHT     2863439  1100/1400 Lv4 LIGHT vanilla (Demon's Mirror)
 *   VANILLA_PAD        549481  Lv4 vanilla (deck padding)
 */

import {
	IdleCmdType,
	OcgcoreCommonConstants,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectIdleCmd,
} from "ygopro-msg-encode";
import type { YGOProMsgBase, YGOProMsgResponseBase } from "ygopro-msg-encode";
import { HeadlessDuel } from "./headless-duel";
import { FIXED_SEED, buildDeck, makeDiscardPadsResponder } from "./test-fixtures";

jest.setTimeout(60_000);

// ---------------------------------------------------------------------------
// Card codes
// ---------------------------------------------------------------------------
const RUSH_RECKLESSLY = 70046172; // Quick-Play Spell +700 ATK, EFFECT_FLAG_DAMAGE_STEP
const VANILLA_LIGHT = 2863439; // 1100/1400, Lv4 LIGHT vanilla (Demon's Mirror)

// PHASE_END = 512 (from OcgcoreCommonConstants)
const PHASE_END = OcgcoreCommonConstants.PHASE_END;

// ---------------------------------------------------------------------------
// Deck layout
//
// startHand=6 → opening hand = deck[0..5].
// deck[0]=VANILLA_LIGHT, deck[1]=RUSH_RECKLESSLY, deck[2..5]=pads (4 vanillas)
// deck[6]=pad (T1 draw), deck[7]=pad (T3 draw)
//
// T1 flow: opening=6, draw=1 → 7 cards. SSet RR → 6 in hand, 1 Set in S/T zone.
// T3 flow: 6 in hand + draw=1 → 7 cards. End turn without playing → forced discard.
// ---------------------------------------------------------------------------
const P0_DECK = buildDeck([VANILLA_LIGHT, RUSH_RECKLESSLY]);
const P1_DECK = buildDeck([]);

// Discard responder: prefer discarding pad vanillas, not scenario cards
const discardPadsResponder = makeDiscardPadsResponder([VANILLA_LIGHT, RUSH_RECKLESSLY]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Drive T1 P0: SSet Rush Recklessly face-down (no monster summon), end turn.
 * P0 will draw 1 on T1 (7 cards), then SSet (6 in hand + 1 Set). End turn.
 */
async function driveT1SSet(duel: HeadlessDuel, cardCode: number): Promise<YGOProMsgBase[]> {
	const allMsgs: YGOProMsgBase[] = [];

	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r1.allMessages);
	const idle1 = r1.targetMessage;

	const card = idle1.ssetableCards.find((c) => c.code === cardCode);
	if (!card) {
		throw new Error(
			`driveT1SSet: card ${cardCode} not in ssetableCards. ` +
				`Available ssetable: ${idle1.ssetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle1.prepareResponse(IdleCmdType.SSET, {
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
 * Drive a turn by ending immediately (pass: Main Phase → End Phase with no actions).
 */
async function drivePassTurn(duel: HeadlessDuel): Promise<YGOProMsgBase[]> {
	const allMsgs: YGOProMsgBase[] = [];
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	allMsgs.push(...r.allMessages);
	duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
	return allMsgs;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("End Phase discard — no chain window for hand-limit forced discard (Edison/MR1 era probe)", () => {
	describe("Rush Recklessly Set face-down: no SelectChain offered during hand-size discard", () => {
		let duel: HeadlessDuel;

		// Flags recorded by the autoResponder
		let rrChainOffered = false; // true if RR appeared in any SelectChain
		let discardPromptSeen = false; // true if the hand-size discard SelectCard appeared

		beforeEach(async () => {
			rrChainOffered = false;
			discardPromptSeen = false;

			duel = await HeadlessDuel.create({
				decks: [{ main: P0_DECK }, { main: P1_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
				startHand: 6, // opening hand = 6 → T1 draw → 7 before action
				// Custom autoResponder:
				//   1. Watch SelectChain: record if RR appears in the chains list.
				//      Always decline (defaultResponse).
				//   2. Watch SelectCard for hand-size discard (all cards in HAND):
				//      record discardPromptSeen=true, then use makeDiscardPadsResponder
				//      to discard a pad (not a scenario card).
				autoResponder: (msg: YGOProMsgResponseBase): Uint8Array | undefined => {
					if (msg instanceof YGOProMsgSelectChain) {
						const chain = msg as YGOProMsgSelectChain;
						if (chain.chains.some((c) => c.code === RUSH_RECKLESSLY)) {
							rrChainOffered = true;
						}
						return chain.defaultResponse();
					}

					if (msg instanceof YGOProMsgSelectCard) {
						// The hand-size discard is a SelectCard where all cards are in HAND.
						const LOCATION_HAND = 0x02;
						const allInHand = (msg as YGOProMsgSelectCard).cards.every(
							(c) => c.location === LOCATION_HAND,
						);
						if (allInHand) {
							discardPromptSeen = true;
							// Prefer discarding a pad, not a scenario card
							const padResponse = discardPadsResponder(msg);
							if (padResponse !== undefined) return padResponse;
						}
					}

					return undefined; // fall back to built-in for everything else
				},
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("T3 End Phase discard prompt appears (hand overflowed to 7 cards)", async () => {
			// T1 P0: opening=6, draw=1 → 7. SSet RR → 6 in hand. End turn.
			await driveT1SSet(duel, RUSH_RECKLESSLY);

			// T2 P1: pass (no change to P0's hand)
			await drivePassTurn(duel);

			// T3 P0: draw=1 → 7 in hand. End turn without playing anything.
			// The End Phase triggers hand-limit discard (7 > 6 → discard 1).
			const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			// Issue TO_EP to enter End Phase
			duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));

			// Advance until the next SelectIdleCmd (after End Phase completes).
			// The autoResponder handles the discard SelectCard during this advance.
			await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// The discard prompt must have appeared (confirms hand overflow scenario)
			expect(discardPromptSeen).toBe(true);
		});

		// ============================================================================
		// CORE RULE PROBE: No SelectChain for Set Quick-Play during hand-size discard
		//
		// 2010 expected: the hand-size discard is NOT a card effect activation — it
		// is a mandatory game mechanic. No chain window opens for Set Quick-Plays
		// (including Rush Recklessly face-down in the S/T zone).
		//
		// If this test fails (it.failing is removed and it starts passing as failing),
		// the engine is incorrectly offering RR as a response to the hand-size discard.
		// 2010-expected: absent from chain (discard is a game mechanic, not effect)
		// observed: needs runtime verification against this engine build
		// ============================================================================
		it("no SelectChain containing Rush Recklessly appears before or during the hand-size discard (2010: forced discard opens no chain window)", async () => {
			// T1 P0: SSet RR, end turn
			await driveT1SSet(duel, RUSH_RECKLESSLY);

			// T2 P1: pass
			await drivePassTurn(duel);

			// T3 P0: go to End Phase with 7 cards in hand
			const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));

			// Advance through End Phase. The autoResponder records whether RR
			// ever appeared in a SelectChain, and handles the discard SelectCard.
			await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// 2010 rule: no chain window for the hand-size forced discard
			expect(rrChainOffered).toBe(false);
		});
	});

	// Sanity note on PHASE_END:
	// The End Phase has phase value PHASE_END = 512 (OcgcoreCommonConstants.PHASE_END).
	// We use it as documentation; the test drives via TO_EP response rather than
	// watching for a NewPhase message, because advanceUntil(SelectIdleCmd) already
	// stops at the right boundary.
	void PHASE_END; // referenced for documentation; suppresses unused-variable lint
});
