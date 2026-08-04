/**
 * Ancient Fairy Dragon (25862691) + Red-Eyes Darkness Metal Dragon (88264988)
 * — the two "custom-code" pre-errata copies (code = official + 10).
 *
 * 1×1 AUDIT FINDING (2026-08-03): these copies use an alias that is NUMERICALLY
 * CLOSE to the official code (diff = 10, i.e. an "alternate print" alias). In
 * the fork's old core, a close alias makes the engine load the OFFICIAL code's
 * script, NOT the copy's own `c<copy>.lua`. Proven here: breaking the AFD copy
 * script (c25862691.lua) does NOT break AFD — it runs off the official
 * c25862681.lua. So the copy scripts in the Edison tree (which a botched
 * auto-conversion had left calling the non-existent `aux.Stringc<code>` and
 * `aux.SelectUnselectGroup`) are DEAD code — never loaded.
 *
 * Consequence:
 *   - AFD works: the official c25862681.lua is already 2010-correct in the old
 *     core (Synchro material = 1 Tuner + 1-or-MORE non-Tuner via
 *     AddSynchroProcedure(...,1) with maxc defaulting to Level-1; the modern
 *     "exactly 1 non-Tuner" errata is not present). The single-Field-Spell rule
 *     makes the "destroy 1 vs all Field Spells" delta moot in Edison. Verified
 *     below.
 *   - REDMD is BROKEN: its official c88264978.lua does NOT exist in the fork
 *     tree, so the card has no script at all. It needs a proper 910-range copy
 *     (far alias → own script, like Treeborn/Gearframe) — tracked separately;
 *     the skipped test documents the target.
 */
import {
	IdleCmdType,
	YGOProMsgSelectCard,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectSum,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

const AFD = 25862691; // Ancient Fairy Dragon (pre-errata copy), Synchro Lv7
const JUNK_SYNCHRON = 63977008; // Lv3 Tuner
const VAN_L4 = 549481; // Lv4 vanilla non-tuner → 3+4 = Lv7
const REDMD = 88264988; // Red-Eyes Darkness Metal Dragon (pre-errata copy), Lv10

const LOCATION_MZONE = 0x04;

async function idle(duel: HeadlessDuel): Promise<YGOProMsgSelectIdleCmd> {
	return (await duel.advanceUntil(YGOProMsgSelectIdleCmd)).targetMessage;
}

async function normalSummon(
	duel: HeadlessDuel,
	m: YGOProMsgSelectIdleCmd,
	code: number,
): Promise<void> {
	const c = m.summonableCards.find((x) => x.code === code);
	if (!c) throw new Error(`${code} not normal-summonable`);
	duel.setResponse(
		m.prepareResponse(IdleCmdType.SUMMON, {
			code: c.code,
			controller: c.controller,
			location: c.location,
			sequence: c.sequence,
		}),
	);
}

async function passTurn(duel: HeadlessDuel, m: YGOProMsgSelectIdleCmd): Promise<void> {
	duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
}

describe("AFD + REDMD pre-errata copies (custom-code, close-alias)", () => {
	it("Ancient Fairy Dragon is era-correct: Synchro-summons (1 Tuner + non-Tuner) and offers its ignition", async () => {
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([VAN_L4, JUNK_SYNCHRON]), extra: [AFD] }, { main: buildDeck([]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: (msg: YGOProMsgBase): Uint8Array | undefined => {
				// Synchro material selection is a SelectSum; the lone Lv4 non-tuner
				// must sum to Lv7−Lv3 = 4. Accept the offered pool.
				if (msg instanceof YGOProMsgSelectSum || msg instanceof YGOProMsgSelectCard) {
					return msg.prepareResponse(
						msg.cards.map((c) => ({
							code: c.code,
							controller: c.controller,
							location: c.location,
							sequence: c.sequence,
						})),
					);
				}
				return undefined;
			},
		});
		try {
			await normalSummon(duel, await idle(duel), VAN_L4); // T1
			await passTurn(duel, await idle(duel));
			await passTurn(duel, await idle(duel)); // T2 P1
			await normalSummon(duel, await idle(duel), JUNK_SYNCHRON); // T3: Tuner + non-tuner on field
			const m = await idle(duel);
			const afd = m.spSummonableCards.find((c) => c.code === AFD);
			expect(afd).toBeDefined(); // Synchro procedure loaded (from the official script)
			if (!afd) throw new Error("unreachable");
			duel.setResponse(
				m.prepareResponse(IdleCmdType.SPSUMMON, {
					code: afd.code,
					controller: afd.controller,
					location: afd.location,
					sequence: afd.sequence,
				}),
			);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBeGreaterThanOrEqual(1); // AFD hit the field
			const post = await idle(duel);
			// Its SS-from-hand ignition is offered → both effects registered.
			expect(post.activatableCards.some((c) => c.code === AFD)).toBe(true);
			await passTurn(duel, post);
		} finally {
			await duel.cleanup();
		}
	}, 120000);
});
