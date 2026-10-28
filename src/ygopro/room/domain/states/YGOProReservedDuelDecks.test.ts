/**
 * A reserved duel's deck lock (waiting and side decking) and the server-owned
 * start: the duel begins once both seats are taken and ready, never on a
 * host's TRY_START.
 */
import { EventEmitter } from "stream";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { DeckLockKind, Reservation } from "@shared/reserved-duel/domain/Reservation";
import { ReservedDuelSession } from "@shared/reserved-duel/domain/ReservedDuelSession";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { ErrorMessageType } from "ygopro-msg-encode";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { AdmitToRoom } from "../../admission/application/AdmitToRoom";
import { YGOProRoom } from "../YGOProRoom";
import { YGOProSideDeckingState } from "./YGOProSideDeckingState";
import { YGOProWaitingState } from "./YGOProWaitingState";

const REQUIRED = { main: [1, 1, 2], extra: [10], side: [20] };

const makeReservation = (deckLock: DeckLockKind): Reservation => ({
	id: "Ab3dEf6hIj9kLm2n",
	format: "edison",
	mode: "match",
	participants: [
		{ seat: 0, kind: "user", userId: "user-1", requiredDeck: REQUIRED },
		{ seat: 1, kind: "windbot", botName: "Haunted" },
	],
	options: {
		spectators: false,
		listed: false,
		reconnect: false,
		deckLock,
		lobbyTimeoutSeconds: 120,
	},
});

const cards = (codes: number[]) => codes.map((code) => ({ code: String(code) }));
const makeDeck = (main: number[], extra: number[], side: number[]) => ({
	main: cards(main),
	extra: cards(extra),
	side: cards(side),
	allCards: cards([...main, ...extra, ...side]),
	isSideDeckValid: () => true,
});

const makeLogger = (): jest.Mocked<Logger> =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as unknown as jest.Mocked<Logger>;

const makeDeckPayload = (): Buffer => {
	const buf = Buffer.alloc(8);
	return buf;
};

const message = {
	data: makeDeckPayload(),
	previousMessage: Buffer.alloc(0),
} as unknown as ClientMessage;

const makePlayer = (team: number, overrides: Record<string, unknown> = {}) =>
	({
		team,
		position: team,
		isSpectator: false,
		isInternal: false,
		isReady: false,
		logger: makeLogger(),
		sendMessageToClient: jest.fn(),
		captain: jest.fn(),
		ready: jest.fn(),
		deck: { isSideDeckValid: () => true },
		...overrides,
	}) as unknown as jest.Mocked<YGOProClient>;

const makeRoom = (deckLock: DeckLockKind, players: YGOProClient[]) =>
	({
		id: 7,
		reservedDuel: new ReservedDuelSession(makeReservation(deckLock), {
			started: jest.fn(),
			abandoned: jest.fn(),
			release: jest.fn(),
		}),
		mutex: { runExclusive: jest.fn().mockImplementation((fn: () => void) => fn()) },
		banListHash: 0,
		shouldValidateDeck: () => true,
		setDecksToPlayerUnsafe: jest.fn(),
		notReadyUnsafe: jest.fn(),
		messageSender: {
			errorMessage: jest.fn().mockReturnValue(Buffer.from("deckerror")),
			duelStartMessage: jest.fn().mockReturnValue(Buffer.from("start")),
			selectHandMessage: jest.fn().mockReturnValue(Buffer.from("hand")),
		},
		hostInfo: { rule: 0 },
		cardPool: "standard",
		isPlayersFull: true,
		allPlayersReady: true,
		players,
		clients: players,
		noReconnect: true,
		sendDeckCountMessage: jest.fn(),
		getTeamPlayers: (team: number) => players.filter((player) => player.team === team),
		createMatch: jest.fn(),
		rps: jest.fn(),
		movePlayerToAnotherCellUnsafe: jest.fn(),
		playerToSpectatorUnsafe: jest.fn(),
		spectatorToPlayerUnsafe: jest.fn(),
	}) as unknown as jest.Mocked<YGOProRoom> & { createMatch: jest.Mock; rps: jest.Mock };

const flush = () => new Promise((resolve) => setImmediate(resolve));

const setUpWaiting = (deck: unknown, banlistError: unknown = null) => {
	const emitter = new EventEmitter();
	const deckCreator = { build: jest.fn().mockResolvedValue(deck) } as unknown as YGOProDeckCreator;
	const validator = {
		validate: jest.fn().mockReturnValue(banlistError),
	} as unknown as YGOProDeckValidator;
	new YGOProWaitingState(
		{ run: jest.fn() } as unknown as AdmitToRoom,
		emitter,
		makeLogger(),
		deckCreator,
		validator,
	);

	return emitter;
};

describe("YGOProWaitingState with a reserved duel", () => {
	it("accepts the required deck and starts the duel once both seats are ready", async () => {
		const human = makePlayer(0);
		const room = makeRoom("exact", [human, makePlayer(1, { isInternal: true })]);
		const emitter = setUpWaiting(makeDeck([2, 1, 1], [10], [20]));

		emitter.emit(Commands.UPDATE_DECK as unknown as string, message, room, human);
		await flush();

		expect(room.setDecksToPlayerUnsafe).toHaveBeenCalled();
		expect(room.createMatch).toHaveBeenCalledTimes(1);
		expect(room.rps).toHaveBeenCalledTimes(1);
	});

	it("does not start while a seat is still empty", async () => {
		const human = makePlayer(0);
		const room = makeRoom("exact", [human]);
		(room as unknown as { isPlayersFull: boolean }).isPlayersFull = false;
		const emitter = setUpWaiting(makeDeck([1, 1, 2], [10], [20]));

		emitter.emit(Commands.UPDATE_DECK as unknown as string, message, room, human);
		await flush();

		expect(room.setDecksToPlayerUnsafe).toHaveBeenCalled();
		expect(room.createMatch).not.toHaveBeenCalled();
	});

	it("rejects another deck: not ready, DECKERROR, nothing set", async () => {
		const human = makePlayer(0);
		const room = makeRoom("exact", [human]);
		const emitter = setUpWaiting(makeDeck([1, 1, 3], [10], [20]));

		emitter.emit(Commands.UPDATE_DECK as unknown as string, message, room, human);
		await flush();

		expect(room.notReadyUnsafe).toHaveBeenCalledWith(human);
		expect(room.messageSender.errorMessage).toHaveBeenCalledWith(ErrorMessageType.DECKERROR, 0);
		expect(room.setDecksToPlayerUnsafe).not.toHaveBeenCalled();
	});

	it("under an exact lock ignores a deck re-sent after ready", async () => {
		const human = makePlayer(0, { isReady: true });
		const room = makeRoom("exact", [human]);
		const emitter = setUpWaiting(makeDeck([1, 1, 2], [10], [20]));

		emitter.emit(Commands.UPDATE_DECK as unknown as string, message, room, human);
		await flush();

		expect(room.setDecksToPlayerUnsafe).not.toHaveBeenCalled();
	});

	it("under a registered lock accepts the cards moved between main and side", async () => {
		const human = makePlayer(0);
		const room = makeRoom("registered", [human]);
		const emitter = setUpWaiting(makeDeck([1, 20, 2], [10], [1]));

		emitter.emit(Commands.UPDATE_DECK as unknown as string, message, room, human);
		await flush();

		expect(room.setDecksToPlayerUnsafe).toHaveBeenCalled();
	});

	it("checks the banlist before the deck lock", async () => {
		const human = makePlayer(0);
		const room = makeRoom("exact", [human]);
		const emitter = setUpWaiting(makeDeck([1, 1, 3], [10], [20]), { type: 1, code: 3 });

		emitter.emit(Commands.UPDATE_DECK as unknown as string, message, room, human);
		await flush();

		expect(room.messageSender.errorMessage).toHaveBeenCalledTimes(1);
		expect(room.messageSender.errorMessage).not.toHaveBeenCalledWith(ErrorMessageType.DECKERROR, 0);
		expect(human.sendMessageToClient).toHaveBeenCalledTimes(1);
	});

	it("keeps a duelist on the reservation's seat: TO_DUEL does not move cells", () => {
		const human = makePlayer(0);
		const room = makeRoom("exact", [human, makePlayer(1)]);
		const emitter = setUpWaiting(makeDeck([], [], []));

		emitter.emit(Commands.TO_DUEL as unknown as string, message, room, human);

		expect(room.movePlayerToAnotherCellUnsafe).not.toHaveBeenCalled();
	});

	it("keeps a duelist on the reservation's seat: TO_OBSERVER does not leave it", () => {
		const human = makePlayer(0);
		const room = makeRoom("exact", [human, makePlayer(1)]);
		const emitter = setUpWaiting(makeDeck([], [], []));

		emitter.emit(Commands.OBSERVER as unknown as string, message, room, human);

		expect(room.playerToSpectatorUnsafe).not.toHaveBeenCalled();
	});

	it("keeps a watcher in the stands of a reserved room", () => {
		const watcher = makePlayer(0, { isSpectator: true, socket: {} });
		const room = makeRoom("exact", [makePlayer(1)]);
		Object.assign(room, {
			league: { admitsAsPlayer: () => true },
			reservationPermitsSeat: () => true,
		});
		const emitter = setUpWaiting(makeDeck([], [], []));

		emitter.emit(Commands.TO_DUEL as unknown as string, message, room, watcher);

		expect(room.spectatorToPlayerUnsafe).not.toHaveBeenCalled();
	});

	it("ignores the host's TRY_START: the server starts a reserved duel", () => {
		const host = makePlayer(0, { host: true });
		const room = makeRoom("exact", [host, makePlayer(1)]);
		const emitter = setUpWaiting(makeDeck([], [], []));

		emitter.emit(Commands.TRY_START as unknown as string, message, room, host);

		expect(room.createMatch).not.toHaveBeenCalled();
	});
});

describe("YGOProSideDeckingState with a reserved duel", () => {
	const sideDeck = (deckLock: DeckLockKind, deck: unknown) => {
		const human = makePlayer(0);
		const room = makeRoom(deckLock, [human, makePlayer(1, { isInternal: true, isReady: false })]);
		const state = Object.create(YGOProSideDeckingState.prototype) as Record<string, unknown>;
		Object.assign(state, {
			logger: makeLogger(),
			deckCreator: { build: jest.fn().mockResolvedValue(deck) },
			deckValidator: { validate: jest.fn().mockReturnValue(null) },
			clearPlayerTimeout: jest.fn(),
		});
		const handle = (state as { handleUpdateDeck: (...args: unknown[]) => Promise<void> })
			.handleUpdateDeck;

		return { human, room, run: () => handle.call(state, message, room, human) };
	};

	it("under a registered lock accepts a side swap", async () => {
		const { room, run } = sideDeck("registered", makeDeck([1, 20, 2], [10], [1]));

		await run();

		expect(room.setDecksToPlayerUnsafe).toHaveBeenCalled();
	});

	it("rejects a deck with cards that were never registered", async () => {
		const { human, room, run } = sideDeck("registered", makeDeck([1, 99, 2], [10], [1]));

		await run();

		expect(room.notReadyUnsafe).toHaveBeenCalledWith(human);
		expect(room.setDecksToPlayerUnsafe).not.toHaveBeenCalled();
	});

	it("under an exact lock rejects a side swap", async () => {
		const { room, run } = sideDeck("exact", makeDeck([1, 20, 2], [10], [1]));

		await run();

		expect(room.setDecksToPlayerUnsafe).not.toHaveBeenCalled();
	});
});
