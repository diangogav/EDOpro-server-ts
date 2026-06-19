import { EventEmitter } from "stream";
import { Logger } from "@shared/logger/domain/Logger";
import { Reconnect } from "@edopro/room/application/Reconnect";
import { JoinToDuelAsSpectator } from "@edopro/room/application/JoinToDuelAsSpectator";
import { DeckCreator } from "@edopro/deck/application/DeckCreator";
import { SideDeckingState } from "./SideDeckingState";
import { Room } from "@edopro/room/domain/Room";
import { Client } from "@edopro/client/domain/Client";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { UpdateDeckMessageParser } from "@edopro/deck/application/UpdateDeckMessageSizeCalculator";
import { ISocket } from "@shared/socket/domain/ISocket";
import { Commands } from "@shared/messages/Commands";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { findReconnectingPlayer } from "@shared/room/domain/findReconnectingPlayer";

// Mocks
jest.mock("@shared/logger/domain/Logger");
jest.mock("@edopro/room/application/Reconnect");
jest.mock("@edopro/room/application/JoinToDuelAsSpectator");
jest.mock("@edopro/deck/application/DeckCreator");
jest.mock("@edopro/room/domain/Room");
jest.mock("@edopro/client/domain/Client");
jest.mock("@edopro/deck/application/UpdateDeckMessageSizeCalculator");
jest.mock("@shared/room/domain/findReconnectingPlayer");

describe("SideDeckingState", () => {
	let state: SideDeckingState;
	let mockEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockReconnect: jest.Mocked<Reconnect>;
	let mockJoinToDuelAsSpectator: jest.Mocked<JoinToDuelAsSpectator>;
	let mockDeckCreator: jest.Mocked<DeckCreator>;
	let mockRoom: jest.Mocked<Room>;
	let mockClient: jest.Mocked<Client>;
	let mockSocket: jest.Mocked<ISocket>;

	beforeEach(() => {
		mockEmitter = new EventEmitter();
		mockLogger = {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<Logger>;

		mockReconnect = {
			run: jest.fn(),
		} as unknown as jest.Mocked<Reconnect>;

		mockJoinToDuelAsSpectator = {
			run: jest.fn(),
		} as unknown as jest.Mocked<JoinToDuelAsSpectator>;

		mockDeckCreator = {
			build: jest.fn(),
		} as unknown as jest.Mocked<DeckCreator>;

		mockSocket = {
			send: jest.fn(),
		} as unknown as jest.Mocked<ISocket>;

		mockClient = new Client({} as any) as jest.Mocked<Client>;
		Object.assign(mockClient, {
			logger: mockLogger,
			sendMessage: jest.fn(),
			deck: {
				isSideDeckValid: jest.fn().mockReturnValue(true),
			},
			position: 0,
			isReady: false,
			ready: jest.fn(),
			notReady: jest.fn(),
			isReconnecting: false,
			clearReconnecting: jest.fn(),
			socket: mockSocket,
		});

		mockRoom = {
			players: [mockClient],
			spectators: [],
			banListHash: 123,
			setDecksToPlayer: jest.fn(),
			choosingOrder: jest.fn(),
			clientWhoChoosesTurn: { socket: mockSocket },
		} as unknown as jest.Mocked<Room>;

		state = new SideDeckingState(
			mockEmitter,
			mockLogger,
			mockReconnect,
			mockJoinToDuelAsSpectator,
			mockDeckCreator,
		);
	});

	it("should handle UPDATE_DECK command (valid deck)", async () => {
		const message = { data: Buffer.alloc(10) } as ClientMessage;
		const mockParser = {
			getDeck: jest.fn().mockReturnValue([[1], [2]]),
		};
		(UpdateDeckMessageParser as jest.Mock).mockReturnValue(mockParser);
		mockDeckCreator.build.mockResolvedValue({
			validate: jest.fn().mockReturnValue(null),
		} as any);

		mockEmitter.emit(Commands.UPDATE_DECK as unknown as string, message, mockRoom, mockClient);
		await new Promise(process.nextTick);

		expect(mockDeckCreator.build).toHaveBeenCalled();
		expect(mockRoom.setDecksToPlayer).toHaveBeenCalled();
		expect(mockClient.sendMessage).toHaveBeenCalled(); // DuelStartClientMessage
		expect(mockClient.ready).toHaveBeenCalled();
	});

	it("should handle UPDATE_DECK command (invalid side deck)", async () => {
		const message = { data: Buffer.alloc(10) } as ClientMessage;
		const mockParser = {
			getDeck: jest.fn().mockReturnValue([[1], [2]]),
		};
		(UpdateDeckMessageParser as jest.Mock).mockReturnValue(mockParser);
		(mockClient.deck.isSideDeckValid as jest.Mock).mockReturnValue(false);

		mockEmitter.emit(Commands.UPDATE_DECK as unknown as string, message, mockRoom, mockClient);
		await new Promise(process.nextTick);

		expect(mockClient.sendMessage).toHaveBeenCalled(); // ErrorMessage
		expect(mockDeckCreator.build).not.toHaveBeenCalled();
	});

	it("should handle UPDATE_DECK command (reconnecting)", async () => {
		const message = { data: Buffer.alloc(10) } as ClientMessage;
		const mockParser = {
			getDeck: jest.fn().mockReturnValue([[1], [2]]),
		};
		(UpdateDeckMessageParser as jest.Mock).mockReturnValue(mockParser);
		mockDeckCreator.build.mockResolvedValue({
			validate: jest.fn().mockReturnValue(null),
		} as any);
		Object.defineProperty(mockClient, "isReconnecting", { value: true });

		mockEmitter.emit(Commands.UPDATE_DECK as unknown as string, message, mockRoom, mockClient);
		await new Promise(process.nextTick);

		expect(mockClient.notReady).toHaveBeenCalled();
		expect(mockClient.clearReconnecting).toHaveBeenCalled();
	});

	it("should start duel when all clients ready", async () => {
		const message = { data: Buffer.alloc(10) } as ClientMessage;
		const mockParser = {
			getDeck: jest.fn().mockReturnValue([[1], [2]]),
		};
		(UpdateDeckMessageParser as jest.Mock).mockReturnValue(mockParser);
		mockDeckCreator.build.mockResolvedValue({
			validate: jest.fn().mockReturnValue(null),
		} as any);
		Object.defineProperty(mockClient, "isReady", { value: true }); // Assume this update happens after ready() call

		// We need to simulate ready state change.
		// The `isReady` getter on mockClient should return true when checked in `startDuel`.
		// But `ready()` is called inside `handleUpdateDeck`.
		// Let's make `isReady` return true.

		mockEmitter.emit(Commands.UPDATE_DECK as unknown as string, message, mockRoom, mockClient);
		await new Promise(process.nextTick);

		expect(mockRoom.choosingOrder).toHaveBeenCalled();
	});

	it("should handle JOIN command (reconnecting)", async () => {
		const message = {
			data: Buffer.alloc(50), // JoinGameMessage size
			previousMessage: Buffer.alloc(40), // PlayerInfoMessage size
		} as ClientMessage;

		// A reconnecting player is one that findReconnectingPlayer resolves to a Client.
		(findReconnectingPlayer as jest.Mock).mockReturnValue(mockClient);

		mockEmitter.emit("JOIN", message, mockRoom, mockSocket);
		await new Promise(process.nextTick);

		expect(mockReconnect.run).toHaveBeenCalled();
	});

	it("should handle JOIN command (spectator)", async () => {
		const message = {
			data: Buffer.alloc(50),
			previousMessage: Buffer.alloc(40),
		} as ClientMessage;

		(findReconnectingPlayer as jest.Mock).mockReturnValue(null);

		mockEmitter.emit("JOIN", message, mockRoom, mockSocket);
		await new Promise(process.nextTick);

		expect(mockJoinToDuelAsSpectator.run).toHaveBeenCalled();
	});

	// ---------------------------------------------------------------------------
	// Characterization of the token-based express reconnect flow. Pins the CURRENT
	// observable behavior before the shared reconnect layer is extracted.
	// ---------------------------------------------------------------------------
	describe("EXPRESS_RECONNECT (characterization)", () => {
		const SUCCESS_ACK = Buffer.from([0x02, 0x00, 0xfd, 0x00]);
		const FAILURE_ACK = Buffer.from([0x02, 0x00, 0xfd, 0x01]);

		beforeEach(() => {
			TokenIndex.getInstance().clear();
			(mockRoom as any).id = 1;
			Object.assign(mockClient, {
				setSocket: jest.fn(),
				reconnecting: jest.fn(),
				setReconnectionToken: jest.fn(),
				reconnectionToken: "old",
			});
		});

		afterEach(() => {
			TokenIndex.getInstance().clear();
		});

		it("valid token: success ack + setSocket + token rotated", () => {
			TokenIndex.getInstance().register("old", mockClient, 1);
			const message = { data: Buffer.from("old", "utf8") } as ClientMessage;

			mockEmitter.emit("EXPRESS_RECONNECT", message, mockRoom, mockSocket);

			expect(mockSocket.send).toHaveBeenCalledWith(SUCCESS_ACK);
			expect(mockClient.setSocket).toHaveBeenCalled();
			expect(mockClient.sendMessage).toHaveBeenCalled(); // DuelStart + SideDeck
			expect(TokenIndex.getInstance().find("old")).toBeUndefined();
			expect(mockClient.setReconnectionToken).toHaveBeenCalledWith(
				expect.stringMatching(/^[0-9a-f]{32}$/),
			);
		});

		it("unknown token: failure ack + socket destroyed", () => {
			const failSocket = {
				send: jest.fn(),
				destroy: jest.fn(),
			} as unknown as jest.Mocked<ISocket>;
			const message = { data: Buffer.from("ghost", "utf8") } as ClientMessage;

			mockEmitter.emit("EXPRESS_RECONNECT", message, mockRoom, failSocket);

			expect(failSocket.send).toHaveBeenCalledWith(FAILURE_ACK);
			expect(failSocket.destroy).toHaveBeenCalled();
		});
	});
});
