import { EventEmitter } from "stream";

import { mock, MockProxy } from "jest-mock-extended";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { YGOProRoom } from "../YGOProRoom";
import { YGOProWaitingState } from "./YGOProWaitingState";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { NotOfficialCardError } from "@shared/deck/domain/errors/NotOfficialCardError";
import { RankedUserResolver } from "../../application/RankedUserResolver";
import { ISocket } from "@shared/socket/domain/ISocket";
import { ErrorMessageType } from "ygopro-msg-encode";

// ---- helpers ----

// mercuryConfig.version = 4962 = 0x1362 → LE bytes: 0x62 0x13
const makeJoinData = (): Buffer => {
	const buf = Buffer.alloc(48);
	buf.writeUInt16LE(4962, 0);
	return buf;
};

// "Jaden" in UTF-16LE with no password separator (40 bytes)
const PLAYER_INFO_HEX =
	"4a006100640065006e00000000000000000000000000000000000000000000000000000000000000";

const makeJoinMessage = (): ClientMessage =>
	({
		data: makeJoinData(),
		previousMessage: Buffer.from(PLAYER_INFO_HEX, "hex"),
	} as unknown as ClientMessage);

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
	({
		data,
		previousMessage: Buffer.alloc(0),
	} as unknown as ClientMessage);

describe("YGOProWaitingState.handleUpdateDeck", () => {
	let eventEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockResolver: MockProxy<RankedUserResolver>;
	let mockDeckCreator: jest.Mocked<YGOProDeckCreator>;
	let mockDeckValidator: jest.Mocked<YGOProDeckValidator>;
	let mockRoom: jest.Mocked<YGOProRoom>;
	let mockPlayer: jest.Mocked<YGOProClient>;

	beforeEach(() => {
		eventEmitter = new EventEmitter();

		mockLogger = {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<Logger>;

		mockResolver = mock<RankedUserResolver>();

		mockDeckCreator = {
			build: jest.fn(),
		} as unknown as jest.Mocked<YGOProDeckCreator>;

		mockDeckValidator = {
			validate: jest.fn().mockReturnValue(null),
		} as unknown as jest.Mocked<YGOProDeckValidator>;

		mockRoom = {
			mutex: {
				runExclusive: jest.fn().mockImplementation((fn: () => void) => fn()),
			},
			banListHash: 0,
			shouldValidateDeck: jest.fn().mockReturnValue(true),
			setDecksToPlayerUnsafe: jest.fn(),
			notReadyUnsafe: jest.fn(),
			messageSender: {
				errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
			},
			hostInfo: { rule: 0 },
			useExtendedCardPool: false,
		} as unknown as jest.Mocked<YGOProRoom>;

		mockPlayer = {
			isSpectator: false,
			isInternal: false,
			position: 0,
			logger: {
				child: jest.fn().mockReturnThis(),
				info: jest.fn(),
				warn: jest.fn(),
				error: jest.fn(),
				debug: jest.fn(),
			},
			sendMessageToClient: jest.fn(),
		} as unknown as jest.Mocked<YGOProClient>;

		new YGOProWaitingState(
			mockResolver,
			eventEmitter,
			mockLogger,
			mockDeckCreator,
			mockDeckValidator,
		);
	});

	const emitUpdateDeck = (player: jest.Mocked<YGOProClient>): Promise<void> => {
		const data = makeDeckPayload();
		const message = makeClientMessage(data);
		return new Promise((resolve) => {
			setImmediate(() => resolve());
			eventEmitter.emit(Commands.UPDATE_DECK as unknown as string, message, mockRoom, player);
		});
	};

	describe("when player.isInternal is false (human player)", () => {
		it("should call the deck validator", async () => {
			const fakeDeck = { allCards: [] };
			mockDeckCreator.build.mockResolvedValue(fakeDeck as never);
			mockDeckValidator.validate.mockReturnValue(null);

			await emitUpdateDeck(mockPlayer);

			expect(mockDeckValidator.validate).toHaveBeenCalledWith(fakeDeck);
		});

		it("should reject when the deck fails validation (regression test)", async () => {
			const fakeDeck = { allCards: [{ code: 12345 }] };
			const deckError = new NotOfficialCardError(12345);
			mockDeckCreator.build.mockResolvedValue(fakeDeck as never);
			mockDeckValidator.validate.mockReturnValue(deckError);

			await emitUpdateDeck(mockPlayer);

			expect(mockRoom.notReadyUnsafe).toHaveBeenCalled();
			expect(mockPlayer.sendMessageToClient).toHaveBeenCalled();
		});
	});

	describe("when player.isInternal is true (bot player)", () => {
		beforeEach(() => {
			(mockPlayer as unknown as Record<string, unknown>)["isInternal"] = true;
		});

		it("should NOT call the deck validator", async () => {
			const fakeDeck = { allCards: [] };
			mockDeckCreator.build.mockResolvedValue(fakeDeck as never);

			await emitUpdateDeck(mockPlayer);

			expect(mockDeckValidator.validate).not.toHaveBeenCalled();
		});

		it("should accept a deck that would normally fail validation", async () => {
			const fakeDeck = { allCards: [{ code: 12345 }] };
			mockDeckCreator.build.mockResolvedValue(fakeDeck as never);
			mockDeckValidator.validate.mockReturnValue(new NotOfficialCardError(12345));

			await emitUpdateDeck(mockPlayer);

			expect(mockRoom.notReadyUnsafe).not.toHaveBeenCalled();
			expect(mockPlayer.sendMessageToClient).not.toHaveBeenCalled();
			expect(mockRoom.setDecksToPlayerUnsafe).toHaveBeenCalled();
		});

		it("should set the deck via setDecksToPlayerUnsafe", async () => {
			const fakeDeck = { allCards: [] };
			mockDeckCreator.build.mockResolvedValue(fakeDeck as never);

			await emitUpdateDeck(mockPlayer);

			expect(mockRoom.setDecksToPlayerUnsafe).toHaveBeenCalledWith(
				mockPlayer.position,
				fakeDeck,
			);
		});

		it("isInternal check happens before validator — validator never invoked regardless of shouldValidateDeck()", async () => {
			mockRoom.shouldValidateDeck.mockReturnValue(true);
			const fakeDeck = { allCards: [] };
			mockDeckCreator.build.mockResolvedValue(fakeDeck as never);

			await emitUpdateDeck(mockPlayer);

			expect(mockRoom.shouldValidateDeck).not.toHaveBeenCalled();
			expect(mockDeckValidator.validate).not.toHaveBeenCalled();
		});
	});
});

describe("YGOProWaitingState.handleJoin", () => {
	let eventEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockResolver: MockProxy<RankedUserResolver>;
	let mockDeckCreator: jest.Mocked<YGOProDeckCreator>;
	let mockDeckValidator: jest.Mocked<YGOProDeckValidator>;
	let mockRoom: jest.Mocked<YGOProRoom>;
	let mockSocket: jest.Mocked<ISocket>;

	const makeMockRoom = (ranked: boolean): jest.Mocked<YGOProRoom> =>
		({
			mutex: {
				runExclusive: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
			},
			ranked,
			players: [],
			calculatePlaceUnsafe: jest.fn().mockReturnValue({ position: 0, team: 0 }),
			createPlayerUnsafe: jest.fn().mockReturnValue({
				name: "Jaden",
				position: 0,
				team: 0,
			}),
			addPlayerUnsafe: jest.fn(),
			createSpectatorUnsafe: jest.fn().mockReturnValue({ name: "Jaden" }),
			addSpectatorUnsafe: jest.fn(),
			messageSender: {
				errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
			},
		} as unknown as jest.Mocked<YGOProRoom>);

	const makeMockSocket = (resolvedUserId?: string): jest.Mocked<ISocket> =>
		({
			id: "sock-test",
			resolvedUserId,
			remoteAddress: "127.0.0.1",
			closed: false,
			send: jest.fn(),
			destroy: jest.fn(),
			removeAllListeners: jest.fn(),
		} as unknown as jest.Mocked<ISocket>);

	const emitJoin = (
		room: jest.Mocked<YGOProRoom>,
		socket: jest.Mocked<ISocket>,
	): Promise<void> => {
		const message = makeJoinMessage();
		return new Promise((resolve) => {
			setImmediate(() => resolve());
			eventEmitter.emit("JOIN", message, room, socket);
		});
	};

	beforeEach(() => {
		eventEmitter = new EventEmitter();

		mockLogger = {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<Logger>;

		mockResolver = mock<RankedUserResolver>();

		mockDeckCreator = {
			build: jest.fn(),
		} as unknown as jest.Mocked<YGOProDeckCreator>;

		mockDeckValidator = {
			validate: jest.fn().mockReturnValue(null),
		} as unknown as jest.Mocked<YGOProDeckValidator>;

		mockRoom = makeMockRoom(false);
		mockSocket = makeMockSocket();

		new YGOProWaitingState(
			mockResolver,
			eventEmitter,
			mockLogger,
			mockDeckCreator,
			mockDeckValidator,
		);
	});

	describe("ranked room — resolver path", () => {
		it("calls resolver.resolve() when the room is ranked", async () => {
			mockRoom = makeMockRoom(true);
			mockResolver.resolve.mockResolvedValue("user-123");

			await emitJoin(mockRoom, mockSocket);

			expect(mockResolver.resolve).toHaveBeenCalled();
		});

		it("sends JOINERROR and skips player creation when resolver returns null", async () => {
			mockRoom = makeMockRoom(true);
			mockResolver.resolve.mockResolvedValue(null);

			await emitJoin(mockRoom, mockSocket);

			expect(mockSocket.send).toHaveBeenCalled();
			expect(mockRoom.createPlayerUnsafe).not.toHaveBeenCalled();
		});

		it("creates the player with the userId returned by resolver", async () => {
			mockRoom = makeMockRoom(true);
			mockResolver.resolve.mockResolvedValue("resolved-user");

			await emitJoin(mockRoom, mockSocket);

			expect(mockRoom.createPlayerUnsafe).toHaveBeenCalledWith(
				mockSocket,
				expect.any(String), // player name
				"resolved-user",
			);
		});
	});

	describe("unranked room — no resolver call", () => {
		it("does not call resolver.resolve() when the room is not ranked", async () => {
			mockRoom = makeMockRoom(false);

			await emitJoin(mockRoom, mockSocket);

			expect(mockResolver.resolve).not.toHaveBeenCalled();
		});

		it("creates the player with null userId when room is not ranked", async () => {
			mockRoom = makeMockRoom(false);

			await emitJoin(mockRoom, mockSocket);

			expect(mockRoom.createPlayerUnsafe).toHaveBeenCalledWith(
				mockSocket,
				expect.any(String),
				null,
			);
		});
	});
});
