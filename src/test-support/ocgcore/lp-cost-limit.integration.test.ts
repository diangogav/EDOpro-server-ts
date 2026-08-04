/**
 * LP cost cannot reduce you to 0 — Edison rule #10, core-differential.
 *
 * Edison/MR1 (2010): you cannot pay an LP COST that would reduce your LP to
 * exactly 0 (or below). Such a cost is illegal, so the effect is not
 * activatable — it must NOT appear in the chain window.
 * Modern (stock core): you CAN pay to exactly 0, so the card IS offered.
 *
 * Probe: My Body as a Shield pre-errata (910003014, alias 69279219) costs
 * 1500 LP. With P0 at exactly 1500 LP:
 *   - Fork (duel_rule <= 1): field::check_lp_cost uses strict `val < lp`, so
 *     paying 1500 from 1500 is illegal → card absent from the chain window.
 *   - Stock: `val <= lp` allows it → card offered.
 * At 1600 LP the cost leaves 100 LP → legal on BOTH cores (control assertion).
 *
 * True differential: era-correct refusal is GREEN on the fork, modern offer is
 * GREEN on the stock core. Fork selected via FORK_WASM (same mechanism as
 * soul-exchange.integration.test.ts); stock forced with wasmPath: "".
 * The duelRule-5 fork block proves modern behavior is untouched by the gate.
 *
 * Scenario:
 *   T1 P0: Normal Summon VANILLA_LIGHT, Set My Body face-down, end turn.
 *   T2 P1: Activate Dark Hole. Observe whether My Body is in the chain window.
 */

import fs from "node:fs";
import path from "node:path";

import { IdleCmdType, YGOProMsgSelectChain, YGOProMsgSelectIdleCmd } from "ygopro-msg-encode";
import type { YGOProMsgBase, YGOProMsgResponseBase } from "ygopro-msg-encode";
import { HeadlessDuel } from "./headless-duel";
import { FIXED_SEED, buildDeck } from "./test-fixtures";

jest.setTimeout(60_000);

const FORK_WASM =
	process.env.OCGCORE_WASM ?? path.join(__dirname, "wasm", "libocgcore-edison-fork.wasm");

beforeAll(() => {
	if (!fs.existsSync(FORK_WASM)) {
		throw new Error(`Edison fork WASM not found at ${FORK_WASM}.`);
	}
});

// ---------------------------------------------------------------------------
// Card codes
// ---------------------------------------------------------------------------
const MYBODY = 910003014; // My Body as a Shield (pre-errata) — Counter Trap, costs 1500 LP
const VANILLA_LIGHT = 2863439; // 1100/1400, Lv4 LIGHT vanilla — P0's monster
const DARK_HOLE = 53129443; // Normal Spell — destroys all monsters

const P0_DECK = buildDeck([VANILLA_LIGHT, MYBODY]);
const P1_DECK = buildDeck([DARK_HOLE]);

// ---------------------------------------------------------------------------
// Test helper: drive the scenario and report whether My Body was offered.
// ---------------------------------------------------------------------------
async function mBodyOffered(opts: {
	startLp: number;
	duelRule: number;
	wasmPath: string | undefined;
}): Promise<boolean> {
	let mBodySeen = false;

	const autoResponder = (msg: YGOProMsgResponseBase): Uint8Array | undefined => {
		if (msg instanceof YGOProMsgSelectChain) {
			const chain = msg as YGOProMsgSelectChain;
			if (chain.chains.some((c) => c.code === MYBODY)) {
				mBodySeen = true;
			}
			return chain.defaultResponse();
		}
		return undefined;
	};

	const duel = await HeadlessDuel.create({
		decks: [{ main: P0_DECK }, { main: P1_DECK }],
		duelRule: opts.duelRule,
		seed: FIXED_SEED,
		startLp: opts.startLp,
		wasmPath: opts.wasmPath,
		autoResponder,
	});

	try {
		// T1 P0: Summon VANILLA_LIGHT
		const r1 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const vanilla = r1.targetMessage.summonableCards.find((c) => c.code === VANILLA_LIGHT);
		if (!vanilla) throw new Error("VANILLA_LIGHT not summonable");
		duel.setResponse(
			r1.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
				code: vanilla.code,
				controller: vanilla.controller,
				location: vanilla.location,
				sequence: vanilla.sequence,
			}),
		);

		// T1 P0: SSet My Body face-down
		const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const mybody = r2.targetMessage.ssetableCards.find((c) => c.code === MYBODY);
		if (!mybody) throw new Error("MYBODY not ssetable");
		duel.setResponse(
			r2.targetMessage.prepareResponse(IdleCmdType.SSET, {
				code: mybody.code,
				controller: mybody.controller,
				location: mybody.location,
				sequence: mybody.sequence,
			}),
		);

		// T1 P0: end turn
		const r3 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		duel.setResponse(r3.targetMessage.prepareResponse(IdleCmdType.TO_EP));

		// T2 P1: Activate Dark Hole
		const r4 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		const dh = r4.targetMessage.activatableCards.find((c) => c.code === DARK_HOLE);
		if (!dh) throw new Error("Dark Hole not activatable for P1");
		duel.setResponse(
			r4.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
				code: dh.code,
				controller: dh.controller,
				location: dh.location,
				sequence: dh.sequence,
			}),
		);

		// Drive through Dark Hole resolution; the autoResponder records the chain window.
		const _r5: { allMessages: YGOProMsgBase[] } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
		void _r5;
	} finally {
		await duel.cleanup();
	}

	return mBodySeen;
}

// ---------------------------------------------------------------------------
// Fork core (Edison 2010)
// ---------------------------------------------------------------------------

describe("LP cost limit — Edison fork core (duelRule 1)", () => {
	it("at 1600 LP: My Body IS offered (cost 1500 leaves 100 LP — legal)", async () => {
		expect(await mBodyOffered({ startLp: 1600, duelRule: 1, wasmPath: FORK_WASM })).toBe(true);
	});

	it("at exactly 1500 LP: My Body is NOT offered (paying to 0 is an illegal cost — rule #10)", async () => {
		expect(await mBodyOffered({ startLp: 1500, duelRule: 1, wasmPath: FORK_WASM })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Stock core (modern)
// ---------------------------------------------------------------------------

describe("LP cost limit — stock core (modern: paying to exactly 0 allowed)", () => {
	it("at exactly 1500 LP: My Body IS offered (stock allows paying LP to 0)", async () => {
		// Empty string forces the vendored stock core even under OCGCORE_WASM.
		expect(await mBodyOffered({ startLp: 1500, duelRule: 1, wasmPath: "" })).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Modern-behavior guard: duelRule 5 on the fork is UNTOUCHED (== stock)
// ---------------------------------------------------------------------------

describe("LP cost limit — fork core under duelRule 5 (modern intact, gate proven)", () => {
	it("at exactly 1500 LP under duelRule 5: My Body IS offered (fix gated to duel_rule <= 1)", async () => {
		expect(await mBodyOffered({ startLp: 1500, duelRule: 5, wasmPath: FORK_WASM })).toBe(true);
	});
});
