/**
 * Mausoleum of the Emperor (80921533) — BASELINE of the current classic script.
 *
 * Review workflow step 0: pin the CURRENT engine behavior before the rulings
 * research and the pre-errata copy.
 *
 * What the served script (resources/current/ygopro/base/script/c80921533.lua)
 * does, per source reading:
 *   - e1: field spell activation.
 *   - e2: IGNITION effect (FZONE, BOTH_SIDE): cost paid at ACTIVATION
 *     (AnnounceNumber 1000*N + PayLPCost), and the tribute-less Normal
 *     Summon/Set happens in the OPERATION via Duel.Summon(tp,tc,false,se).
 *   - e3: EFFECT_SUMMON_PROC used as the summon procedure `se` by e2.
 *
 * Mechanical consequence (verified for Ultimate Offering, same call shape):
 *   a mid-chain Duel.Summon is RESERVED by the core (libduel.cpp
 *   core.summon_reserved) and executed after the chain ends, where the
 *   summon-negation window opens — so Solemn Judgment is expected to be
 *   offered against the Mausoleum summon TODAY. Whether 2010 forbids that is
 *   the research question (tracker hypothesis: Solemn-safe, same class as UO).
 *
 * Card codes:
 *   MAUSOLEUM      = 80921533 (Field Spell, legal x3 in Edison)
 *   HORUS_LV6      = 11224103 (Lv6, 1 tribute — summoned via Mausoleum for 1000 LP)
 *   SOLEMN_JUDGMENT = 41420027
 */

import {
	IdleCmdType,
	YGOProMsgAnnounceNumber,
	YGOProMsgPayLpCost,
	YGOProMsgSelectChain,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSummoned,
	YGOProMsgSummoning,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED } from "./test-fixtures";

jest.setTimeout(60_000);

const MAUSOLEUM = 80921533;
const HORUS_LV6 = 11224103;
const SOLEMN_JUDGMENT = 41420027;

const LOCATION_MZONE = 0x04;

describe("Mausoleum of the Emperor — baseline of the current classic script", () => {
	it("ignition effect: pays 1000 LP at activation, tribute-less summon resolves; Solemn IS offered on the summon today", async () => {
		const timelineChains: string[] = [];

		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck([MAUSOLEUM, HORUS_LV6]) }, { main: buildDeck([SOLEMN_JUDGMENT]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: (msg) => {
				// Pay the minimum announced cost (1000 for a 1-tribute monster).
				if (msg instanceof YGOProMsgAnnounceNumber) {
					return msg.prepareResponse(1000);
				}
				return undefined;
			},
		});

		try {
			// T1 P0: activate Mausoleum (field spell from hand), end turn
			const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const maus = r1.targetMessage.activatableCards.find((c) => c.code === MAUSOLEUM);
			if (!maus) throw new Error("Mausoleum not activatable on T1");
			duel.setResponse(
				r1.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
					code: maus.code,
					controller: maus.controller,
					location: maus.location,
					sequence: maus.sequence,
				}),
			);
			const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// Observation: does the idle ALSO offer Horus as directly summonable
			// (raw summon proc) or only via the ignition? Recorded for the report.
			const horusDirectlySummonable = r2.targetMessage.summonableCards.some(
				(c) => c.code === HORUS_LV6,
			);
			duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));

			// T2 P1: SSET Solemn Judgment, end turn
			const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const sj = r3.targetMessage.ssetableCards.find((c) => c.code === SOLEMN_JUDGMENT);
			if (!sj) throw new Error("Solemn not ssetable");
			duel.setResponse(
				r3.targetMessage.prepareResponse(IdleCmdType.SSET, {
					code: sj.code,
					controller: sj.controller,
					location: sj.location,
					sequence: sj.sequence,
				}),
			);
			const r4 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			duel.setResponse(r4.targetMessage.prepareResponse(IdleCmdType.TO_EP));

			// T3 P0: activate Mausoleum's IGNITION effect (second activatable entry,
			// now living in the field zone)
			const r5 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const ign = r5.targetMessage.activatableCards.find((c) => c.code === MAUSOLEUM);
			if (!ign) {
				throw new Error(
					`Mausoleum ignition not activatable. Available: ${r5.targetMessage.activatableCards.map((c) => c.code).join(", ")}`,
				);
			}
			duel.setResponse(
				r5.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
					code: ign.code,
					controller: ign.controller,
					location: ign.location,
					sequence: ign.sequence,
				}),
			);
			const r6 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

			// Build the ordered timeline of chain windows relative to the summon
			let phase: "pre-summon" | "negation-window" | "post-summon" = "pre-summon";
			for (const m of r6.allMessages) {
				if (m instanceof YGOProMsgSummoning) phase = "negation-window";
				else if (m instanceof YGOProMsgSummoned) phase = "post-summon";
				else if (m instanceof YGOProMsgSelectChain) {
					const codes = m.chains.map((c) => c.code).join(",");
					timelineChains.push(`${phase}|p${m.player}|[${codes}]`);
				}
			}

			// Cost was paid at activation: 1000 LP
			const lp = r6.allMessages.find(
				(m): m is YGOProMsgPayLpCost => m instanceof YGOProMsgPayLpCost,
			);
			expect(lp).toBeDefined();
			expect(lp?.player).toBe(0);
			expect(lp?.cost).toBe(1000);

			// The tribute-less summon completed: Horus on P0's field
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);

			// BASELINE PIN: the summon is deferred to after the chain, where the
			// negation window opens — Solemn IS offered to P1 today. (The 2010
			// tracker hypothesis says it must NOT be; research will confirm.)
			const solemnOfferedOnSummon = timelineChains.some(
				(t) => t.startsWith("negation-window|p1|") && t.includes(String(SOLEMN_JUDGMENT)),
			);
			expect(solemnOfferedOnSummon).toBe(true);

			console.log(`[baseline] horusDirectlySummonable=${horusDirectlySummonable}`);
			console.log(`[baseline] chain windows:\n  ${timelineChains.join("\n  ")}`);
		} finally {
			await duel.cleanup();
		}
	});
});

// ───────────────────────────────────────────────────────────────────────────
// PRE-ERRATA copy (910003003) — 2010 behavior. BOTH Edison schools agree:
//   .com historical: "The Normal Summon CANNOT be negated by Solemn Judgment"
//   .net PSCT:       "This Summon can't be negated by Solemn Judgment or
//                     Horn of Heaven" / "during this effect's resolution"
// And the boundary that must survive:
//   .com historical: "The Normal Summon can be responded to with Torrential
//                     Tribute" — EVENT_SUMMON_SUCCESS stays open; only the
//                     EVENT_SUMMON negation window is suppressed.
// Same recipe as Ultimate Offering (s.summon2010 / EFFECT_CANNOT_DISABLE_SUMMON).
// ───────────────────────────────────────────────────────────────────────────
const MAUSOLEUM_PRE_ERRATA = 910003003;
const TORRENTIAL = 53582587;

async function driveMausoleumScenario(
	duel: HeadlessDuel,
	mausoleumCode: number,
	p1TrapCode: number,
): Promise<{ timeline: string[]; messages: YGOProMsgBase[] }> {
	// T1 P0: activate Mausoleum, end turn
	const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const maus = r1.targetMessage.activatableCards.find((c) => c.code === mausoleumCode);
	if (!maus) throw new Error(`Mausoleum ${mausoleumCode} not activatable on T1`);
	duel.setResponse(
		r1.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: maus.code,
			controller: maus.controller,
			location: maus.location,
			sequence: maus.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));

	// T2 P1: SSET the trap, end turn
	const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const trap = r3.targetMessage.ssetableCards.find((c) => c.code === p1TrapCode);
	if (!trap) throw new Error(`Trap ${p1TrapCode} not ssetable`);
	duel.setResponse(
		r3.targetMessage.prepareResponse(IdleCmdType.SSET, {
			code: trap.code,
			controller: trap.controller,
			location: trap.location,
			sequence: trap.sequence,
		}),
	);
	const r4 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r4.targetMessage.prepareResponse(IdleCmdType.TO_EP));

	// T3 P0: activate the ignition effect from the field zone
	const r5 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const ign = r5.targetMessage.activatableCards.find((c) => c.code === mausoleumCode);
	if (!ign) {
		throw new Error(
			`Mausoleum ignition not activatable. Available: ${r5.targetMessage.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r5.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: ign.code,
			controller: ign.controller,
			location: ign.location,
			sequence: ign.sequence,
		}),
	);
	const r6 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

	let phase: "pre-summon" | "negation-window" | "post-summon" = "pre-summon";
	const timeline: string[] = [];
	for (const m of r6.allMessages) {
		if (m instanceof YGOProMsgSummoning) phase = "negation-window";
		else if (m instanceof YGOProMsgSummoned) phase = "post-summon";
		else if (m instanceof YGOProMsgSelectChain) {
			const codes = m.chains.map((c) => c.code).join(",");
			timeline.push(`${phase}|p${m.player}|[${codes}]`);
		}
	}
	return { timeline, messages: r6.allMessages };
}

describe("Mausoleum PRE-ERRATA (910003003) — 2010 behavior", () => {
	it("Solemn Judgment gets NO window on the Mausoleum summon (2010: summon during resolution)", async () => {
		const duel = await HeadlessDuel.create({
			decks: [
				{ main: buildDeck([MAUSOLEUM_PRE_ERRATA, HORUS_LV6]) },
				{ main: buildDeck([SOLEMN_JUDGMENT]) },
			],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: (msg) => {
				if (msg instanceof YGOProMsgAnnounceNumber) return msg.prepareResponse(1000);
				return undefined;
			},
		});
		try {
			const { timeline, messages } = await driveMausoleumScenario(
				duel,
				MAUSOLEUM_PRE_ERRATA,
				SOLEMN_JUDGMENT,
			);

			// Cost and summon still work
			const lp = messages.find((m): m is YGOProMsgPayLpCost => m instanceof YGOProMsgPayLpCost);
			expect(lp?.player).toBe(0);
			expect(lp?.cost).toBe(1000);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);

			// 2010 ruling (both schools): Solemn cannot negate this summon —
			// no negation window offers it. Baseline pins the opposite for the
			// official card.
			const solemnOffered = timeline.some(
				(t) => t.includes(`|p1|`) && t.includes(String(SOLEMN_JUDGMENT)),
			);
			expect(solemnOffered).toBe(false);
		} finally {
			await duel.cleanup();
		}
	});

	it("Torrential Tribute STILL gets its response window after the summon (boundary: only negation is suppressed)", async () => {
		const duel = await HeadlessDuel.create({
			decks: [
				{ main: buildDeck([MAUSOLEUM_PRE_ERRATA, HORUS_LV6]) },
				{ main: buildDeck([TORRENTIAL]) },
			],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: (msg) => {
				if (msg instanceof YGOProMsgAnnounceNumber) return msg.prepareResponse(1000);
				return undefined;
			},
		});
		try {
			const { timeline } = await driveMausoleumScenario(duel, MAUSOLEUM_PRE_ERRATA, TORRENTIAL);

			// .com historical: "The Normal Summon can be responded to with
			// Torrential Tribute" — the EVENT_SUMMON_SUCCESS response window must
			// still offer it (post-summon in the timeline).
			const torrentialOffered = timeline.some(
				(t) => t.startsWith("post-summon|p1|") && t.includes(String(TORRENTIAL)),
			);
			expect(torrentialOffered).toBe(true);
		} finally {
			await duel.cleanup();
		}
	});
});
