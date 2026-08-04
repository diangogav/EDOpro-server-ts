/**
 * Quickdraw Synchron pre-errata (910003005) — Edison 2010 ruling.
 *
 * 2010 delta (edisonrul.ing, both schools agree): the hand Special Summon is
 * an IGNITION EFFECT — it activates, starts a chain and can be responded
 * to/negated — and sending 1 monster from hand to the GY is PART OF THE
 * EFFECT (resolution), not a cost. The modern card is an inherent summon
 * (EFFECT_SPSUMMON_PROC, no chain) whose send is paid up front.
 *
 * Pinned here (Lua-only card — runs on the stock core; the suite passes on
 * the fork binary too):
 *   1. 910003005 shows up as ACTIVATABLE (not spSummonable); activating goes
 *      on a chain (MSG_CHAINING) and resolution sends + summons.
 *   2. Boundary: official 20932152 stays an inherent summon — spSummonable,
 *      no MSG_CHAINING.
 *   3. Negation delta (the money case): Royal Oppression negates the
 *      pre-errata ACTIVATION → nothing sent, hand intact. Against the
 *      official card it negates the SUMMON → the sent monster is already in
 *      the grave (cost paid). Same scenario, opposite grave states.
 *   4. Macro Cosmos: the pre-errata effect still activates; the sent monster
 *      is banished by redirect and the summon proceeds (2010 ruling — the
 *      modern cost-based card can't even pay under Macro).
 */
import {
	IdleCmdType,
	YGOProMsgChaining,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectUnselectCard,
} from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED, makeDiscardPadsResponder } from "./test-fixtures";

const QUICKDRAW_PRE_ERRATA = 910003005;
const QUICKDRAW_OFFICIAL = 20932152;
const ROYAL_OPPRESSION = 93016201;
const MACRO_COSMOS = 30241314;
const LIGHT_VANILLA = 2863439;

const LOCATION_MZONE = 0x04;
const LOCATION_GRAVE = 0x10;
const LOCATION_REMOVED = 0x20;

const discardPadsResponder = makeDiscardPadsResponder([
	QUICKDRAW_PRE_ERRATA,
	QUICKDRAW_OFFICIAL,
	ROYAL_OPPRESSION,
	MACRO_COSMOS,
]);

/**
 * Auto-responder that activates `code` the first time it appears in a P1
 * SelectChain window, and handles end-phase discards; everything else falls
 * back to the built-in (decline).
 */
function chainOnceResponder(code: number): {
	responder: (msg: unknown) => Uint8Array | undefined;
	wasActivated: () => boolean;
} {
	let activated = false;
	return {
		responder: (msg: unknown) => {
			if (msg instanceof YGOProMsgSelectChain && !activated && msg.player === 1) {
				// desc===0 is the plain card-flip activation (e1) of a SET trap — it
				// resolves doing nothing. Only take the real numbered effect.
				const entry = msg.chains.find((c) => c.code === code && c.desc !== 0);
				if (entry) {
					activated = true;
					return msg.prepareResponse({
						code: entry.code,
						controller: entry.controller,
						location: entry.location,
						sequence: entry.sequence,
						desc: entry.desc,
					});
				}
			}
			return discardPadsResponder(msg);
		},
		wasActivated: () => activated,
	};
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

/** End the turn from the current idle window without acting. */
async function drivePassTurn(duel: HeadlessDuel): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/** Activate a card from the current idle window, then end the turn. */
async function driveActivateAndEndTurn(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.activatableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveActivateAndEndTurn: ${code} not activatable. ` +
				`Available: ${r.targetMessage.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/** Set a spell/trap from the current idle window, then end the turn. */
async function driveSSetAndEndTurn(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.ssetableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveSSetAndEndTurn: ${code} not ssetable. ` +
				`Available: ${r.targetMessage.ssetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SSET, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/**
 * Activate the pre-errata Quickdraw ignition from hand and return everything
 * seen until the next idle. Callers assert on the collected messages/state.
 * The send-selection (SelectCard over the own hand) is answered with the
 * first offered card when it appears; under negation it never appears.
 */
async function driveQuickdrawIgnition(duel: HeadlessDuel): Promise<{
	sawChaining: boolean;
	sawSendSelect: boolean;
}> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const qd = r.targetMessage.activatableCards.find((c) => c.code === QUICKDRAW_PRE_ERRATA);
	if (!qd) {
		throw new Error(
			`driveQuickdrawIgnition: ${QUICKDRAW_PRE_ERRATA} not activatable. ` +
				`Available: ${r.targetMessage.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: qd.code,
			controller: qd.controller,
			location: qd.location,
			sequence: qd.sequence,
		}),
	);

	let sawChaining = false;
	let sawSendSelect = false;
	// Advance to the next idle, answering the send-selection if it shows up.
	for (;;) {
		const step = await duel.advanceUntilOneOf([YGOProMsgSelectCard, YGOProMsgSelectIdleCmd]);
		sawChaining = sawChaining || step.allMessages.some((m) => m instanceof YGOProMsgChaining);
		const msg = step.targetMessage;
		if (msg instanceof YGOProMsgSelectCard) {
			sawSendSelect = true;
			const pick = msg.cards[0];
			duel.setResponse(
				msg.prepareResponse([
					{
						code: pick.code,
						controller: pick.controller,
						location: pick.location,
						sequence: pick.sequence,
					},
				]),
			);
			continue;
		}
		return { sawChaining, sawSendSelect };
	}
}

// ---------------------------------------------------------------------------
// Test 1: ignition activation + resolution (send is part of the effect)
// ---------------------------------------------------------------------------

describe("Quickdraw Synchron pre-errata (910003005) — Edison 2010 ruling", () => {
	describe("Test 1: hand SS is an ignition effect that resolves send + summon", () => {
		let duel: HeadlessDuel;

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [
					{ main: buildDeck([QUICKDRAW_PRE_ERRATA, LIGHT_VANILLA]) },
					{ main: buildDeck([]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: discardPadsResponder,
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("is activatable (not spSummonable), goes on a chain, then sends and summons", async () => {
			const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const idle = r.targetMessage;
			expect(idle.activatableCards.map((c) => c.code)).toContain(QUICKDRAW_PRE_ERRATA);
			expect(idle.spSummonableCards.map((c) => c.code)).not.toContain(QUICKDRAW_PRE_ERRATA);
			// Rewind is not possible — re-drive from this same idle via the helper's
			// own advanceUntil by responding here first.
			duel.setResponse(
				idle.prepareResponse(IdleCmdType.ACTIVATE, {
					code: QUICKDRAW_PRE_ERRATA,
					controller: 0,
					location: idle.activatableCards.find((c) => c.code === QUICKDRAW_PRE_ERRATA)!.location,
					sequence: idle.activatableCards.find((c) => c.code === QUICKDRAW_PRE_ERRATA)!.sequence,
				}),
			);

			let sawChaining = false;
			let sent = false;
			for (;;) {
				const step = await duel.advanceUntilOneOf([YGOProMsgSelectCard, YGOProMsgSelectIdleCmd]);
				sawChaining = sawChaining || step.allMessages.some((m) => m instanceof YGOProMsgChaining);
				const msg = step.targetMessage;
				if (msg instanceof YGOProMsgSelectCard) {
					sent = true;
					const pick = msg.cards[0];
					duel.setResponse(
						msg.prepareResponse([
							{
								code: pick.code,
								controller: pick.controller,
								location: pick.location,
								sequence: pick.sequence,
							},
						]),
					);
					continue;
				}
				break;
			}

			expect(sawChaining).toBe(true); // 2010: the activation goes on a chain
			expect(sent).toBe(true);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // Quickdraw
			expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(1); // sent monster
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 2: boundary — the official card stays an inherent summon
	// ─────────────────────────────────────────────────────────────────────────
	describe("Test 2: official 20932152 remains an inherent Special Summon", () => {
		let duel: HeadlessDuel;

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [{ main: buildDeck([QUICKDRAW_OFFICIAL, LIGHT_VANILLA]) }, { main: buildDeck([]) }],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: discardPadsResponder,
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("is spSummonable (not activatable) and never emits MSG_CHAINING", async () => {
			const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const idle = r.targetMessage;
			expect(idle.spSummonableCards.map((c) => c.code)).toContain(QUICKDRAW_OFFICIAL);
			expect(idle.activatableCards.map((c) => c.code)).not.toContain(QUICKDRAW_OFFICIAL);

			const sp = idle.spSummonableCards.find((c) => c.code === QUICKDRAW_OFFICIAL)!;
			duel.setResponse(
				idle.prepareResponse(IdleCmdType.SPSUMMON, {
					code: sp.code,
					controller: sp.controller,
					location: sp.location,
					sequence: sp.sequence,
				}),
			);

			let sawChaining = false;
			for (;;) {
				const step = await duel.advanceUntilOneOf([
					YGOProMsgSelectCard,
					YGOProMsgSelectUnselectCard,
					YGOProMsgSelectIdleCmd,
				]);
				sawChaining = sawChaining || step.allMessages.some((m) => m instanceof YGOProMsgChaining);
				const msg = step.targetMessage;
				if (msg instanceof YGOProMsgSelectUnselectCard) {
					const pick = msg.selectableCards[0];
					duel.setResponse(
						msg.prepareResponse({
							code: pick.code,
							controller: pick.controller,
							location: pick.location,
							sequence: pick.sequence,
						}),
					);
					continue;
				}
				if (msg instanceof YGOProMsgSelectCard) {
					const pick = msg.cards[0];
					duel.setResponse(
						msg.prepareResponse([
							{
								code: pick.code,
								controller: pick.controller,
								location: pick.location,
								sequence: pick.sequence,
							},
						]),
					);
					continue;
				}
				break;
			}

			expect(sawChaining).toBe(false); // inherent summon: no chain
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);
			expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(1);
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 3: negation differential — nothing sent (2010) vs cost paid (modern)
	// ─────────────────────────────────────────────────────────────────────────
	describe("Test 3: Royal Oppression negation", () => {
		it("pre-errata: activation negated → NOT summoned and NOTHING sent", async () => {
			const chain = chainOnceResponder(ROYAL_OPPRESSION);
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: buildDeck([QUICKDRAW_PRE_ERRATA, LIGHT_VANILLA]) },
					{ main: buildDeck([ROYAL_OPPRESSION]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: chain.responder,
			});
			try {
				await drivePassTurn(duel); // T1 P0
				await driveSSetAndEndTurn(duel, ROYAL_OPPRESSION); // T2 P1
				await drivePassTurn(duel); // T3 P0
				await driveActivateAndEndTurn(duel, ROYAL_OPPRESSION); // T4 P1: flip face-up
				const { sawSendSelect } = await driveQuickdrawIgnition(duel); // T5 P0

				expect(chain.wasActivated()).toBe(true);
				expect(sawSendSelect).toBe(false); // effect never resolved → no send selection
				expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(0); // not summoned
				// Grave: Quickdraw itself (Oppression also destroys the card) + the
				// T3 end-phase pad discard — but NOT the would-be sent monster.
				expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(2);
				// Hand: 8 drawn − 1 EP pad discard − Quickdraw destroyed = 6.
				// The monster that would have been sent is STILL here.
				expect(duel.queryHandCount(0)).toBe(6);
			} finally {
				await duel.cleanup();
			}
		});

		it("official (baseline): summon negated but the send was already paid", async () => {
			const chain = chainOnceResponder(ROYAL_OPPRESSION);
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: buildDeck([QUICKDRAW_OFFICIAL, LIGHT_VANILLA]) },
					{ main: buildDeck([ROYAL_OPPRESSION]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: chain.responder,
			});
			try {
				await drivePassTurn(duel); // T1 P0
				await driveSSetAndEndTurn(duel, ROYAL_OPPRESSION); // T2 P1
				await drivePassTurn(duel); // T3 P0
				await driveActivateAndEndTurn(duel, ROYAL_OPPRESSION); // T4 P1: flip face-up

				// T5 P0: inherent special summon of the official card
				const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
				const sp = r.targetMessage.spSummonableCards.find((c) => c.code === QUICKDRAW_OFFICIAL);
				if (!sp) {
					throw new Error(
						`official Quickdraw not spSummonable. Available: ${r.targetMessage.spSummonableCards.map((c) => c.code).join(", ")}`,
					);
				}
				duel.setResponse(
					r.targetMessage.prepareResponse(IdleCmdType.SPSUMMON, {
						code: sp.code,
						controller: sp.controller,
						location: sp.location,
						sequence: sp.sequence,
					}),
				);
				// Answer the send-cost selection; Oppression then negates the summon.
				for (;;) {
					const step = await duel.advanceUntilOneOf([
						YGOProMsgSelectCard,
						YGOProMsgSelectUnselectCard,
						YGOProMsgSelectIdleCmd,
					]);
					const msg = step.targetMessage;
					if (msg instanceof YGOProMsgSelectUnselectCard) {
						const pick = msg.selectableCards[0];
						duel.setResponse(
							msg.prepareResponse({
								code: pick.code,
								controller: pick.controller,
								location: pick.location,
								sequence: pick.sequence,
							}),
						);
						continue;
					}
					if (msg instanceof YGOProMsgSelectCard) {
						const pick = msg.cards[0];
						duel.setResponse(
							msg.prepareResponse([
								{
									code: pick.code,
									controller: pick.controller,
									location: pick.location,
									sequence: pick.sequence,
								},
							]),
						);
						continue;
					}
					break;
				}

				expect(chain.wasActivated()).toBe(true);
				expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(0); // summon negated
				// Grave: the SENT monster (cost already paid — the differential vs the
				// 2010 card) + Quickdraw destroyed by Oppression + the T3 EP pad.
				expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(3);
				// Hand: 8 drawn − 1 EP pad − sent monster − summoned Quickdraw = 5.
				expect(duel.queryHandCount(0)).toBe(5);
			} finally {
				await duel.cleanup();
			}
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 4: Macro Cosmos — effect activates, send is banished, summon happens
	// ─────────────────────────────────────────────────────────────────────────
	describe("Test 4: works under Macro Cosmos (sent monster banished)", () => {
		it("activates, banishes the sent monster and still summons", async () => {
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: buildDeck([QUICKDRAW_PRE_ERRATA, LIGHT_VANILLA]) },
					{ main: buildDeck([MACRO_COSMOS]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: discardPadsResponder,
			});
			try {
				await drivePassTurn(duel); // T1 P0
				await driveSSetAndEndTurn(duel, MACRO_COSMOS); // T2 P1
				await drivePassTurn(duel); // T3 P0 (EP discards a pad → grave)
				await driveActivateAndEndTurn(duel, MACRO_COSMOS); // T4 P1: flip face-up
				const { sawSendSelect } = await driveQuickdrawIgnition(duel); // T5 P0

				expect(sawSendSelect).toBe(true);
				expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // summoned
				// Grave only holds the pre-Macro T3 EP pad discard — the send itself
				// was redirected.
				expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(1);
				expect(duel.queryLocationCount(0, LOCATION_REMOVED)).toBe(1); // banished send
			} finally {
				await duel.cleanup();
			}
		});
	});
});
