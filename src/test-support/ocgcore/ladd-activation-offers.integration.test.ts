/**
 * Regression: spell/trap activation offer lists under Light and Darkness
 * Dragon (duel_rule 1).
 *
 * Closes the "activation anomaly" that was filed as an open engine finding
 * during the LADD verification session (spell/trap activations reportedly
 * disappearing from idle/mid-chain offer lists while monster quick effects
 * stayed offered). A dedicated probe found NO engine bug — the observation was
 * a mix of correct spell-speed rules and driver desync:
 *
 *   1. idle-activatable: with LADD face-up, all activations are offered every
 *      time; a card only leaves the list once it has been USED (normal spells
 *      go to the GY, a set quick-play leaves its zone). LADD's mandatory
 *      QUICK_F negate chains to each activation (2 chain links) but never
 *      suppresses the offer.
 *   2. mid-chain (SelectChain): only spell-speed-2 cards can be added to a
 *      chain in progress — Offerings to the Doomed (quick-play) appears,
 *      Fissure/Smashing (normal spells, speed 1) never do. That is the rule,
 *      not a bug: a speed-1 card can only ever be chain link 1.
 *   3. mid-process queryFieldCount inside the responder does NOT corrupt any
 *      subsequent offer list (hammered variant is byte-for-byte identical).
 *
 * If this ever regresses (LADD or the core suppressing a legal activation, or
 * a mid-process query corrupting the stream), these assertions fail.
 */
import {
	IdleCmdType,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectTribute,
	YGOProMsgResponseBase,
} from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

const LADD = 47297616;
const FISSURE = 66788016; // normal spell (speed 1) — hand
const SMASHING = 97169186; // normal spell (speed 1) — hand
const OFFERINGS = 19230407; // Offerings to the Doomed — quick-play (speed 2), SET
const VAN_A = 2863439;
const VAN_B = 549481;
const LOCATION_HAND = 0x02;
const LOCATION_MZONE = 0x04;
const LOCATION_GRAVE = 0x10;

const SPEED1 = [FISSURE, SMASHING];
const WATCHED = [FISSURE, SMASHING, OFFERINGS];

interface IdleRecord {
	label: string;
	watchedPresent: number[];
}

interface ScenarioResult {
	idle: IdleRecord[];
	/** Every SelectChain offer list seen during the scenario (mid-chain). */
	midChain: number[][];
}

async function idle(duel: HeadlessDuel): Promise<YGOProMsgSelectIdleCmd> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	return r.targetMessage;
}

function recordIdle(label: string, msg: YGOProMsgSelectIdleCmd, out: IdleRecord[]): void {
	const offers = msg.activatableCards.map((c) => c.code);
	out.push({ label, watchedPresent: WATCHED.filter((w) => offers.includes(w)) });
}

async function runScenario(midProcessQueries: boolean): Promise<ScenarioResult> {
	const idleRecords: IdleRecord[] = [];
	const midChain: number[][] = [];
	let duelRef: HeadlessDuel | null = null;

	const duel = await HeadlessDuel.create({
		decks: [
			{ main: buildDeck([VAN_A, VAN_B, LADD, FISSURE, SMASHING, OFFERINGS]) },
			{ main: buildDeck([VAN_A, VAN_A]) },
		],
		duelRule: 1,
		seed: FIXED_SEED,
		autoResponder: (msg: YGOProMsgResponseBase): Uint8Array | undefined => {
			if (midProcessQueries && duelRef) {
				// Hammer the query API mid-process; must not corrupt offer lists.
				duelRef.queryLocationCount(0, LOCATION_GRAVE);
				duelRef.queryLocationCount(0, LOCATION_MZONE);
				duelRef.queryHandCount(0);
			}
			if (msg instanceof YGOProMsgSelectChain) {
				midChain.push(msg.chains.map((c) => c.code));
				return undefined; // built-in declines
			}
			if (msg instanceof YGOProMsgSelectCard) {
				const pick =
					msg.cards.find(
						(c) => c.location === LOCATION_HAND && !WATCHED.includes(c.code) && c.code !== LADD,
					) ?? msg.cards[0];
				return msg.prepareResponse([
					{
						code: pick.code,
						controller: pick.controller,
						location: pick.location,
						sequence: pick.sequence,
					},
				]);
			}
			return undefined;
		},
	});
	duelRef = duel;

	const summon = async (m: YGOProMsgSelectIdleCmd, code: number): Promise<void> => {
		const card = m.summonableCards.find((c) => c.code === code);
		if (!card) throw new Error(`${code} not summonable`);
		duel.setResponse(
			m.prepareResponse(IdleCmdType.SUMMON, {
				code: card.code,
				controller: card.controller,
				location: card.location,
				sequence: card.sequence,
			}),
		);
	};

	try {
		// T1 P0: summon VAN_A, set Offerings, pass.
		let m = await idle(duel);
		await summon(m, VAN_A);
		m = await idle(duel);
		const off = m.ssetableCards.find((c) => c.code === OFFERINGS);
		if (!off) throw new Error("T1: Offerings not ssetable");
		duel.setResponse(
			m.prepareResponse(IdleCmdType.SSET, {
				code: off.code,
				controller: off.controller,
				location: off.location,
				sequence: off.sequence,
			}),
		);
		m = await idle(duel);
		recordIdle("T1 same-turn set (Offerings must be ABSENT)", m, idleRecords);
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));

		// T2 P1: summon, pass.
		m = await idle(duel);
		await summon(m, VAN_A);
		m = await idle(duel);
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));

		// T3 P0: CHECK A (no LADD yet), summon VAN_B, pass.
		m = await idle(duel);
		recordIdle("CHECK A — no LADD", m, idleRecords);
		await summon(m, VAN_B);
		m = await idle(duel);
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));

		// T4 P1: summon, pass.
		m = await idle(duel);
		await summon(m, VAN_A);
		m = await idle(duel);
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));

		// T5 P0: tribute summon LADD (VAN_A + VAN_B).
		m = await idle(duel);
		await summon(m, LADD);
		const rt = await duel.advanceUntil(YGOProMsgSelectTribute);
		const picks = rt.targetMessage.cards.slice(0, 2).map((c) => ({
			code: c.code,
			controller: c.controller,
			location: c.location,
			sequence: c.sequence,
		}));
		duel.setResponse(rt.targetMessage.prepareResponse(picks));

		// CHECK B: LADD face-up, before any activation — all 3 must be offered.
		m = await idle(duel);
		recordIdle("CHECK B — LADD face-up, pre-activations", m, idleRecords);

		// Activate the watched cards one by one; record the idle list after each.
		for (const [i, code] of [FISSURE, SMASHING, OFFERINGS].entries()) {
			const entry = m.activatableCards.find((c) => c.code === code);
			if (!entry) throw new Error(`activation #${i + 1} (${code}) not offered`);
			duel.setResponse(
				m.prepareResponse(IdleCmdType.ACTIVATE, {
					code: entry.code,
					controller: entry.controller,
					location: entry.location,
					sequence: entry.sequence,
				}),
			);
			m = await idle(duel);
			recordIdle(`CHECK ${"CDE"[i]} — after activation #${i + 1} (${code})`, m, idleRecords);
		}
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));

		return { idle: idleRecords, midChain };
	} finally {
		await duel.cleanup();
	}
}

describe("LADD — spell/trap activation offer lists (no anomaly)", () => {
	it("idle offers are consistent with LADD in play (only used cards leave the list)", async () => {
		const { idle: records } = await runScenario(false);

		const byLabel = (prefix: string) =>
			records
				.find((r) => r.label.startsWith(prefix))
				?.watchedPresent.slice()
				.sort() ?? [];

		// Same-turn set: Offerings not yet activatable.
		expect(byLabel("T1 same-turn set")).toEqual([]);
		// No LADD: all three offered.
		expect(byLabel("CHECK A")).toEqual([...WATCHED].sort());
		// LADD face-up: LADD does NOT suppress anything — still all three.
		expect(byLabel("CHECK B")).toEqual([...WATCHED].sort());
		// Each activation removes only the card just used.
		expect(byLabel("CHECK C")).toEqual([SMASHING, OFFERINGS].sort());
		expect(byLabel("CHECK D")).toEqual([OFFERINGS]);
		expect(byLabel("CHECK E")).toEqual([]);
	}, 120000);

	it("mid-chain windows never offer a speed-1 normal spell", async () => {
		const { midChain } = await runScenario(false);
		const withOffers = midChain.filter((codes) => codes.length > 0);
		// Some mid-chain windows do offer Offerings (speed 2, set, not same-turn).
		expect(withOffers.some((codes) => codes.includes(OFFERINGS))).toBe(true);
		// But NO mid-chain window ever offers Fissure/Smashing (speed 1 can only
		// be chain link 1 — this is the rule the session misread as an anomaly).
		for (const codes of midChain) {
			for (const s1 of SPEED1) expect(codes).not.toContain(s1);
		}
	}, 120000);

	it("mid-process queries do not corrupt offer lists (clean === hammered)", async () => {
		const clean = await runScenario(false);
		const hammered = await runScenario(true);
		expect(hammered.idle).toEqual(clean.idle);
		expect(hammered.midChain).toEqual(clean.midChain);
	}, 120000);
});
