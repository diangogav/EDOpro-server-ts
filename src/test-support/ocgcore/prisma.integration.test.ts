/**
 * Elemental HERO Prisma pre-errata (910003006) — Edison 2010 ruling.
 *
 * 2010 delta (edisonrul.ing, both schools agree): the reveal + deck-send has
 * NO COST — both happen at RESOLUTION. The modern errata (base script) pays
 * the send as an activation cost, and the old classic override (now deleted —
 * it was dead under base-first precedence anyway) still revealed at
 * activation and whiff-checked AFTER sending.
 *
 * Pinned here (Lua-only card):
 *   1. Resolution order: the opponent's response window opens BEFORE any
 *      reveal/send selection; reveal (extra) and send (deck) resolve after.
 *   2. The whiff (the money case): Book of Moon chained to flip Prisma
 *      face-down → the WHOLE effect whiffs — nothing revealed, NOTHING sent,
 *      deck intact. Against the official card the same play still costs the
 *      material (already in the grave at activation).
 *   3. Dimensional Fissure: the 2010 effect is activatable, the sent material
 *      is banished by redirect and the name gain still applies. The official
 *      cost-based card cannot even activate under Fissure.
 */
import {
	IdleCmdType,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectUnselectCard,
} from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED, makeDiscardPadsResponder } from "./test-fixtures";

const PRISMA_PRE_ERRATA = 910003006;
const PRISMA_OFFICIAL = 89312388;
const AVIAN = 21844576;
const FLAME_WINGMAN = 35809262;
const BOOK_OF_MOON = 14087893;
const DIM_FISSURE = 81674782;

const LOCATION_DECK = 0x01;
const LOCATION_MZONE = 0x04;
const LOCATION_GRAVE = 0x10;
const LOCATION_REMOVED = 0x20;
const LOCATION_EXTRA = 0x40;

const discardPadsResponder = makeDiscardPadsResponder([
	PRISMA_PRE_ERRATA,
	PRISMA_OFFICIAL,
	AVIAN,
	BOOK_OF_MOON,
	DIM_FISSURE,
]);

/**
 * Auto-responder that activates `code` the first time it appears in a P1
 * SelectChain window; end-phase discards prefer pads; everything else falls
 * back to the built-in (decline).
 */
function chainOnceResponder(
	code: number,
	options?: { armed?: boolean },
): {
	responder: (msg: unknown) => Uint8Array | undefined;
	wasActivated: () => boolean;
	arm: () => void;
} {
	let activated = false;
	let armed = options?.armed ?? true;
	return {
		responder: (msg: unknown) => {
			if (msg instanceof YGOProMsgSelectChain && armed && !activated && msg.player === 1) {
				const entry = msg.chains.find((c) => c.code === code);
				if (entry) {
					activated = true;
					return msg.prepareResponse({
						code: entry.code,
						controller: entry.controller,
						location: entry.location,
						sequence: entry.sequence,
						desc: entry.desc,
					});
				}
			}
			return discardPadsResponder(msg);
		},
		wasActivated: () => activated,
		arm: () => {
			armed = true;
		},
	};
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

/** End the turn from the current idle window without acting. */
async function drivePassTurn(duel: HeadlessDuel): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/** Set a spell/trap from the current idle window, then end the turn. */
async function driveSSetAndEndTurn(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.ssetableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveSSetAndEndTurn: ${code} not ssetable. ` +
				`Available: ${r.targetMessage.ssetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SSET, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/** Activate a card from the current idle window, then end the turn. */
async function driveActivateAndEndTurn(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.activatableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveActivateAndEndTurn: ${code} not activatable. ` +
				`Available: ${r.targetMessage.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/** Normal summon `code` from the current idle window (stays in the same MP). */
async function driveSummon(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.summonableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveSummon: ${code} not summonable. ` +
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
}

/**
 * Activate a Prisma ignition from the current idle window and drive to the
 * next idle, recording the ordered sequence of windows seen. Selection
 * windows are answered with the first entry (P1's Book of Moon target select
 * over MZONE only ever contains Prisma in these scenarios).
 */
async function settleToIdle(duel: HeadlessDuel): Promise<YGOProMsgSelectIdleCmd> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	return r.targetMessage;
}

async function drivePrismaIgnition(
	duel: HeadlessDuel,
	code: number,
	idleMsg?: YGOProMsgSelectIdleCmd,
): Promise<string[]> {
	const idle = idleMsg ?? (await settleToIdle(duel));
	const prisma = idle.activatableCards.find((c) => c.code === code);
	if (!prisma) {
		throw new Error(
			`drivePrismaIgnition: ${code} not activatable. ` +
				`Available: ${idle.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		idle.prepareResponse(IdleCmdType.ACTIVATE, {
			code: prisma.code,
			controller: prisma.controller,
			location: prisma.location,
			sequence: prisma.sequence,
		}),
	);

	const events: string[] = [];
	for (;;) {
		const step = await duel.advanceUntilOneOf([
			YGOProMsgSelectCard,
			YGOProMsgSelectUnselectCard,
			YGOProMsgSelectIdleCmd,
		]);
		for (const m of step.allMessages) {
			if (m instanceof YGOProMsgSelectChain && m.player === 1) events.push("p1ChainWindow");
		}
		const msg = step.targetMessage;
		if (msg instanceof YGOProMsgSelectUnselectCard) {
			const pick = msg.selectableCards[0];
			events.push(pick.location === LOCATION_EXTRA ? "revealSelect" : `select@L${pick.location}`);
			duel.setResponse(
				msg.prepareResponse({
					code: pick.code,
					controller: pick.controller,
					location: pick.location,
					sequence: pick.sequence,
				}),
			);
			continue;
		}
		if (msg instanceof YGOProMsgSelectCard) {
			const pick = msg.cards[0];
			if (pick.location === LOCATION_EXTRA) events.push("revealSelect");
			else if (pick.location === LOCATION_DECK) events.push("deckSendSelect");
			else events.push(`select@L${pick.location}`);
			duel.setResponse(
				msg.prepareResponse([
					{
						code: pick.code,
						controller: pick.controller,
						location: pick.location,
						sequence: pick.sequence,
					},
				]),
			);
			continue;
		}
		return events;
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Elemental HERO Prisma pre-errata (910003006) — Edison 2010 ruling", () => {
	describe("Test 1: reveal + send happen at RESOLUTION (no cost)", () => {
		it("opens the opponent's window before any selection, then reveals and sends", async () => {
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: [...buildDeck([PRISMA_PRE_ERRATA], 39), AVIAN], extra: [FLAME_WINGMAN] },
					{ main: buildDeck([]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: discardPadsResponder,
			});
			try {
				await driveSummon(duel, PRISMA_PRE_ERRATA); // T1 P0
				const events = await drivePrismaIgnition(duel, PRISMA_PRE_ERRATA);

				// 2010 order: response window FIRST, selections only at resolution
				const firstChain = events.indexOf("p1ChainWindow");
				const reveal = events.indexOf("revealSelect");
				const send = events.indexOf("deckSendSelect");
				expect(firstChain).toBeGreaterThanOrEqual(0);
				expect(reveal).toBeGreaterThan(firstChain);
				expect(send).toBeGreaterThan(reveal);

				expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(1); // Avian sent
				expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // Prisma stays
			} finally {
				await duel.cleanup();
			}
		});
	});

	describe("Test 2: whiff differential — Book of Moon chained to the activation", () => {
		it("pre-errata: flipped face-down at resolution → NOTHING revealed or sent", async () => {
			// Start disarmed: Book of Moon must respond to the ACTIVATION, not the
			// summon-response window (where it would flip Prisma before the effect).
			const chain = chainOnceResponder(BOOK_OF_MOON, { armed: false });
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: [...buildDeck([PRISMA_PRE_ERRATA], 39), AVIAN], extra: [FLAME_WINGMAN] },
					{ main: buildDeck([BOOK_OF_MOON]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: chain.responder,
			});
			try {
				await drivePassTurn(duel); // T1 P0
				await driveSSetAndEndTurn(duel, BOOK_OF_MOON); // T2 P1
				await driveSummon(duel, PRISMA_PRE_ERRATA); // T3 P0
				const idle = await settleToIdle(duel); // BoM declined at the summon window
				chain.arm();
				const events = await drivePrismaIgnition(duel, PRISMA_PRE_ERRATA, idle);

				expect(chain.wasActivated()).toBe(true);
				expect(events).not.toContain("revealSelect"); // nothing revealed
				expect(events).not.toContain("deckSendSelect"); // NOTHING sent
				expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(0); // deck intact
				// Prisma is face-down on the field
				expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);
			} finally {
				await duel.cleanup();
			}
		});

		it("official (baseline): same play still costs the material up front", async () => {
			const chain = chainOnceResponder(BOOK_OF_MOON, { armed: false });
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: [...buildDeck([PRISMA_OFFICIAL], 39), AVIAN], extra: [FLAME_WINGMAN] },
					{ main: buildDeck([BOOK_OF_MOON]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: chain.responder,
			});
			try {
				await drivePassTurn(duel); // T1 P0
				await driveSSetAndEndTurn(duel, BOOK_OF_MOON); // T2 P1
				await driveSummon(duel, PRISMA_OFFICIAL); // T3 P0
				const idle = await settleToIdle(duel);
				chain.arm();
				const events = await drivePrismaIgnition(duel, PRISMA_OFFICIAL, idle);

				expect(chain.wasActivated()).toBe(true);
				// Cost selections happened BEFORE the opponent's window
				const reveal = events.indexOf("revealSelect");
				const send = events.indexOf("deckSendSelect");
				const firstChain = events.indexOf("p1ChainWindow");
				expect(reveal).toBeGreaterThanOrEqual(0);
				expect(send).toBeGreaterThan(reveal);
				expect(firstChain).toBeGreaterThan(send);
				// The material was ALREADY paid even though the effect whiffed
				expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(1);
			} finally {
				await duel.cleanup();
			}
		});
	});

	describe("Test 3: Dimensional Fissure — activatable, send banished, official cannot", () => {
		it("pre-errata: activates under Fissure and the sent material is banished", async () => {
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: [...buildDeck([PRISMA_PRE_ERRATA], 39), AVIAN], extra: [FLAME_WINGMAN] },
					{ main: buildDeck([DIM_FISSURE]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: discardPadsResponder,
			});
			try {
				await drivePassTurn(duel); // T1 P0
				await driveActivateAndEndTurn(duel, DIM_FISSURE); // T2 P1
				await driveSummon(duel, PRISMA_PRE_ERRATA); // T3 P0
				const events = await drivePrismaIgnition(duel, PRISMA_PRE_ERRATA);

				expect(events).toContain("revealSelect");
				expect(events).toContain("deckSendSelect");
				expect(duel.queryLocationCount(0, LOCATION_REMOVED)).toBe(1); // banished
				expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(0);
			} finally {
				await duel.cleanup();
			}
		});

		it("official (boundary): cost cannot be paid under Fissure — not activatable", async () => {
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: [...buildDeck([PRISMA_OFFICIAL], 39), AVIAN], extra: [FLAME_WINGMAN] },
					{ main: buildDeck([DIM_FISSURE]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: discardPadsResponder,
			});
			try {
				await drivePassTurn(duel); // T1 P0
				await driveActivateAndEndTurn(duel, DIM_FISSURE); // T2 P1
				await driveSummon(duel, PRISMA_OFFICIAL); // T3 P0

				const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
				expect(r.targetMessage.activatableCards.map((c) => c.code)).not.toContain(PRISMA_OFFICIAL);
			} finally {
				await duel.cleanup();
			}
		});
	});
});
