/**
 * Treeborn Frog pre-errata (910003008, alias 12538374) — Edison 2010.
 *
 * 2010 SOI print (edisonformat.com functional-errata + yugipedia Card_Errata):
 *   - "[Trigger] has no 'once per turn' restriction" (BOTH schools agree) —
 *     the DUSA 2017 errata added "Once per turn". The ONLY script delta vs
 *     the modern base script is its SetCountLimit(1).
 *   - NOT deltas: the spell/trap gate (activation + resolution re-check) and
 *     the face-up "Treeborn Frog" block are era text AND modern behavior (a
 *     face-down copy has no name, so both eras ignore it).
 *
 * Engine notes (probed, 2026-08-03):
 *   - The modern SetCountLimit(1) is nearly inert under this core: a plain
 *     (no count code) limit is per card instance, so relocation (GY→field→
 *     GY, the Torrential path) resets it — the OFFICIAL script re-triggers
 *     there too (pinned as canary).
 *   - The real era gap sat elsewhere: the core's phase-event bookkeeping
 *     spends a card's optional TRIGGER_O phase trigger on activation even
 *     when the activation is NEGATED (Royal Oppression) or the resolution
 *     whiffs — no re-offer, count or no count. That breaks the UDE ruling
 *     in force in 2010: "If the effect of 'Treeborn Frog' is negated, you
 *     can activate its effect again during the same Standby Phase."
 *   - The 910 copy therefore models the effect as QUICK_O at
 *     EVENT_FREE_CHAIN gated to the owner's Standby Phase at open state
 *     (chain 0): every open window re-evaluates, so negated and whiffed
 *     attempts come back — the classic Frog-vs-Oppression war works.
 *
 * This migration replaces the broken 511002980 wiring (file without the `c`
 * prefix so the loader never served it, cdb alias=0, and BOTH codes active in
 * the lflist — official modern behavior was actually being played).
 */
import {
	IdleCmdType,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectOption,
	YGOProMsgResponseBase,
} from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

const TREEBORN_OFFICIAL = 12538374;
const TREEBORN_PRE_ERRATA = 910003008;
const TORRENTIAL = 53582587;
const ROYAL_OPPRESSION = 93016201;
const POISON_OF_THE_OLD_MAN = 8842266;
const BOOK_OF_MOON = 14087893;
const LOCATION_HAND = 0x02;
const LOCATION_MZONE = 0x04;

/**
 * Hand-limit discard responder: prefer discarding a Treeborn copy so it lands
 * in the GY (the scenarios revolve around reviving it); otherwise first card.
 */
function discardFrogResponder(frogCodes: number[]) {
	return (msg: YGOProMsgResponseBase): Uint8Array | undefined => {
		// Poison of the Old Man's gain-LP/deal-damage choice (the built-in
		// SelectOption default passes index 0, but this message wants one of
		// its option desc values).
		if (msg instanceof YGOProMsgSelectOption) {
			return msg.prepareResponse(msg.options[0]);
		}
		if (!(msg instanceof YGOProMsgSelectCard)) return undefined;
		if (!msg.cards.every((c) => c.location === LOCATION_HAND)) return undefined;
		const pick = msg.cards.find((c) => frogCodes.includes(c.code)) ?? msg.cards[0];
		return msg.prepareResponse([
			{
				code: pick.code,
				controller: pick.controller,
				location: pick.location,
				sequence: pick.sequence,
			},
		]);
	};
}

/**
 * Like discardFrogResponder, but P0 keeps the frog in hand until the given
 * (1-based) P0 discard window — used to time WHEN the frog reaches the GY
 * relative to the opponent's setup turns.
 */
function discardFrogOnWindowResponder(frogCodes: number[], frogOnP0Window: number) {
	let p0Windows = 0;
	return (msg: YGOProMsgResponseBase): Uint8Array | undefined => {
		if (msg instanceof YGOProMsgSelectOption) {
			return msg.prepareResponse(msg.options[0]);
		}
		if (!(msg instanceof YGOProMsgSelectCard)) return undefined;
		if (!msg.cards.every((c) => c.location === LOCATION_HAND)) return undefined;
		const isP0 = msg.cards[0].controller === 0;
		let pick: (typeof msg.cards)[number] | undefined;
		if (isP0) {
			p0Windows++;
			pick =
				p0Windows >= frogOnP0Window
					? msg.cards.find((c) => frogCodes.includes(c.code))
					: msg.cards.find((c) => !frogCodes.includes(c.code));
		}
		pick = pick ?? msg.cards.find((c) => !frogCodes.includes(c.code)) ?? msg.cards[0];
		return msg.prepareResponse([
			{
				code: pick.code,
				controller: pick.controller,
				location: pick.location,
				sequence: pick.sequence,
			},
		]);
	};
}

async function passTurn(duel: HeadlessDuel): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/** Activate a set/own spell-trap from the idle window (desc-0 flip), then end the turn. */
async function activateCardAndPass(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const t = r.targetMessage.activatableCards.find((c) => c.code === code);
	if (!t) {
		throw new Error(
			`${code} not activatable. Activatable: ${r.targetMessage.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: t.code,
			controller: t.controller,
			location: t.location,
			sequence: t.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/** Set a spell/trap from hand, then end the turn. */
async function setCardAndPass(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const t = r.targetMessage.ssetableCards.find((c) => c.code === code);
	if (!t) {
		throw new Error(
			`${code} not ssetable. Ssetable: ${r.targetMessage.ssetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SSET, {
			code: t.code,
			controller: t.controller,
			location: t.location,
			sequence: t.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

interface StandbyOpts {
	/** Accept at most this many frog trigger offers. */
	acceptLimit: number;
	/** Chain this code once from a P0 window AFTER the frog activation. */
	fireP0Once?: number;
	/** Chain this code once from a P1 chain window (e.g. set Torrential). */
	fireP1Once?: number;
}

interface StandbyResult {
	frogOffers: number;
	frogAccepts: number;
	p0Fired: boolean;
	p1Fired: boolean;
	idle: YGOProMsgSelectIdleCmd;
}

/**
 * Drive from the current point (P0 turn about to begin) through the Standby
 * Phase trigger windows until the Main Phase idle command. The frog's
 * optional phase trigger may surface as SelectEffectYn or as a SelectChain
 * entry — handle both.
 */
async function driveStandby(
	duel: HeadlessDuel,
	frogCode: number,
	opts: StandbyOpts,
): Promise<StandbyResult> {
	const res = { frogOffers: 0, frogAccepts: 0, p0Fired: false, p1Fired: false } as StandbyResult;
	const isFrog = (code: number) => code === frogCode || code === TREEBORN_OFFICIAL;
	// Safety cap: each iteration answers one window.
	for (let i = 0; i < 40; i++) {
		const r = await duel.advanceUntilOneOf([
			YGOProMsgSelectEffectYn,
			YGOProMsgSelectChain,
			YGOProMsgSelectIdleCmd,
		]);
		const m = r.targetMessage;
		if (m instanceof YGOProMsgSelectIdleCmd) {
			res.idle = m;
			return res;
		}
		if (m instanceof YGOProMsgSelectEffectYn) {
			if (isFrog(m.code)) {
				res.frogOffers++;
				const accept = res.frogAccepts < opts.acceptLimit;
				if (accept) res.frogAccepts++;
				duel.setResponse(m.prepareResponse(accept));
			} else {
				duel.setResponse(m.defaultResponse());
			}
			continue;
		}
		if (m instanceof YGOProMsgSelectChain) {
			const frogEntry = m.chains.find((c) => isFrog(c.code));
			const p0Entry =
				opts.fireP0Once !== undefined
					? m.chains.find((c) => c.code === opts.fireP0Once)
					: undefined;
			const p1Entry =
				opts.fireP1Once !== undefined
					? m.chains.find((c) => c.code === opts.fireP1Once)
					: undefined;
			if (frogEntry && m.player === 0 && res.frogAccepts < opts.acceptLimit) {
				res.frogOffers++;
				res.frogAccepts++;
				duel.setResponse(
					m.prepareResponse({
						code: frogEntry.code,
						controller: frogEntry.controller,
						location: frogEntry.location,
						sequence: frogEntry.sequence,
						desc: frogEntry.desc,
					}),
				);
			} else if (frogEntry && m.player === 0) {
				res.frogOffers++;
				duel.setResponse(m.defaultResponse());
			} else if (p0Entry && m.player === 0 && !res.p0Fired && res.frogAccepts > 0) {
				res.p0Fired = true;
				duel.setResponse(
					m.prepareResponse({
						code: p0Entry.code,
						controller: p0Entry.controller,
						location: p0Entry.location,
						sequence: p0Entry.sequence,
						desc: p0Entry.desc,
					}),
				);
			} else if (p1Entry && m.player === 1 && !res.p1Fired) {
				res.p1Fired = true;
				duel.setResponse(
					m.prepareResponse({
						code: p1Entry.code,
						controller: p1Entry.controller,
						location: p1Entry.location,
						sequence: p1Entry.sequence,
						desc: p1Entry.desc,
					}),
				);
			} else {
				duel.setResponse(m.defaultResponse());
			}
		}
	}
	throw new Error("driveStandby: no IdleCmd reached within the window cap");
}

function createDuel(frogCode: number, p0Main: number[], p1Main: number[]): Promise<HeadlessDuel> {
	return HeadlessDuel.create({
		decks: [{ main: p0Main }, { main: p1Main }],
		duelRule: 1,
		seed: FIXED_SEED,
		startHand: 6, // 7 after the turn draw → end-phase discard puts the frog in the GY
		autoResponder: discardFrogResponder([frogCode, TREEBORN_OFFICIAL]),
	});
}

describe("Treeborn Frog — no once-per-turn in 2010 (duel_rule 1)", () => {
	// Regression baseline: while the frog STAYS in the GY (whiffed revival),
	// no second offer arrives for the official TRIGGER_O script — the
	// phase-event bookkeeping spends the trigger. The 910 copy retries (see
	// its whiff test below).
	it("baseline: official frog is not re-offered after a whiffed revival in the same Standby Phase", async () => {
		const duel = await createDuel(
			TREEBORN_OFFICIAL,
			buildDeck([TREEBORN_OFFICIAL, POISON_OF_THE_OLD_MAN]),
			buildDeck([]),
		);
		try {
			await passTurn(duel); // T1 P0: EP discard → frog to GY (Poison stays in hand)
			await passTurn(duel); // T2 P1
			// T3 P0 standby: accept the trigger, chain own Poison → the spent
			// quick-play sits in the S/T zone until the chain ends → revival
			// whiffs on the resolution re-check; frog never left the GY.
			const res = await driveStandby(duel, TREEBORN_OFFICIAL, {
				acceptLimit: 99,
				fireP0Once: POISON_OF_THE_OLD_MAN,
			});
			expect(res.p0Fired).toBe(true);
			expect(res.frogAccepts).toBe(1); // only the first offer existed
			expect(res.frogOffers).toBe(1);
			// Field: empty — the revival whiffed.
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(0);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	// Engine canary: the OFFICIAL script also loops on the relocation path —
	// its per-instance SetCountLimit(1) resets when the frog returns to the
	// GY. If an upstream core/script update ever hardens that count, this pin
	// fails and the 910 copy's era semantics must be re-audited against it.
	it("baseline: official frog also revives again after Torrential (per-instance count resets)", async () => {
		const duel = await createDuel(
			TREEBORN_OFFICIAL,
			buildDeck([TREEBORN_OFFICIAL]),
			buildDeck([TORRENTIAL]),
		);
		try {
			await passTurn(duel); // T1 P0
			await setCardAndPass(duel, TORRENTIAL); // T2 P1
			const res = await driveStandby(duel, TREEBORN_OFFICIAL, {
				acceptLimit: 99,
				fireP1Once: TORRENTIAL,
			});
			expect(res.p1Fired).toBe(true);
			expect(res.frogAccepts).toBe(2);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	// Same whiff scenario on the copy: with no once-per-turn, the era frog can
	// try again once the spent chained spell has left the field (same
	// principle as the UDE negation ruling — the effect "can be activated
	// multiple times during the same turn"). The free-chain modeling grants
	// this; the second attempt resolves cleanly.
	it("pre-errata: retries after a whiffed revival and revives in the same Standby Phase", async () => {
		const duel = await createDuel(
			TREEBORN_PRE_ERRATA,
			buildDeck([TREEBORN_PRE_ERRATA, POISON_OF_THE_OLD_MAN]),
			buildDeck([]),
		);
		try {
			await passTurn(duel);
			await passTurn(duel);
			const res = await driveStandby(duel, TREEBORN_PRE_ERRATA, {
				acceptLimit: 99,
				fireP0Once: POISON_OF_THE_OLD_MAN,
			});
			expect(res.p0Fired).toBe(true);
			expect(res.frogOffers).toBeGreaterThanOrEqual(2); // re-offered after the whiff
			expect(res.frogAccepts).toBe(2);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // retry succeeded
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	// The classic 2010 loop: revive → opponent destroys it → revive again in
	// the same Standby Phase. (Engine note: the official script also loops on
	// THIS path — relocation resets its per-instance count — so this is a
	// 2010-behavior pin, not a differential.)
	it("pre-errata: revives again after Torrential destroys it in the same Standby Phase", async () => {
		const duel = await createDuel(
			TREEBORN_PRE_ERRATA,
			buildDeck([TREEBORN_PRE_ERRATA]),
			buildDeck([TORRENTIAL]),
		);
		try {
			await passTurn(duel); // T1 P0
			await setCardAndPass(duel, TORRENTIAL); // T2 P1
			const res = await driveStandby(duel, TREEBORN_PRE_ERRATA, {
				acceptLimit: 99,
				fireP1Once: TORRENTIAL,
			});
			expect(res.p1Fired).toBe(true);
			expect(res.frogAccepts).toBe(2); // revived, destroyed, revived again
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	it("pre-errata: a set spell/trap still gates the trigger (no offer)", async () => {
		const duel = await createDuel(
			TREEBORN_PRE_ERRATA,
			buildDeck([TREEBORN_PRE_ERRATA, BOOK_OF_MOON]),
			buildDeck([]),
		);
		try {
			// T1 P0: set Book of Moon, end turn (EP discard → frog to GY).
			await setCardAndPass(duel, BOOK_OF_MOON);
			await passTurn(duel); // T2 P1
			const res = await driveStandby(duel, TREEBORN_PRE_ERRATA, { acceptLimit: 99 }); // T3 P0
			expect(res.frogOffers).toBe(0);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	// THE classic Edison interaction (Frog Monarchs vs Royal Oppression). UDE
	// ruling in force in 2010 (yugipedia Previously Official Rulings, marked
	// out-of-date ONLY because of the modern once-per-turn): "If the effect of
	// 'Treeborn Frog' is negated, you can activate its effect again during the
	// same Standby Phase and Special Summon it." Oppression must pay 800 per
	// attempt; the frog never leaves the GY (Oppression's destroy is a no-op
	// on a GY card).
	it("pre-errata: re-activates in the same Standby Phase after Royal Oppression negates it", async () => {
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([TREEBORN_PRE_ERRATA]) }, { main: buildDeck([ROYAL_OPPRESSION]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			startHand: 6,
			// Frog reaches the GY on P0's SECOND discard window (T3 EP) so
			// Oppression is already face-up when the first trigger comes (a SET
			// trap's chain window only offers the do-nothing flip).
			autoResponder: discardFrogOnWindowResponder([TREEBORN_PRE_ERRATA], 2),
		});
		try {
			await passTurn(duel); // T1 P0 (EP: pad)
			await setCardAndPass(duel, ROYAL_OPPRESSION); // T2 P1
			await passTurn(duel); // T3 P0 (EP: frog → GY)
			await activateCardAndPass(duel, ROYAL_OPPRESSION); // T4 P1: flip face-up
			// T5 P0 standby: trigger → Oppression negates → trigger AGAIN →
			// P1 declines (fireP1Once spent) → revival resolves.
			const res = await driveStandby(duel, TREEBORN_PRE_ERRATA, {
				acceptLimit: 99,
				fireP1Once: ROYAL_OPPRESSION,
			});
			expect(res.p1Fired).toBe(true);
			expect(res.frogOffers).toBeGreaterThanOrEqual(2); // re-offered after negation
			expect(res.frogAccepts).toBe(2);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // second attempt succeeded
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	// Baseline for the same scenario: the official once-per-turn frog stays
	// down after a negated activation (the count is consumed and the frog
	// never relocated).
	it("baseline: official frog cannot re-activate after Royal Oppression negates it", async () => {
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([TREEBORN_OFFICIAL]) }, { main: buildDeck([ROYAL_OPPRESSION]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			startHand: 6,
			autoResponder: discardFrogOnWindowResponder([TREEBORN_OFFICIAL], 2),
		});
		try {
			await passTurn(duel); // T1 P0
			await setCardAndPass(duel, ROYAL_OPPRESSION); // T2 P1
			await passTurn(duel); // T3 P0 (EP: frog → GY)
			await activateCardAndPass(duel, ROYAL_OPPRESSION); // T4 P1
			const res = await driveStandby(duel, TREEBORN_OFFICIAL, {
				acceptLimit: 99,
				fireP1Once: ROYAL_OPPRESSION,
			});
			expect(res.p1Fired).toBe(true);
			expect(res.frogAccepts).toBe(1);
			expect(res.frogOffers).toBe(1);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(0);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	it("pre-errata: a face-up Treeborn on the field blocks the second copy's trigger", async () => {
		const duel = await createDuel(
			TREEBORN_PRE_ERRATA,
			buildDeck([TREEBORN_PRE_ERRATA, TREEBORN_PRE_ERRATA]),
			buildDeck([]),
		);
		try {
			await passTurn(duel); // T1: EP discard → frog #1 to GY
			await passTurn(duel); // T2 P1
			// T3: revive frog #1; at EP the responder discards frog #2 (hand 7).
			const res1 = await driveStandby(duel, TREEBORN_PRE_ERRATA, { acceptLimit: 1 });
			expect(res1.frogAccepts).toBe(1);
			duel.setResponse(res1.idle.prepareResponse(IdleCmdType.TO_EP));
			await passTurn(duel); // T4 P1
			// T5: frog #2 sits in the GY but frog #1 is face-up on the field —
			// the era [Condition] blocks the trigger entirely.
			const res2 = await driveStandby(duel, TREEBORN_PRE_ERRATA, { acceptLimit: 99 });
			expect(res2.frogOffers).toBe(0);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);
		} finally {
			await duel.cleanup();
		}
	}, 120000);
});
