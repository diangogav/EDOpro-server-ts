import { EventEmitter } from "stream";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { YGOProRoom } from "../YGOProRoom";
import { YGOProSideDeckingState } from "./YGOProSideDeckingState";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { BanListDeckError } from "@shared/deck/domain/errors/BanListDeckError";
import { NotOfficialCardError } from "@shared/deck/domain/errors/NotOfficialCardError";
import { encodeDeckErrorCode } from "@shared/deck/domain/errors/encodeDeckErrorCode";

import { ErrorMessageType } from "ygopro-msg-encode";

// ---- helpers ----

// A minimal CTOS_UPDATE_DECK payload: mainCount, sideCount, then card codes.
const makeDeckPayload = (): Buffer => {
	const main = [0x00000001, 0x00000002];
	const side: number[] = [];
	const buf = Buffer.alloc(4 + 4 + (main.length + side.length) * 4);
	let offset = 0;
	buf.writeUInt32LE(main.length, offset);
	offset += 4;
	buf.writeUInt32LE(side.length, offset);
	offset += 4;
	for (const code of [...main, ...side]) {
		buf.writeUInt32LE(code, offset);
		offset += 4;
	}
	return buf;
};

const makeClientMessage = (data: Buffer): ClientMessage =>
	({ data, previousMessage: Buffer.alloc(0) }) as unknown as ClientMessage;

// ---- side-deck timeout chat (per-minute spam pruned to initial + one final warning) ----

describe("YGOProSideDeckingState — side-deck timeout chat", () => {
	let eventEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockDeckCreator: jest.Mocked<YGOProDeckCreator>;
	let mockDeckValidator: jest.Mocked<YGOProDeckValidator>;

	const makePlayer = (position: number) =>
		({
			position,
			name: `p${position}`,
			sendMessageToClient: jest.fn(),
			destroy: jest.fn(),
		}) as unknown as jest.Mocked<YGOProClient>;

	beforeEach(() => {
		jest.useFakeTimers();
		eventEmitter = new EventEmitter();
		mockLogger = {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<Logger>;
		mockDeckCreator = { build: jest.fn() } as unknown as jest.Mocked<YGOProDeckCreator>;
		mockDeckValidator = {
			validate: jest.fn().mockReturnValue(null),
		} as unknown as jest.Mocked<YGOProDeckValidator>;
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	// STOC_CHAT frames are opaque Buffers here; assert on call count instead of
	// decoding text, mirroring the rest of this suite's style.
	const chatCallCount = (player: jest.Mocked<YGOProClient>) =>
		(player.sendMessageToClient as jest.Mock).mock.calls.length;

	it("sends exactly one initial notice and one final-minute warning over a 3-minute timeout — never a per-minute repeat", () => {
		const player = makePlayer(0);
		const room = { players: [player], clients: [player] } as unknown as jest.Mocked<YGOProRoom>;

		new YGOProSideDeckingState(eventEmitter, mockLogger, mockDeckCreator, mockDeckValidator, room);

		expect(chatCallCount(player)).toBe(1); // initial notice only

		jest.advanceTimersByTime(60_000); // 3 -> 2 minutes remaining: no send
		expect(chatCallCount(player)).toBe(1);

		jest.advanceTimersByTime(60_000); // 2 -> 1 minute remaining: the ONE final warning
		expect(chatCallCount(player)).toBe(2);

		expect(player.destroy).not.toHaveBeenCalled();
	});

	it("broadcasts the disconnect notice and destroys the player on timeout, without a player-facing 'Time is up!' send", () => {
		const player = makePlayer(0);
		const room = { players: [player], clients: [player] } as unknown as jest.Mocked<YGOProRoom>;

		new YGOProSideDeckingState(eventEmitter, mockLogger, mockDeckCreator, mockDeckValidator, room);

		jest.advanceTimersByTime(3 * 60_000);

		// initial notice + final-minute warning + one room-wide disconnect
		// broadcast (also received by the same client, since clients === [player])
		expect(chatCallCount(player)).toBe(3);
		expect(player.destroy).toHaveBeenCalledTimes(1);
	});
});

describe("YGOProSideDeckingState.handleUpdateDeck — deck error code is encoded", () => {
	let eventEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockDeckCreator: jest.Mocked<YGOProDeckCreator>;
	let mockDeckValidator: jest.Mocked<YGOProDeckValidator>;
	let mockRoom: jest.Mocked<YGOProRoom>;
	let mockPlayer: jest.Mocked<YGOProClient>;

	const errorMessageMock = () => mockRoom.messageSender.errorMessage as unknown as jest.Mock;

	beforeEach(() => {
		eventEmitter = new EventEmitter();

		mockLogger = {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<Logger>;

		mockDeckCreator = { build: jest.fn() } as unknown as jest.Mocked<YGOProDeckCreator>;
		mockDeckValidator = {
			validate: jest.fn().mockReturnValue(null),
		} as unknown as jest.Mocked<YGOProDeckValidator>;

		mockRoom = {
			players: [], // empty → constructor schedules no side-deck timers
			banListHash: 0,
			hostInfo: { rule: 0 }, // referenced by the warn() log on the error paths
			cardPool: "standard",
			shouldValidateDeck: jest.fn().mockReturnValue(true),
			notReadyUnsafe: jest.fn(),
			setDecksToPlayerUnsafe: jest.fn(),
			messageSender: {
				errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
			},
		} as unknown as jest.Mocked<YGOProRoom>;

		mockPlayer = {
			isSpectator: false,
			position: 0,
			deck: { isSideDeckValid: jest.fn().mockReturnValue(true) },
			logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
			sendMessageToClient: jest.fn(),
		} as unknown as jest.Mocked<YGOProClient>;

		new YGOProSideDeckingState(
			eventEmitter,
			mockLogger,
			mockDeckCreator,
			mockDeckValidator,
			mockRoom,
		);
	});

	const emitUpdateDeck = (): Promise<void> => {
		const message = makeClientMessage(makeDeckPayload());
		return new Promise((resolve) => {
			setImmediate(() => resolve());
			eventEmitter.emit(Commands.UPDATE_DECK as unknown as string, message, mockRoom, mockPlayer);
		});
	};

	it("sends DECKERROR with the encoded code when build returns a DeckError", async () => {
		const deckError = new BanListDeckError(12345); // type=CARD_BANLISTED(1), code=12345
		mockDeckCreator.build.mockResolvedValue(deckError as never);

		await emitUpdateDeck();

		expect(errorMessageMock()).toHaveBeenCalledWith(
			ErrorMessageType.DECKERROR,
			encodeDeckErrorCode(deckError.type, deckError.code),
		);
		expect(errorMessageMock()).not.toHaveBeenCalledWith(
			ErrorMessageType.DECKERROR,
			deckError.type, // the old bug: raw unshifted type
		);
	});

	it("sends DECKERROR with the encoded code when validation fails", async () => {
		const fakeDeck = { allCards: [{ code: 12345 }] };
		const deckError = new NotOfficialCardError(12345); // type=CARD_UNOFFICIAL(0xa), code=12345
		mockDeckCreator.build.mockResolvedValue(fakeDeck as never);
		mockDeckValidator.validate.mockReturnValue(deckError);

		await emitUpdateDeck();

		expect(errorMessageMock()).toHaveBeenCalledWith(
			ErrorMessageType.DECKERROR,
			encodeDeckErrorCode(deckError.type, deckError.code),
		);
	});
});

// ---- post-side turn choice (KDE Tournament Policy §IV.F) ----
//
// After a decided duel, the loser of the previous duel chooses who goes first
// (selectTp → choosingOrder). After a DRAWN duel the loser-chooses rule does
// not apply: "another random method should be employed to choose the deciding
// Duelist" — the room must re-enter RPS instead of reusing a stale chooser.

describe("YGOProSideDeckingState — post-side turn choice", () => {
	let eventEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockDeckCreator: jest.Mocked<YGOProDeckCreator>;
	let mockDeckValidator: jest.Mocked<YGOProDeckValidator>;

	const makePlayer = (position: number, team: number) =>
		({
			isSpectator: false,
			position,
			team,
			isReady: true,
			name: `p${position}`,
			ready: jest.fn(),
			captain: jest.fn(),
			deck: { isSideDeckValid: jest.fn().mockReturnValue(true) },
			logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
			sendMessageToClient: jest.fn(),
		}) as unknown as jest.Mocked<YGOProClient>;

	const makeRoom = (
		players: jest.Mocked<YGOProClient>[],
		opts: { chooser?: YGOProClient; turnChoiceRequiresRps?: boolean },
	) =>
		({
			players,
			banListHash: 0,
			hostInfo: { rule: 0 },
			cardPool: "standard",
			shouldValidateDeck: jest.fn().mockReturnValue(false),
			notReadyUnsafe: jest.fn(),
			setDecksToPlayerUnsafe: jest.fn(),
			getTeamPlayers: jest.fn((team: number) => players.filter((p) => p.team === team)),
			rps: jest.fn(),
			choosingOrder: jest.fn(),
			clientWhoChoosesTurn: opts.chooser,
			turnChoiceRequiresRps: opts.turnChoiceRequiresRps ?? false,
			messageSender: {
				errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
				duelStartMessage: jest.fn().mockReturnValue(Buffer.from("duel-start")),
				selectHandMessage: jest.fn().mockReturnValue(Buffer.from("select-hand")),
				selectTpMessage: jest.fn().mockReturnValue(Buffer.from("select-tp")),
			},
		}) as unknown as jest.Mocked<YGOProRoom>;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		mockLogger = {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<Logger>;
		mockDeckCreator = {
			build: jest.fn().mockResolvedValue({ allCards: [] }),
		} as unknown as jest.Mocked<YGOProDeckCreator>;
		mockDeckValidator = {
			validate: jest.fn().mockReturnValue(null),
		} as unknown as jest.Mocked<YGOProDeckValidator>;
	});

	const emitUpdateDeckFrom = (
		room: jest.Mocked<YGOProRoom>,
		player: jest.Mocked<YGOProClient>,
	): Promise<void> => {
		const message = makeClientMessage(makeDeckPayload());
		return new Promise((resolve) => {
			setImmediate(() => resolve());
			eventEmitter.emit(Commands.UPDATE_DECK as unknown as string, message, room, player);
		});
	};

	it("re-enters RPS when the previous duel was a draw (turnChoiceRequiresRps)", async () => {
		const p0 = makePlayer(0, 0);
		const p1 = makePlayer(1, 1);
		// A stale chooser from game 1 is present on purpose — the flag must win.
		const room = makeRoom([p0, p1], { chooser: p0, turnChoiceRequiresRps: true });
		new YGOProSideDeckingState(eventEmitter, mockLogger, mockDeckCreator, mockDeckValidator, room);

		await emitUpdateDeckFrom(room, p0);

		expect(room.rps).toHaveBeenCalledTimes(1);
		expect(room.choosingOrder).not.toHaveBeenCalled();
		expect(room.turnChoiceRequiresRps).toBe(false);
		// Both captains got STOC_SELECT_HAND
		expect(p0.captain).toHaveBeenCalled();
		expect(p1.captain).toHaveBeenCalled();
		expect(p0.sendMessageToClient).toHaveBeenCalledWith(Buffer.from("select-hand"));
		expect(p1.sendMessageToClient).toHaveBeenCalledWith(Buffer.from("select-hand"));
		expect(room.messageSender.selectTpMessage).not.toHaveBeenCalled();
	});

	it("keeps loser-chooses (selectTp → choosingOrder) when the previous duel had a winner", async () => {
		const p0 = makePlayer(0, 0);
		const p1 = makePlayer(1, 1);
		const room = makeRoom([p0, p1], { chooser: p1, turnChoiceRequiresRps: false });
		new YGOProSideDeckingState(eventEmitter, mockLogger, mockDeckCreator, mockDeckValidator, room);

		await emitUpdateDeckFrom(room, p0);

		expect(p1.sendMessageToClient).toHaveBeenCalledWith(Buffer.from("select-tp"));
		expect(room.choosingOrder).toHaveBeenCalledTimes(1);
		expect(room.rps).not.toHaveBeenCalled();
	});

	it("falls back to RPS instead of throwing when no chooser was assigned", async () => {
		const p0 = makePlayer(0, 0);
		const p1 = makePlayer(1, 1);
		const room = makeRoom([p0, p1], { chooser: undefined, turnChoiceRequiresRps: false });
		new YGOProSideDeckingState(eventEmitter, mockLogger, mockDeckCreator, mockDeckValidator, room);

		await emitUpdateDeckFrom(room, p0);

		expect(room.rps).toHaveBeenCalledTimes(1);
		expect(room.choosingOrder).not.toHaveBeenCalled();
	});
});
