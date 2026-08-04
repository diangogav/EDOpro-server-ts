/**
 * Fortune Lady Light pre-errata (910003010, alias 34471458) — Edison 2010.
 *
 * Delta (yugipedia Card_Errata): the leave-field Trigger ("SS 1 Fortune Lady
 * from Deck when this card is removed from the field by a card effect") had NO
 * "face-up" requirement in the ANPR-era print; OP11 (2019) added it. So 2010
 * fires the Trigger even when Fortune Lady Light leaves the field FACE-DOWN
 * (the reveal is a game rule). The base script gates `spcon` on
 * `IsPreviousPosition(POS_FACEUP)`; the 910 copy drops it.
 *
 * Scenario: flip Fortune Lady Light face-down (Book of Moon), then destroy it
 * with Dark Hole (a card effect). It leaves the field face-down.
 *   - 910 copy  → Trigger fires → a "Fortune Lady" is Special Summoned from Deck.
 *   - official  → Trigger does NOT fire (it was face-down) → nothing summoned.
 */
import {
	IdleCmdType,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectIdleCmd,
	YGOProMsgResponseBase,
} from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

const FLL_OFF = 34471458; // official Fortune Lady Light (baseline)
const FLL_PRE = 910003010; // pre-errata copy
const BOOK = 14087893; // Book of Moon (flip face-down)
const DARK_HOLE = 53129443; // destroy all monsters (a card effect, hits face-down)
const FL_TARGET = 82693917; // another "Fortune Lady" (deck target for the revive)
const LOCATION_MZONE = 0x04;

async function idle(duel: HeadlessDuel): Promise<YGOProMsgSelectIdleCmd> {
	return (await duel.advanceUntil(YGOProMsgSelectIdleCmd)).targetMessage;
}

/** Activate `code` from the idle, then answer its target SelectCard with `targetCode`. */
async function activateOnTarget(
	duel: HeadlessDuel,
	m: YGOProMsgSelectIdleCmd,
	code: number,
	targetCode: number,
): Promise<void> {
	const c = m.activatableCards.find((x) => x.code === code);
	if (!c)
		throw new Error(`${code} not activatable (have ${m.activatableCards.map((a) => a.code)})`);
	duel.setResponse(
		m.prepareResponse(IdleCmdType.ACTIVATE, {
			code: c.code,
			controller: c.controller,
			location: c.location,
			sequence: c.sequence,
		}),
	);
	const sc = (await duel.advanceUntil(YGOProMsgSelectCard)).targetMessage;
	const t = sc.cards.find((x) => x.code === targetCode) ?? sc.cards[0];
	duel.setResponse(
		sc.prepareResponse([
			{ code: t.code, controller: t.controller, location: t.location, sequence: t.sequence },
		]),
	);
}

/** Run the scenario with the given Fortune Lady Light code; return MZONE count
 * for P0 after Dark Hole resolves (1 if a Fortune Lady was revived, else 0). */
async function runScenario(fllCode: number): Promise<number> {
	const p0 = buildDeck([fllCode, BOOK, DARK_HOLE]);
	p0[18] = FL_TARGET; // sits in the Deck (not the opening hand) as the revive target
	const duel = await HeadlessDuel.create({
		decks: [{ main: p0 }, { main: buildDeck([]) }],
		duelRule: 1,
		seed: FIXED_SEED,
		autoResponder: (msg: YGOProMsgResponseBase): Uint8Array | undefined => {
			// Fortune Lady Light's leave-field Trigger — activate it (and pick the
			// Fortune Lady deck target through the SelectCard that follows).
			if (msg instanceof YGOProMsgSelectChain) {
				const entry = msg.chains.find((c) => c.code === fllCode);
				if (entry)
					return msg.prepareResponse({
						code: entry.code,
						controller: entry.controller,
						location: entry.location,
						sequence: entry.sequence,
						desc: entry.desc,
					});
				return msg.defaultResponse();
			}
			if (msg instanceof YGOProMsgSelectEffectYn) {
				return msg.prepareResponse(msg.code === fllCode);
			}
			if (msg instanceof YGOProMsgSelectCard) {
				// The revive's deck-target selection: pick the Fortune Lady.
				const t = msg.cards.find((c) => c.code === FL_TARGET) ?? msg.cards[0];
				return msg.prepareResponse([
					{ code: t.code, controller: t.controller, location: t.location, sequence: t.sequence },
				]);
			}
			return undefined;
		},
	});
	try {
		// T1 P0: summon FLL, flip it face-down (Book of Moon), then Dark Hole it.
		let m = await idle(duel);
		const s = m.summonableCards.find((c) => c.code === fllCode);
		if (!s) throw new Error(`${fllCode} not summonable`);
		duel.setResponse(
			m.prepareResponse(IdleCmdType.SUMMON, {
				code: s.code,
				controller: s.controller,
				location: s.location,
				sequence: s.sequence,
			}),
		);
		m = await idle(duel);
		await activateOnTarget(duel, m, BOOK, fllCode); // flip FLL face-down
		m = await idle(duel);
		// Dark Hole (no target) — destroys the face-down FLL by card effect.
		const dh = m.activatableCards.find((c) => c.code === DARK_HOLE);
		if (!dh) throw new Error("Dark Hole not activatable");
		duel.setResponse(
			m.prepareResponse(IdleCmdType.ACTIVATE, {
				code: dh.code,
				controller: dh.controller,
				location: dh.location,
				sequence: dh.sequence,
			}),
		);
		// Drive to the next idle; the leave-field Trigger (if any) resolves along the way.
		const after = await idle(duel);
		const mz = duel.queryLocationCount(0, LOCATION_MZONE);
		duel.setResponse(after.prepareResponse(IdleCmdType.TO_EP));
		return mz;
	} finally {
		await duel.cleanup();
	}
}

describe("Fortune Lady Light — 2010 revives even when it leaves the field face-down", () => {
	it("pre-errata (910003010): face-down destruction DOES trigger the revive", async () => {
		expect(await runScenario(FLL_PRE)).toBe(1); // a Fortune Lady is on the field
	}, 120000);

	it("baseline (official 34471458): face-down destruction does NOT trigger it", async () => {
		expect(await runScenario(FLL_OFF)).toBe(0); // nothing revived
	}, 120000);
});
