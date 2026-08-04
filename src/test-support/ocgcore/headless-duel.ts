/**
 * HeadlessDuel — in-process ocgcore duel harness for behavior tests.
 *
 * Boots a deterministic duel (PseudoShuffle + fixed seed) without worker
 * threads or the DI container. Designed for Edison-era rule tests (MR1-MR2)
 * where we need to inspect engine output message-by-message.
 *
 * Usage:
 *   const duel = await HeadlessDuel.create(options);
 *   const msgs = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
 *   await duel.cleanup();
 */

import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import {
	OcgcoreDuelOptionFlag,
	_OcgcoreConstants,
	createOcgcoreWrapper,
	DirScriptReaderEx,
} from "koishipro-core.js";
import type { OcgcoreDuel, OcgcoreWrapper } from "koishipro-core.js";
import initSqlJs from "sql.js";
import type { CardDataEntry } from "ygopro-cdb-encode";
import { YGOProCdb } from "ygopro-cdb-encode";
import {
	YGOProMessages,
	YGOProMsgDraw,
	YGOProMsgResponseBase,
	YGOProMsgRockPaperScissors,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectDisField,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectOption,
	YGOProMsgSelectPlace,
	YGOProMsgSelectPosition,
	YGOProMsgSelectTribute,
	YGOProMsgSelectYesNo,
} from "ygopro-msg-encode";
import type { YGOProMsgBase } from "ygopro-msg-encode";
import { CardStorage } from "@ygopro/ygopro/card-storage";

const { OcgcoreScriptConstants } = _OcgcoreConstants;

// Status code returned by duel.process() when the engine is waiting for a response.
// process() encodes the processor state in the upper 4 bits of the u32 return value.
// PROCESSOR_WAITING = 0x10000000, extracted as (result >>> 28) & 15 = 1.
// PROCESSOR_END = 0x20000000 → status 2 (duel over — NOT "needs response").
const STATUS_NEEDS_RESPONSE = 1;

// Maximum iterations before giving up (safety cap).
const MAX_PROCESS_ITERATIONS = 10_000;

export interface HeadlessDuelDeck {
	main: number[];
	extra?: number[];
}

export interface HeadlessDuelOptions {
	/**
	 * Two decks: [player0, player1].
	 */
	decks: [HeadlessDuelDeck, HeadlessDuelDeck];

	/**
	 * duel_rule value (1 = MR1, 4 = New Master Rule, 5 = MR2020, …).
	 * Stored in the high 16 bits of the start option word.
	 */
	duelRule: number;

	/**
	 * Seed for createDuelV2 — 8 × uint32.
	 * Keep it constant across runs to make tests deterministic.
	 */
	seed: number[];

	/**
	 * Additional option flags ORed into the computed option word.
	 * PseudoShuffle (0x10) is always added; callers may include others.
	 */
	extraFlags?: number;

	/**
	 * Paths to card database files (.cdb) to load.
	 * Defaults to the standard repo paths when omitted.
	 */
	cdbPaths?: string[];

	/**
	 * Paths searched by DirScriptReaderEx for Lua scripts.
	 * Defaults to the standard repo paths when omitted.
	 */
	scriptPaths?: string[];

	/**
	 * Starting LP for each player. Default: 8000.
	 */
	startLp?: number;

	/**
	 * Starting hand size. Default: 5.
	 */
	startHand?: number;

	/**
	 * Cards drawn each turn. Default: 1.
	 */
	drawCount?: number;

	/**
	 * Path to an alternative libocgcore.wasm binary. When provided, the harness
	 * boots the wrapper with this binary instead of the vendored one — same
	 * injection mechanism production uses on the ygopro path (CardLoadWorker
	 * reads `<cwd>/ocgcore-worker` into CardStorage; OcgcoreWorker boots the
	 * wrapper with it). Used to test patched core builds.
	 */
	wasmPath?: string;

	/**
	 * Auto-responder override. When provided, replaces the built-in auto-responder
	 * for messages that require a response. Return undefined to fall back to the
	 * built-in logic, or return a Uint8Array to supply a custom response.
	 *
	 * The built-in auto-responder handles:
	 *   - SelectChain → decline (defaultResponse)
	 *   - SelectPlace  → first selectable place
	 *   - SelectEffectYn / SelectYesNo → no (defaultResponse)
	 *   - SelectOption → option 0
	 *   - SelectPosition → first available bit position
	 *   - RockPaperScissors → 1
	 */
	autoResponder?: (msg: YGOProMsgResponseBase) => Uint8Array | undefined;
}

// Default repo-relative paths resolved from __dirname (src/test-support/ocgcore/).
// 3 levels up → repo root.
const REPO_ROOT = path.resolve(__dirname, "../../../");
const DEFAULT_CDB_PATHS = [
	path.join(REPO_ROOT, "resources/current/ygopro/base/cards.cdb"),
	path.join(REPO_ROOT, "resources/current/ygopro/classic/classic.cdb"),
	path.join(REPO_ROOT, "resources/current/ygopro/formats/edison/pre-errata.es.cdb"),
];
const DEFAULT_SCRIPT_PATHS = [
	path.join(REPO_ROOT, "resources/current/ygopro/base"),
	path.join(REPO_ROOT, "resources/current/ygopro/classic"),
	path.join(REPO_ROOT, "resources/current/ygopro/formats/edison"),
];

/**
 * Load card databases from .cdb files and build a CardStorage.
 * Uses first-occurrence dedup (same logic as the production CardLoadWorker).
 */
async function loadCardStorage(cdbPaths: string[]): Promise<CardStorage> {
	const SQL = await initSqlJs();
	const cards: CardDataEntry[] = [];
	const seen = new Set<number>();

	for (const cdbPath of cdbPaths) {
		if (!fs.existsSync(cdbPath)) {
			continue;
		}
		const buf = fs.readFileSync(cdbPath);
		const cdb = new YGOProCdb(new SQL.Database(buf)).noTexts();
		for (const card of cdb.step()) {
			const cardId = (card.code ?? 0) >>> 0;
			if (cardId === 0 || seen.has(cardId)) {
				continue;
			}
			seen.add(cardId);
			cards.push(card);
		}
		cdb.finalize();
	}

	return CardStorage.fromCards(cards);
}

/**
 * Built-in auto-responder. Handles routine prompts that appear before
 * the first SelectIdleCmd so that scenario tests only need to handle
 * the messages they care about.
 *
 * Returns undefined for messages that are not routine.
 */
function builtInAutoRespond(msg: YGOProMsgResponseBase): Uint8Array | undefined {
	if (msg instanceof YGOProMsgSelectChain) {
		return msg.defaultResponse();
	}
	if (msg instanceof YGOProMsgSelectPlace || msg instanceof YGOProMsgSelectDisField) {
		const places = msg.getSelectablePlaces();
		if (places.length > 0) {
			return msg.prepareResponse([places[0]]);
		}
		return undefined;
	}
	if (msg instanceof YGOProMsgSelectEffectYn || msg instanceof YGOProMsgSelectYesNo) {
		return msg.defaultResponse();
	}
	if (msg instanceof YGOProMsgSelectOption) {
		return msg.prepareResponse(0);
	}
	if (msg instanceof YGOProMsgSelectPosition) {
		// Find lowest set bit position (first valid position)
		const lsb = msg.positions & -msg.positions;
		return msg.prepareResponse(lsb);
	}
	if (msg instanceof YGOProMsgRockPaperScissors) {
		return msg.prepareResponse(1 as Parameters<typeof msg.prepareResponse>[0]);
	}
	// SelectTribute: pick the first available card (used for Exiled Force cost)
	if (msg instanceof YGOProMsgSelectTribute) {
		const cards = msg.cards;
		if (cards.length > 0) {
			return msg.prepareResponse([
				{
					sequence: cards[0].sequence,
					controller: cards[0].controller,
					location: cards[0].location,
				},
			]);
		}
		return undefined;
	}
	// SelectCard: pick first available card
	if (msg instanceof YGOProMsgSelectCard) {
		if (msg.count > 0) {
			return msg.prepareResponse([
				{
					sequence: msg.cards[0].sequence,
					controller: msg.cards[0].controller,
					location: msg.cards[0].location,
				},
			]);
		}
		return msg.defaultResponse();
	}
	return undefined;
}

export class HeadlessDuel {
	private wrapper: OcgcoreWrapper;
	private duel: OcgcoreDuel;
	private readonly resolvedOptions: Required<
		Pick<HeadlessDuelOptions, "autoResponder" | "extraFlags">
	> &
		HeadlessDuelOptions;

	private constructor(wrapper: OcgcoreWrapper, duel: OcgcoreDuel, options: HeadlessDuelOptions) {
		this.wrapper = wrapper;
		this.duel = duel;
		this.resolvedOptions = {
			extraFlags: 0,
			autoResponder: () => undefined,
			...options,
		};
	}

	/**
	 * Boot a duel with the provided options and return a ready-to-drive harness.
	 */
	static async create(options: HeadlessDuelOptions): Promise<HeadlessDuel> {
		const cdbPaths = options.cdbPaths ?? DEFAULT_CDB_PATHS;
		const scriptPaths = options.scriptPaths ?? DEFAULT_SCRIPT_PATHS;
		const startLp = options.startLp ?? 8000;
		const startHand = options.startHand ?? 5;
		const drawCount = options.drawCount ?? 1;

		// Boot WASM core. OCGCORE_WASM lets a full suite run against an
		// alternative core build without touching each test.
		const wasmPath = options.wasmPath ?? process.env.OCGCORE_WASM;
		const wrapper = wasmPath
			? await createOcgcoreWrapper({
					wasmBinary: new Uint8Array(fs.readFileSync(wasmPath)),
				})
			: await createOcgcoreWrapper();

		// Set up script reader (silently skips missing files — acceptable for test slice)
		const scriptReader = await DirScriptReaderEx(...scriptPaths);
		wrapper.setScriptReader(scriptReader);

		// Set up card reader
		const cardStorage = await loadCardStorage(cdbPaths);
		wrapper.setCardReader(cardStorage.toCardReader());

		// Create duel
		const duel = wrapper.createDuelV2(options.seed);

		// Registry (mirrors OcgcoreWorker.init registry usage)
		duel.loadRegistry({
			duel_mode: "classic",
			start_lp: String(startLp),
			start_hand: String(startHand),
			draw_count: String(drawCount),
			player_type_0: "0",
			player_type_1: "1",
		});

		// Player info
		for (let p = 0; p < 2; p++) {
			duel.setPlayerInfo({ player: p, lp: startLp, startHand, drawCount });
		}

		// Load decks (reversed, matching OcgcoreWorker.init)
		for (let p = 0; p < 2; p++) {
			const deck = options.decks[p];
			for (const code of [...deck.main].reverse()) {
				duel.newCard({
					code,
					owner: p,
					player: p,
					location: OcgcoreScriptConstants.LOCATION_DECK,
					sequence: 0,
					position: OcgcoreScriptConstants.POS_FACEDOWN_DEFENSE,
				});
			}
			for (const code of [...(deck.extra ?? [])].reverse()) {
				duel.newCard({
					code,
					owner: p,
					player: p,
					location: OcgcoreScriptConstants.LOCATION_EXTRA,
					sequence: 0,
					position: OcgcoreScriptConstants.POS_FACEDOWN_DEFENSE,
				});
			}
		}

		// Compute option word: duel_rule in high 16 bits + PseudoShuffle always on for determinism
		const opt =
			(options.duelRule << 16) | OcgcoreDuelOptionFlag.PseudoShuffle | (options.extraFlags ?? 0);

		duel.startDuel(opt);

		return new HeadlessDuel(wrapper, duel, options);
	}

	/**
	 * Core drive loop: advance the duel, auto-responding to routine prompts,
	 * until the predicate returns a non-null hit. Returns the hit value plus all
	 * messages seen during the advance.
	 *
	 * Throws if the predicate never matches within MAX_PROCESS_ITERATIONS loops.
	 */
	private async advanceUntilMatch<T extends YGOProMsgBase>(
		predicate: (msg: YGOProMsgBase) => T | null,
		timeoutLabel: string,
	): Promise<{ allMessages: YGOProMsgBase[]; targetMessage: T }> {
		const allMessages: YGOProMsgBase[] = [];
		let iterations = 0;

		while (iterations < MAX_PROCESS_ITERATIONS) {
			iterations++;
			const result = this.duel.process();

			if (result.raw.length > 0) {
				const decoded = YGOProMessages.getInstancesFromPayload(result.raw);
				allMessages.push(...decoded);

				for (const msg of decoded) {
					const hit = predicate(msg);
					if (hit !== null) {
						return { allMessages, targetMessage: hit };
					}
				}

				if (result.status === STATUS_NEEDS_RESPONSE) {
					const respMsg = decoded
						.slice()
						.reverse()
						.find((m): m is YGOProMsgResponseBase => m instanceof YGOProMsgResponseBase);

					if (respMsg) {
						const response =
							this.resolvedOptions.autoResponder(respMsg) ?? builtInAutoRespond(respMsg);
						if (response !== undefined) {
							this.duel.setResponse(response);
						} else {
							throw new Error(
								`No auto-responder for message type ${respMsg.constructor.name} (id=${respMsg.identifier}). ` +
									"Provide a custom autoResponder in HeadlessDuelOptions.",
							);
						}
					}
				}
			}
		}

		throw new Error(
			`${timeoutLabel} reached ${MAX_PROCESS_ITERATIONS} iterations without finding the target message.`,
		);
	}

	/**
	 * Advance the duel, auto-responding to routine prompts, until a message of
	 * the given class is decoded. Returns that message plus all messages seen
	 * during the advance.
	 *
	 * Throws if the target is never reached within MAX_PROCESS_ITERATIONS loops.
	 */
	async advanceUntil<T extends YGOProMsgBase>(
		targetClass: new () => T,
	): Promise<{ allMessages: YGOProMsgBase[]; targetMessage: T }> {
		return this.advanceUntilMatch(
			(msg) => (msg instanceof targetClass ? (msg as T) : null),
			`advanceUntil(${targetClass.name})`,
		);
	}

	/**
	 * Advance the duel, auto-responding to routine prompts, until a message of
	 * ANY of the provided classes is decoded. Returns the matched message (as
	 * YGOProMsgBase — cast as needed) plus all messages seen during the advance.
	 *
	 * Useful for battle-phase driving where the engine may stop at either a
	 * SelectBattleCmd (more attacks available) or a SelectIdleCmd (BP ended).
	 *
	 * Throws if none of the targets is reached within MAX_PROCESS_ITERATIONS loops.
	 */
	async advanceUntilOneOf(
		targetClasses: Array<new () => YGOProMsgBase>,
	): Promise<{ allMessages: YGOProMsgBase[]; targetMessage: YGOProMsgBase }> {
		const names = targetClasses.map((c) => c.name).join(", ");
		return this.advanceUntilMatch((msg) => {
			for (const cls of targetClasses) {
				if (msg instanceof cls) {
					return msg;
				}
			}
			return null;
		}, `advanceUntilOneOf([${names}])`);
	}

	/**
	 * Count cards drawn to a player's hand by summing MSG_DRAW counts seen so far.
	 * Pass the allMessages array from advanceUntil().
	 *
	 * Note: ocgcore sends MSG_DRAW (not MSG_MOVE) for initial hand and turn draws.
	 * MSG_MOVE is sent only for card movements triggered by card effects. For the
	 * standard opening hand + turn-1 draw scenario, MSG_DRAW is the correct source.
	 *
	 * This gives the cumulative hand size assuming no cards left the hand before the
	 * target message (which holds for a clean turn-1 scenario with vanilla monsters).
	 */
	static countHandFromMessages(messages: YGOProMsgBase[], player: number): number {
		let count = 0;
		for (const msg of messages) {
			if (msg instanceof YGOProMsgDraw && msg.player === player) {
				count += msg.count;
			}
		}
		return count;
	}

	/**
	 * Count cards in a player's hand using the engine's queryFieldCount API.
	 * This is the authoritative source — prefer it over message replay for assertions.
	 */
	queryHandCount(player: number): number {
		return this.duel.queryFieldCount({
			player,
			location: OcgcoreScriptConstants.LOCATION_HAND,
		});
	}

	/**
	 * Set a response on the current duel (the engine will accept it
	 * on the next process() call). Use after advanceUntil() returns a
	 * response-requiring message that you want to handle manually.
	 */
	setResponse(response: Uint8Array): void {
		this.duel.setResponse(response);
	}

	/**
	 * Count cards in any location using the engine's queryFieldCount API.
	 * location: OcgcoreScriptConstants.LOCATION_* constant.
	 */
	queryLocationCount(player: number, location: number): number {
		return this.duel.queryFieldCount({ player, location });
	}

	async cleanup(): Promise<void> {
		this.duel.endDuel();
		this.wrapper.finalize();
	}
}
