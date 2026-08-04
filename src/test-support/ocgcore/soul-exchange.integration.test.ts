/**
 * Soul Exchange pre-errata (910003004) — Edison 2010 ruling.
 *
 * 2010 delta (edisonrul.ing, both schools agree): Tributing the targeted
 * monster is OPTIONAL ("This turn you can Tribute that monster as if you
 * controlled it" — DTP1 2008 text). The stock core only implements the modern
 * BP01 2012 behavior: plain EFFECT_EXTRA_RELEASE lands in the forced
 * extra-release list, so the player MUST tribute the target
 * (select_tribute_cards / select_release_cards forced-ex paths).
 *
 * The Edison core fork adds EFFECT_EXTRA_RELEASE_OPT (10159), which puts the
 * target in the NORMAL release pool: optional, multiple targets allowed.
 * These tests run against the fork WASM (wasm/libocgcore-edison-fork.wasm,
 * built from the patched purerosefallen/ygopro-core) and pin:
 *   1. Tribute is optional — own monster and target are BOTH offered;
 *      tributing the own monster succeeds and the target survives.
 *   2. The target is still usable — tributing it sends it to its owner's
 *      grave and the summon succeeds.
 *   3. Two resolved Soul Exchanges allow tributing BOTH targets for a
 *      Level 7+ summon (2010 ruling; impossible under oneof-style effects).
 *   4. Boundary guard: the OFFICIAL modern card (68005187) still forces the
 *      tribute under the fork — the patch is additive, modern behavior intact.
 * Plus a differential against the STOCK core documenting why the fork exists.
 */
import fs from "node:fs";
import path from "node:path";

import {
	IdleCmdType,
	YGOProMsgSelectCard,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectTribute,
} from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED, makeDiscardPadsResponder } from "./test-fixtures";

const SOUL_EXCHANGE_PRE_ERRATA = 910003004;
const SOUL_EXCHANGE_OFFICIAL = 68005187;
const SUMMONED_SKULL = 70781052; // Level 6, 1 tribute
const BLUE_EYES = 89631139; // Level 8, 2 tributes
const OWN_VANILLA = 2863439;
const TGT_VANILLA = 549481;

const LOCATION_MZONE = 0x04;
const LOCATION_GRAVE = 0x10;

const discardPadsResponder = makeDiscardPadsResponder([
	SOUL_EXCHANGE_PRE_ERRATA,
	SOUL_EXCHANGE_OFFICIAL,
	SUMMONED_SKULL,
	BLUE_EYES,
]);

// Fork WASM built from the patched core (see docs/edison-roadmap.md escape
// hatch). Override with SOUL_EXCHANGE_WASM to run the suite against another
// build (e.g. the vendored stock core to reproduce the RED state).
const FORK_WASM =
	process.env.SOUL_EXCHANGE_WASM ?? path.join(__dirname, "wasm", "libocgcore-edison-fork.wasm");

beforeAll(() => {
	if (!fs.existsSync(FORK_WASM)) {
		throw new Error(
			`Edison fork WASM not found at ${FORK_WASM}. ` +
				`Build it from the patched purerosefallen/ygopro-core ` +
				`(premake5 gmake --file=dll.lua --os=emscripten + emsdk 3.1.7, config=release_wasm_cjs).`,
		);
	}
});

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

/** Summon `code` from the current idle window, then end the turn. */
async function driveSummonAndEndTurn(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.summonableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveSummonAndEndTurn: ${code} not summonable. ` +
				`Available: ${r.targetMessage.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/** End the turn from the current idle window without acting. */
async function drivePassTurn(duel: HeadlessDuel): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/**
 * Activate a Soul Exchange copy from hand and pick the P1 monster with
 * `targetCode` in the target-selection window. Leaves the duel right after
 * the target response (spell resolves on the way to the next window).
 */
async function driveSoulExchange(
	duel: HeadlessDuel,
	soulExchangeCode: number,
	targetCode: number,
): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const se = r.targetMessage.activatableCards.find((c) => c.code === soulExchangeCode);
	if (!se) {
		throw new Error(
			`driveSoulExchange: ${soulExchangeCode} not activatable. ` +
				`Available: ${r.targetMessage.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: se.code,
			controller: se.controller,
			location: se.location,
			sequence: se.sequence,
		}),
	);
	const rt = await duel.advanceUntil(YGOProMsgSelectCard);
	const target = rt.targetMessage.cards.find((c) => c.controller === 1 && c.code === targetCode);
	if (!target) {
		throw new Error(
			`driveSoulExchange: target ${targetCode}@p1 not offered. ` +
				`Offered: ${rt.targetMessage.cards.map((c) => `${c.code}@p${c.controller}`).join(", ")}`,
		);
	}
	duel.setResponse(
		rt.targetMessage.prepareResponse([
			{
				code: target.code,
				controller: target.controller,
				location: target.location,
				sequence: target.sequence,
			},
		]),
	);
}

/**
 * Declare a tribute summon of `code` from the current idle window and return
 * the tribute-selection message (asserted to be SELECT_TRIBUTE).
 */
async function driveDeclareTributeSummon(
	duel: HeadlessDuel,
	code: number,
): Promise<YGOProMsgSelectTribute> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.summonableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveDeclareTributeSummon: ${code} not summonable. ` +
				`Available: ${r.targetMessage.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const rt = await duel.advanceUntil(YGOProMsgSelectTribute);
	return rt.targetMessage;
}

/** Respond to a tribute window with the given entries and settle back to idle. */
async function driveTributeChoice(
	duel: HeadlessDuel,
	win: YGOProMsgSelectTribute,
	picks: Array<{ code: number; controller: number }>,
): Promise<void> {
	const entries = picks.map((p) => {
		const entry = win.cards.find((c) => c.code === p.code && c.controller === p.controller);
		if (!entry) {
			throw new Error(
				`driveTributeChoice: ${p.code}@p${p.controller} not offered. ` +
					`Offered: ${win.cards.map((c) => `${c.code}@p${c.controller}`).join(", ")}`,
			);
		}
		return {
			code: entry.code,
			controller: entry.controller,
			location: entry.location,
			sequence: entry.sequence,
		};
	});
	duel.setResponse(win.prepareResponse(entries));
	await duel.advanceUntil(YGOProMsgSelectIdleCmd);
}

// ---------------------------------------------------------------------------
// Fork-core behavior (Edison 2010)
// ---------------------------------------------------------------------------

describe("Soul Exchange pre-errata (910003004) — Edison fork core", () => {
	describe("Test 1: tribute is optional — own monster may be tributed instead", () => {
		let duel: HeadlessDuel;

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [
					{ main: buildDeck([SOUL_EXCHANGE_PRE_ERRATA, SUMMONED_SKULL, OWN_VANILLA]) },
					{ main: buildDeck([TGT_VANILLA]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				wasmPath: FORK_WASM,
				autoResponder: discardPadsResponder,
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("offers BOTH monsters and lets the own monster be tributed; target survives", async () => {
			await driveSummonAndEndTurn(duel, OWN_VANILLA); // T1 P0
			await driveSummonAndEndTurn(duel, TGT_VANILLA); // T2 P1
			await driveSoulExchange(duel, SOUL_EXCHANGE_PRE_ERRATA, TGT_VANILLA); // T3 P0

			const win = await driveDeclareTributeSummon(duel, SUMMONED_SKULL);

			// The 2010 core assertion: both release options are in the window
			const offered = win.cards.map((c) => `${c.code}@p${c.controller}`);
			expect(offered).toContain(`${OWN_VANILLA}@p0`);
			expect(offered).toContain(`${TGT_VANILLA}@p1`);

			// Choosing the OWN monster must be legal (optional tribute)
			await driveTributeChoice(duel, win, [{ code: OWN_VANILLA, controller: 0 }]);

			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // Skull
			expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(2); // own vanilla + SE
			expect(duel.queryLocationCount(1, LOCATION_MZONE)).toBe(1); // target survived
			expect(duel.queryLocationCount(1, LOCATION_GRAVE)).toBe(0);
		});

		it("still allows tributing the target; it goes to its owner's grave", async () => {
			await driveSummonAndEndTurn(duel, OWN_VANILLA);
			await driveSummonAndEndTurn(duel, TGT_VANILLA);
			await driveSoulExchange(duel, SOUL_EXCHANGE_PRE_ERRATA, TGT_VANILLA);

			const win = await driveDeclareTributeSummon(duel, SUMMONED_SKULL);
			await driveTributeChoice(duel, win, [{ code: TGT_VANILLA, controller: 1 }]);

			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(2); // own vanilla + Skull
			expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(1); // SE itself
			expect(duel.queryLocationCount(1, LOCATION_MZONE)).toBe(0);
			expect(duel.queryLocationCount(1, LOCATION_GRAVE)).toBe(1); // owner's grave
		});
	});

	describe("Test 2: two Soul Exchanges — both targets tributed for a Level 8 summon", () => {
		let duel: HeadlessDuel;

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [
					{
						main: buildDeck([SOUL_EXCHANGE_PRE_ERRATA, SOUL_EXCHANGE_PRE_ERRATA, BLUE_EYES]),
					},
					{ main: buildDeck([TGT_VANILLA, OWN_VANILLA]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				wasmPath: FORK_WASM,
				autoResponder: discardPadsResponder,
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("summons Blue-Eyes by tributing both opponent targets (2010 ruling)", async () => {
			await drivePassTurn(duel); // T1 P0
			await driveSummonAndEndTurn(duel, TGT_VANILLA); // T2 P1
			await drivePassTurn(duel); // T3 P0
			await driveSummonAndEndTurn(duel, OWN_VANILLA); // T4 P1 (second target)

			// T5 P0: resolve both copies, one per opponent monster
			await driveSoulExchange(duel, SOUL_EXCHANGE_PRE_ERRATA, TGT_VANILLA);
			await driveSoulExchange(duel, SOUL_EXCHANGE_PRE_ERRATA, OWN_VANILLA);

			const win = await driveDeclareTributeSummon(duel, BLUE_EYES);
			await driveTributeChoice(duel, win, [
				{ code: TGT_VANILLA, controller: 1 },
				{ code: OWN_VANILLA, controller: 1 },
			]);

			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // Blue-Eyes
			expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(3); // both SEs + T3 EP pad discard
			expect(duel.queryLocationCount(1, LOCATION_MZONE)).toBe(0);
			expect(duel.queryLocationCount(1, LOCATION_GRAVE)).toBe(2);
		});
	});

	describe("Boundary guard: official modern Soul Exchange still forces the tribute", () => {
		let duel: HeadlessDuel;

		beforeEach(async () => {
			duel = await HeadlessDuel.create({
				decks: [
					{ main: buildDeck([SOUL_EXCHANGE_OFFICIAL, SUMMONED_SKULL, OWN_VANILLA]) },
					{ main: buildDeck([TGT_VANILLA]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				wasmPath: FORK_WASM,
				autoResponder: discardPadsResponder,
			});
		});

		afterEach(async () => {
			await duel.cleanup();
		});

		it("offers ONLY the opponent target under the fork core (patch is additive)", async () => {
			await driveSummonAndEndTurn(duel, OWN_VANILLA);
			await driveSummonAndEndTurn(duel, TGT_VANILLA);
			await driveSoulExchange(duel, SOUL_EXCHANGE_OFFICIAL, TGT_VANILLA);

			const win = await driveDeclareTributeSummon(duel, SUMMONED_SKULL);
			const offered = win.cards.map((c) => `${c.code}@p${c.controller}`);
			expect(offered).toEqual([`${TGT_VANILLA}@p1`]);
		});
	});
});

// ---------------------------------------------------------------------------
// Differential: stock core cannot express the 2010 behavior
// ---------------------------------------------------------------------------

describe("Soul Exchange pre-errata — stock core differential", () => {
	let duel: HeadlessDuel;

	beforeEach(async () => {
		duel = await HeadlessDuel.create({
			decks: [
				{ main: buildDeck([SOUL_EXCHANGE_PRE_ERRATA, SUMMONED_SKULL, OWN_VANILLA]) },
				{ main: buildDeck([TGT_VANILLA]) },
			],
			duelRule: 1,
			seed: FIXED_SEED,
			// Empty string forces the vendored stock core even when OCGCORE_WASM
			// is set for a full-suite fork run (harness falls back on undefined only).
			wasmPath: "",
			autoResponder: discardPadsResponder,
		});
	});

	afterEach(async () => {
		await duel.cleanup();
	});

	it("ignores EXTRA_RELEASE_OPT: the target is not releasable at all", async () => {
		await driveSummonAndEndTurn(duel, OWN_VANILLA);
		await driveSummonAndEndTurn(duel, TGT_VANILLA);
		await driveSoulExchange(duel, SOUL_EXCHANGE_PRE_ERRATA, TGT_VANILLA);

		const win = await driveDeclareTributeSummon(duel, SUMMONED_SKULL);
		const offered = win.cards.map((c) => `${c.code}@p${c.controller}`);
		expect(offered).toEqual([`${OWN_VANILLA}@p0`]);
	});
});
