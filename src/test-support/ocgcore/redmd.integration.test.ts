/**
 * Red-Eyes Darkness Metal Dragon pre-errata copy 910003012 (alias 88264978) —
 * Edison 2010.
 *
 * SOURCE (edisonformat.com/rulings/relevant-errata): the [Summon] ("banish 1
 * face-up Dragon-Type monster you control to Special Summon this") has NO
 * "once per name" restriction, and the [Ignition] ("Once per turn... Special
 * Summon 1 Dragon from your hand or GY") has NO "once per name" either. The
 * modern print added both. So in Edison you can Special Summon MULTIPLE REDMD
 * per turn — the community bug "Pre-Errata REDMD will not let you summon more
 * than one per turn" (forum.duelistsunite.org).
 *
 * The fork's correct pre-errata rewrite existed at the DEAD close-alias code
 * c88264988.lua (official+10 → the old core loads the official c88264978.lua
 * instead, which HAS the once-per-name). 910003012 is a far-alias home so the
 * copy's own script loads.
 *
 * Delta observable (the [Summon] once-per-name): Normal Summon a Dragon, then
 * Special Summon REDMD #1 by banishing it. REDMD #1 is itself a face-up Dragon,
 * so a 2nd REDMD in hand could banish it to summon too. Is that 2nd copy still
 * Special-Summonable the same turn?
 *   - 910003012 (pre-errata) → YES (no once-per-name on the summon proc).
 *   - 88264978  (official)   → NO  (proc SetCountLimit(1, code+OATH) consumed).
 */
import {
	IdleCmdType,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectSum,
	YGOProMsgSelectUnselectCard,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

const REDMD_PRE = 910003012; // Red-Eyes Darkness Metal Dragon (pre-errata copy)
const REDMD_OFF = 88264978; // official REDMD (baseline)
const LUSTER = 11091375; // Luster Dragon — Lv4 vanilla Dragon (banish fodder)

async function idle(duel: HeadlessDuel): Promise<YGOProMsgSelectIdleCmd> {
	return (await duel.advanceUntil(YGOProMsgSelectIdleCmd)).targetMessage;
}
function autoResponder(msg: YGOProMsgBase): Uint8Array | undefined {
	if (msg instanceof YGOProMsgSelectUnselectCard) {
		if (msg.selectableCards.length > 0) {
			const p = msg.selectableCards[0];
			return msg.prepareResponse({
				code: p.code,
				controller: p.controller,
				location: p.location,
				sequence: p.sequence,
			});
		}
		return msg.defaultResponse();
	}
	if (msg instanceof YGOProMsgSelectSum || msg instanceof YGOProMsgSelectCard) {
		const n = Math.max(1, msg.min);
		return msg.prepareResponse(
			msg.cards.slice(0, n).map((c) => ({
				code: c.code,
				controller: c.controller,
				location: c.location,
				sequence: c.sequence,
			})),
		);
	}
	if (msg instanceof YGOProMsgSelectChain) return msg.defaultResponse();
	return undefined;
}

/** Summon a Dragon, Special Summon REDMD #1 by banishing it, then report whether
 * a 2nd REDMD (same code) is still Special-Summonable this turn. */
async function secondRedmdSummonable(redmdCode: number): Promise<boolean> {
	const duel = await HeadlessDuel.create({
		decks: [{ main: buildDeck([redmdCode, redmdCode, LUSTER]) }, { main: buildDeck([]) }],
		duelRule: 1,
		seed: FIXED_SEED,
		autoResponder,
	});
	try {
		// T1 P0: Normal Summon Luster (a face-up Dragon to banish).
		let m = await idle(duel);
		const s = m.summonableCards.find((c) => c.code === LUSTER);
		if (!s) throw new Error(`Luster not summonable (have ${m.summonableCards.map((x) => x.code)})`);
		duel.setResponse(
			m.prepareResponse(IdleCmdType.SUMMON, {
				code: s.code,
				controller: s.controller,
				location: s.location,
				sequence: s.sequence,
			}),
		);
		// SS REDMD #1 via its summon proc (banishing Luster — handled by autoResponder).
		m = await idle(duel);
		const sp = m.spSummonableCards.find((c) => c.code === redmdCode);
		if (!sp)
			throw new Error(
				`REDMD #1 not SP-summonable (have ${m.spSummonableCards.map((x) => x.code)})`,
			);
		duel.setResponse(
			m.prepareResponse(IdleCmdType.SPSUMMON, {
				code: sp.code,
				controller: sp.controller,
				location: sp.location,
				sequence: sp.sequence,
			}),
		);
		// Now REDMD #1 is a face-up Dragon on the field. Is REDMD #2 still summonable?
		m = await idle(duel);
		const canSecond = m.spSummonableCards.some((c) => c.code === redmdCode);
		duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
		return canSecond;
	} finally {
		await duel.cleanup();
	}
}

describe("Red-Eyes Darkness Metal Dragon — 2010 [Summon] has no 'once per name'", () => {
	it("pre-errata (910003012): a 2nd REDMD CAN be Special Summoned the same turn", async () => {
		expect(await secondRedmdSummonable(REDMD_PRE)).toBe(true);
	}, 120000);

	it("baseline (official 88264978): the 2nd REDMD is blocked (once per name)", async () => {
		expect(await secondRedmdSummonable(REDMD_OFF)).toBe(false);
	}, 120000);
});
