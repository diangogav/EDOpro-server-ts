/**
 * Union limit — "1 Union Monster per monster" (Edison rule #3), core-differential.
 *
 * Edison/MR1 (2010): ALL Union monsters carry the [Condition] "A monster can
 * only be equipped with 1 Union Monster at a time." The modern errata removed
 * it from the reprinted unions, and the bundled Auxiliary.EnableUnionAttribute
 * only blocks OLD/MODERN mixing — so a stock core lets two MODERN unions stack
 * on the same monster.
 *
 * The Edison fork enforces the era rule in the CORE (no per-card Lua edits): in
 * card::get_union_count / card::get_old_union_count, when duel_rule <= 1 BOTH
 * accessors report the TOTAL equipped union-status count (modern + old folded
 * together). The shared Lua Auxiliary.UnionEquipFilter / CheckUnionEquip key
 * off GetUnionCount() and require the relevant count == 0, so a 2nd union of
 * ANY kind is blocked on a monster that already holds one — for every ~44 union.
 *
 * Fixture: Heavy Mech Support Platform (23265594) is a MODERN union (registers
 * EFFECT_UNION_STATUS only, equips to any Machine). Two of them onto a
 * Mechanicalchaser (7359741, Machine) carrier:
 *   - Fork (duelRule 1): the carrier is NOT offered as a target for the 2nd
 *     platform (blocked); the equip must land elsewhere.
 *   - Stock: the carrier IS offered and the 2nd platform stacks on it.
 *
 * True differential: era rule GREEN on the fork, modern stacking GREEN on the
 * stock core. Fork via FORK_WASM (soul-exchange mechanism); stock via
 * wasmPath: "". The duelRule-5 fork block proves the gate leaves modern intact.
 */

import fs from "node:fs";
import path from "node:path";

import {
	IdleCmdType,
	YGOProMsgEquip,
	YGOProMsgSelectCard,
	YGOProMsgSelectIdleCmd,
} from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED, makeDiscardPadsResponder } from "./test-fixtures";

const PLATFORM = 23265594; // Heavy Mech Support Platform — modern union, equips to any Machine
const CARRIER = 7359741; // Mechanicalchaser — Lv4 Machine, non-union carrier
const LOCATION_MZONE = 0x04;

const FORK_WASM =
	process.env.OCGCORE_WASM ?? path.join(__dirname, "wasm", "libocgcore-edison-fork.wasm");

beforeAll(() => {
	if (!fs.existsSync(FORK_WASM)) {
		throw new Error(`Edison fork WASM not found at ${FORK_WASM}.`);
	}
});

interface CardRef {
	code: number;
	controller: number;
	location: number;
	sequence: number;
}

function createDuel(duelRule: number, wasmPath: string | undefined): Promise<HeadlessDuel> {
	return HeadlessDuel.create({
		// Three platforms so one survives for the T5 second-union attempt:
		// T1 summons Platform A, T3 equips Platform B onto the carrier, T5 uses
		// Platform C. Carrier at position 1 is summoned on T3.
		decks: [{ main: buildDeck([PLATFORM, CARRIER, PLATFORM, PLATFORM]) }, { main: buildDeck([]) }],
		duelRule,
		seed: FIXED_SEED,
		wasmPath,
		autoResponder: makeDiscardPadsResponder([PLATFORM, CARRIER]),
	});
}

async function summonCode(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const s = r.targetMessage.summonableCards.find((c) => c.code === code);
	if (!s) {
		throw new Error(
			`${code} not summonable. Summonable: ${r.targetMessage.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
			code: s.code,
			controller: s.controller,
			location: s.location,
			sequence: s.sequence,
		}),
	);
}

async function passTurn(duel: HeadlessDuel): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/**
 * From the current idle window, activate the equip ignition of the PLATFORM in
 * MZONE (excluding `excludeSequence`), resolve target selection with pickTarget,
 * and settle back to idle. Returns the MSG_EQUIP and the targets offered.
 */
async function driveEquip(
	duel: HeadlessDuel,
	excludeSequence: number | undefined,
	pickTarget: (cards: CardRef[]) => CardRef,
): Promise<{ equip: YGOProMsgEquip; targetsOffered: CardRef[] }> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const entry = r.targetMessage.activatableCards.find(
		(c) =>
			c.code === PLATFORM &&
			c.location === LOCATION_MZONE &&
			(excludeSequence === undefined || c.sequence !== excludeSequence),
	);
	if (!entry) {
		throw new Error(
			`No equip ignition for ${PLATFORM} (excluding seq ${excludeSequence}). ` +
				`Activatable: ${r.targetMessage.activatableCards.map((c) => `${c.code}@loc${c.location}/seq${c.sequence}`).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: entry.code,
			controller: entry.controller,
			location: entry.location,
			sequence: entry.sequence,
		}),
	);
	const rt = await duel.advanceUntil(YGOProMsgSelectCard);
	const offered: CardRef[] = rt.targetMessage.cards.map((c) => ({
		code: c.code,
		controller: c.controller,
		location: c.location,
		sequence: c.sequence,
	}));
	const target = pickTarget(offered);
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
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const equip = r2.allMessages.find((m): m is YGOProMsgEquip => m instanceof YGOProMsgEquip);
	if (!equip) throw new Error("No MSG_EQUIP observed after target selection");
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
	return { equip, targetsOffered: offered };
}

/**
 * Common setup: T1 summon Platform A; T3 summon Carrier, equip A onto Carrier;
 * T5 summon Platform B. Returns the carrier ref and the running duel.
 */
async function driveToSecondUnion(duel: HeadlessDuel): Promise<{ carrierSequence: number }> {
	await summonCode(duel, PLATFORM); // T1: Platform A
	await passTurn(duel);
	await passTurn(duel); // T2 P1
	await summonCode(duel, CARRIER); // T3: Carrier
	const { equip: equip1 } = await driveEquip(duel, undefined, (cards) => {
		const carrier = cards.find((c) => c.code === CARRIER);
		if (!carrier) throw new Error("Carrier not offered for the first union");
		return carrier;
	});
	const carrierSequence = equip1.target.sequence;
	// driveEquip already ended P0's T3 with TO_EP; one pass covers P1's T4.
	await passTurn(duel); // T4 P1
	await summonCode(duel, PLATFORM); // T5 P0: Platform C
	return { carrierSequence };
}

// ---------------------------------------------------------------------------
// Fork core (Edison 2010): 2nd union blocked
// ---------------------------------------------------------------------------

describe("Union limit — Edison fork core (duelRule 1: 1 union per monster)", () => {
	it("a monster already holding a union is NOT offered as a 2nd union target", async () => {
		const duel = await createDuel(1, FORK_WASM);
		try {
			const { carrierSequence } = await driveToSecondUnion(duel);

			// Platform B's equip ignition: the carrier must be excluded. Only the
			// now-free Platform A (unequipped? no — still equipped) ... the only
			// legal Machine target is Platform B itself is not a target; the carrier
			// is blocked, so NO valid target exists and the ignition must not even
			// be offered, OR if offered the carrier is absent. Assert the carrier is
			// not in the offered set.
			const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const ignition = r.targetMessage.activatableCards.find(
				(c) =>
					c.code === PLATFORM && c.location === LOCATION_MZONE && c.sequence !== carrierSequence,
			);

			if (!ignition) {
				// No equip ignition at all: the only Machine on field is the carrier
				// (blocked) — era rule holds. Pass.
				expect(ignition).toBeUndefined();
				duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
				return;
			}

			duel.setResponse(
				r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
					code: ignition.code,
					controller: ignition.controller,
					location: ignition.location,
					sequence: ignition.sequence,
				}),
			);
			const rt = await duel.advanceUntil(YGOProMsgSelectCard);
			const offered = rt.targetMessage.cards.map((c) => ({
				code: c.code,
				location: c.location,
				sequence: c.sequence,
			}));
			// The carrier (already holding Platform A) must NOT be offered.
			expect(
				offered.some((c) => c.location === LOCATION_MZONE && c.sequence === carrierSequence),
			).toBe(false);
		} finally {
			await duel.cleanup();
		}
	}, 120000);
});

// ---------------------------------------------------------------------------
// Stock core (modern): 2nd union stacks freely
// ---------------------------------------------------------------------------

describe("Union limit — stock core (modern: unions stack)", () => {
	it("a monster already holding a union IS offered and accepts a 2nd union", async () => {
		// Empty string forces the vendored stock core even under OCGCORE_WASM.
		const duel = await createDuel(1, "");
		try {
			const { carrierSequence } = await driveToSecondUnion(duel);

			const { equip: equip2, targetsOffered } = await driveEquip(duel, carrierSequence, (cards) => {
				const carrier = cards.find(
					(c) => c.location === LOCATION_MZONE && c.sequence === carrierSequence,
				);
				if (!carrier) {
					throw new Error("Stock baseline broken: carrier not offered for 2nd union");
				}
				return carrier;
			});

			expect(
				targetsOffered.some((c) => c.location === LOCATION_MZONE && c.sequence === carrierSequence),
			).toBe(true);
			expect(equip2.target.sequence).toBe(carrierSequence);
		} finally {
			await duel.cleanup();
		}
	}, 120000);
});

// ---------------------------------------------------------------------------
// Modern-behavior guard: duelRule 5 on the fork stacks like stock (gate proven)
// ---------------------------------------------------------------------------

describe("Union limit — fork core under duelRule 5 (modern intact, gate proven)", () => {
	it("duelRule 5 on the fork: a 2nd union stacks (fix gated to duel_rule <= 1)", async () => {
		const duel = await createDuel(5, FORK_WASM);
		try {
			const { carrierSequence } = await driveToSecondUnion(duel);

			const { equip: equip2, targetsOffered } = await driveEquip(duel, carrierSequence, (cards) => {
				const carrier = cards.find(
					(c) => c.location === LOCATION_MZONE && c.sequence === carrierSequence,
				);
				if (!carrier) throw new Error("duelRule 5 fork: carrier not offered for 2nd union");
				return carrier;
			});

			expect(
				targetsOffered.some((c) => c.location === LOCATION_MZONE && c.sequence === carrierSequence),
			).toBe(true);
			expect(equip2.target.sequence).toBe(carrierSequence);
		} finally {
			await duel.cleanup();
		}
	}, 120000);
});
