/**
 * Machina Gearframe pre-errata (910003007, alias 42940404) — era union rule
 * under duel_rule 1.
 *
 * 2010 SDMM print (edisonformat.com functional-errata + yugipedia Card_Errata):
 *   - "(A monster can only be equipped with 1 Union Monster at a time.)" —
 *     [Condition] present on ALL Union monsters in Edison. The modern errata
 *     removed it; the bundled aux.EnableUnionAttribute only blocks old/modern
 *     mixing, so stock Gearframe stacks freely (pinned below as baseline).
 *   - Unequip Special Summons "in face-up Attack Position" — the modern script
 *     uses POS_FACEUP and asks the player to choose a position.
 *   - Destroy substitute is NOT a delta: "would be destroyed" covers battle
 *     and effect, same as the modern text.
 *
 * The core has no union enforcement of its own under any duel_rule; the limit
 * is purely script-side (probe result, 2026-08-03).
 */
import {
	IdleCmdType,
	YGOProMsgEquip,
	YGOProMsgSelectCard,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectPosition,
	YGOProMsgSpSummoning,
} from "ygopro-msg-encode";

import fs from "node:fs";
import path from "node:path";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED, makeDiscardPadsResponder } from "./test-fixtures";

// Edison fork WASM — same selection mechanism as soul-exchange.integration.test.ts.
const FORK_WASM =
	process.env.OCGCORE_WASM ?? path.join(__dirname, "wasm", "libocgcore-edison-fork.wasm");

beforeAll(() => {
	if (!fs.existsSync(FORK_WASM)) {
		throw new Error(`Edison fork WASM not found at ${FORK_WASM}.`);
	}
});

const GEARFRAME_OFFICIAL = 42940404;
const GEARFRAME_PRE_ERRATA = 910003007;
const MECHANICALCHASER = 7359741;
const MACHINA_FORTRESS = 5556499;
const LOCATION_MZONE = 0x04;
const LOCATION_SZONE = 0x08;

interface CardRef {
	controller: number;
	location: number;
	sequence: number;
}

function createDuel(
	p0Main: number[],
	gearframeCode: number,
	wasmPath?: string,
): Promise<HeadlessDuel> {
	return HeadlessDuel.create({
		decks: [{ main: p0Main }, { main: buildDeck([]) }],
		duelRule: 1,
		seed: FIXED_SEED,
		wasmPath,
		autoResponder: makeDiscardPadsResponder([gearframeCode, MECHANICALCHASER, MACHINA_FORTRESS]),
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
 * From the current idle window, activate the equip ignition of the Gearframe
 * with `gearframeCode` whose MZONE sequence is not `excludeSequence` (pass
 * undefined to take the first one), then resolve the target selection with
 * `pickTarget`. Returns the MSG_EQUIP observed and the idle window reached
 * afterwards.
 */
async function driveEquip(
	duel: HeadlessDuel,
	gearframeCode: number,
	excludeSequence: number | undefined,
	pickTarget: (cards: Array<CardRef & { code: number }>) => CardRef & { code: number },
): Promise<{ equip: YGOProMsgEquip; targetsOffered: Array<CardRef & { code: number }> }> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const entry = r.targetMessage.activatableCards.find(
		(c) =>
			c.code === gearframeCode &&
			c.location === LOCATION_MZONE &&
			(excludeSequence === undefined || c.sequence !== excludeSequence),
	);
	if (!entry) {
		throw new Error(
			`No equip ignition for ${gearframeCode} (excluding seq ${excludeSequence}). ` +
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
	const offered = rt.targetMessage.cards.map((c) => ({
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
	if (!equip) throw new Error("No MSG_EQUIP observed after equip target selection");
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
	return { equip, targetsOffered: offered };
}

describe("Machina Gearframe — era union rule (duel_rule 1)", () => {
	// Regression baseline (probe result): on the STOCK core the OFFICIAL
	// (modern-errata) Gearframe script stacks unions freely — the modern
	// Auxiliary only blocks old/modern mixing. Pinned to the stock core
	// (wasmPath: "") because the Edison fork now enforces "1 union per monster"
	// for the official card too under duel_rule <= 1 (see the fork test below).
	it("stock baseline: official script allows a second union on a monster that already has one", async () => {
		const duel = await createDuel(
			buildDeck([GEARFRAME_OFFICIAL, GEARFRAME_OFFICIAL, GEARFRAME_OFFICIAL]),
			GEARFRAME_OFFICIAL,
			"",
		);
		try {
			await summonCode(duel, GEARFRAME_OFFICIAL);
			await passTurn(duel);
			await passTurn(duel);

			await summonCode(duel, GEARFRAME_OFFICIAL);
			const { equip: equip1 } = await driveEquip(
				duel,
				GEARFRAME_OFFICIAL,
				undefined,
				(cards) => cards[0],
			);
			const carrier = equip1.target;
			await passTurn(duel);

			await summonCode(duel, GEARFRAME_OFFICIAL);
			const { equip: equip2, targetsOffered } = await driveEquip(
				duel,
				GEARFRAME_OFFICIAL,
				carrier.sequence,
				(cards) => {
					const hit = cards.find(
						(c) => c.location === LOCATION_MZONE && c.sequence === carrier.sequence,
					);
					if (!hit) throw new Error("Baseline broken: carrier not offered for second union");
					return hit;
				},
			);
			expect(
				targetsOffered.some(
					(c) => c.location === LOCATION_MZONE && c.sequence === carrier.sequence,
				),
			).toBe(true);
			expect(equip2.target.sequence).toBe(carrier.sequence);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	// Fork counterpart: under the Edison core fork (duel_rule <= 1), FIX A folds
	// every equipped union-status card into the total union count, so the
	// OFFICIAL modern-errata Gearframe is ALSO limited to 1 union per monster —
	// the carrier already holding a union is not offered as a 2nd union target.
	it("fork: official card is era-limited too — carrier not offered for a second union", async () => {
		const duel = await createDuel(
			buildDeck([GEARFRAME_OFFICIAL, GEARFRAME_OFFICIAL, GEARFRAME_OFFICIAL]),
			GEARFRAME_OFFICIAL,
			FORK_WASM,
		);
		try {
			await summonCode(duel, GEARFRAME_OFFICIAL);
			await passTurn(duel);
			await passTurn(duel);

			await summonCode(duel, GEARFRAME_OFFICIAL);
			const { equip: equip1 } = await driveEquip(
				duel,
				GEARFRAME_OFFICIAL,
				undefined,
				(cards) => cards[0],
			);
			const carrier = equip1.target;
			await passTurn(duel);

			await summonCode(duel, GEARFRAME_OFFICIAL);
			// The carrier holding a union must be excluded from the 2nd union's
			// targets. A second free Gearframe on field remains a valid target, so
			// the ignition is still offered — pick that one and assert the carrier
			// is absent.
			const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const ignition = r.targetMessage.activatableCards.find(
				(c) =>
					c.code === GEARFRAME_OFFICIAL &&
					c.location === LOCATION_MZONE &&
					c.sequence !== carrier.sequence,
			);
			if (!ignition) {
				// No target available at all: the only other Machine is the blocked
				// carrier — era rule holds.
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
			expect(
				rt.targetMessage.cards.some(
					(c) => c.location === LOCATION_MZONE && c.sequence === carrier.sequence,
				),
			).toBe(false);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	it("pre-errata: a monster already equipped with a union is not offered as a second union target", async () => {
		const duel = await createDuel(
			buildDeck([
				GEARFRAME_PRE_ERRATA,
				GEARFRAME_PRE_ERRATA,
				GEARFRAME_PRE_ERRATA,
				MECHANICALCHASER,
			]),
			GEARFRAME_PRE_ERRATA,
		);
		try {
			// T1: Gearframe A. T3: Gearframe B, equip one onto the other.
			await summonCode(duel, GEARFRAME_PRE_ERRATA);
			await passTurn(duel);
			await passTurn(duel);
			await summonCode(duel, GEARFRAME_PRE_ERRATA);
			const { equip: equip1 } = await driveEquip(
				duel,
				GEARFRAME_PRE_ERRATA,
				undefined,
				(cards) => cards[0],
			);
			const carrier = equip1.target;
			await passTurn(duel);

			// T5: Mechanicalchaser (clean Machine target). T7: Gearframe C.
			await summonCode(duel, MECHANICALCHASER);
			await passTurn(duel);
			await passTurn(duel);
			await summonCode(duel, GEARFRAME_PRE_ERRATA);

			// C's equip ignition must offer ONLY the clean machine — the carrier
			// is excluded by the era "1 Union per monster" condition — and the
			// equip must land on the clean machine.
			const { equip: equip2, targetsOffered } = await driveEquip(
				duel,
				GEARFRAME_PRE_ERRATA,
				carrier.sequence,
				(cards) => {
					const chaser = cards.find((c) => c.code === MECHANICALCHASER);
					if (!chaser) throw new Error("Mechanicalchaser not offered as union target");
					return chaser;
				},
			);
			expect(
				targetsOffered.some(
					(c) => c.location === LOCATION_MZONE && c.sequence === carrier.sequence,
				),
			).toBe(false);
			expect(targetsOffered.some((c) => c.code === MECHANICALCHASER)).toBe(true);
			expect(equip2.target.sequence).not.toBe(carrier.sequence);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	it("pre-errata: unequip Special Summons in face-up Attack without a position choice", async () => {
		const duel = await createDuel(
			buildDeck([GEARFRAME_PRE_ERRATA, GEARFRAME_PRE_ERRATA]),
			GEARFRAME_PRE_ERRATA,
		);
		try {
			await summonCode(duel, GEARFRAME_PRE_ERRATA);
			await passTurn(duel);
			await passTurn(duel);
			await summonCode(duel, GEARFRAME_PRE_ERRATA);
			await driveEquip(duel, GEARFRAME_PRE_ERRATA, undefined, (cards) => cards[0]);
			await passTurn(duel);

			// T5: activate the equipped union's unequip ignition from the SZONE.
			const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const unequip = r.targetMessage.activatableCards.find(
				(c) => c.code === GEARFRAME_PRE_ERRATA && c.location === LOCATION_SZONE,
			);
			if (!unequip) {
				throw new Error(
					`Unequip ignition not offered. Activatable: ${r.targetMessage.activatableCards.map((c) => `${c.code}@loc${c.location}`).join(", ")}`,
				);
			}
			duel.setResponse(
				r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
					code: unequip.code,
					controller: unequip.controller,
					location: unequip.location,
					sequence: unequip.sequence,
				}),
			);
			const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const sawPositionChoice = r2.allMessages.some((m) => m instanceof YGOProMsgSelectPosition);
			const spSummoned = r2.allMessages.some((m) => m instanceof YGOProMsgSpSummoning);
			expect(spSummoned).toBe(true);
			expect(sawPositionChoice).toBe(false);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	it("baseline: official script asks for a position on unequip (POS_FACEUP)", async () => {
		const duel = await createDuel(
			buildDeck([GEARFRAME_OFFICIAL, GEARFRAME_OFFICIAL]),
			GEARFRAME_OFFICIAL,
		);
		try {
			await summonCode(duel, GEARFRAME_OFFICIAL);
			await passTurn(duel);
			await passTurn(duel);
			await summonCode(duel, GEARFRAME_OFFICIAL);
			await driveEquip(duel, GEARFRAME_OFFICIAL, undefined, (cards) => cards[0]);
			await passTurn(duel);

			const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const unequip = r.targetMessage.activatableCards.find(
				(c) => c.code === GEARFRAME_OFFICIAL && c.location === LOCATION_SZONE,
			);
			if (!unequip) throw new Error("Baseline: unequip ignition not offered");
			duel.setResponse(
				r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
					code: unequip.code,
					controller: unequip.controller,
					location: unequip.location,
					sequence: unequip.sequence,
				}),
			);
			const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			const sawPositionChoice = r2.allMessages.some((m) => m instanceof YGOProMsgSelectPosition);
			expect(sawPositionChoice).toBe(true);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	it("pre-errata: on-summon search trigger still adds a Machina from the Deck", async () => {
		const main = buildDeck([GEARFRAME_PRE_ERRATA]);
		main[30] = MACHINA_FORTRESS; // in-deck, outside opening hand + first draws
		const duel = await createDuel(main, GEARFRAME_PRE_ERRATA);
		try {
			await summonCode(duel, GEARFRAME_PRE_ERRATA);
			const r = await duel.advanceUntilOneOf([YGOProMsgSelectEffectYn, YGOProMsgSelectIdleCmd]);
			if (!(r.targetMessage instanceof YGOProMsgSelectEffectYn)) {
				throw new Error("Search trigger prompt not offered after Normal Summon");
			}
			duel.setResponse(r.targetMessage.prepareResponse(true));
			const rt = await duel.advanceUntil(YGOProMsgSelectCard);
			const fortress = rt.targetMessage.cards.find((c) => c.code === MACHINA_FORTRESS);
			expect(fortress).toBeDefined();
			if (!fortress) throw new Error("unreachable");
			duel.setResponse(
				rt.targetMessage.prepareResponse([
					{
						code: fortress.code,
						controller: fortress.controller,
						location: fortress.location,
						sequence: fortress.sequence,
					},
				]),
			);
			await duel.advanceUntil(YGOProMsgSelectIdleCmd);
			// Opening 5 + draw 1 - summoned 1 + searched 1 = 6.
			expect(duel.queryHandCount(0)).toBe(6);
		} finally {
			await duel.cleanup();
		}
	}, 120000);
});
