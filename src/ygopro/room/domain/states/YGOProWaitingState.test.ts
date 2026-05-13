import { EventEmitter } from "stream";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";

import { YGOProClient } from "../../../client/domain/YGOProClient";
import { YGOProRoom } from "../YGOProRoom";
import { YGOProWaitingState } from "./YGOProWaitingState";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { NotOfficialCardError } from "@shared/deck/domain/errors/NotOfficialCardError";
import { UserAuth } from "@shared/user-auth/application/UserAuth";

describe("YGOProWaitingState.handleUpdateDeck", () => {
	let eventEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockUserAuth: jest.Mocked<UserAuth>;
	let mockDeckCreator: jest.Mocked<YGOProDeckCreator>;
	let mockDeckValidator: jest.Mocked<YGOProDeckValidator>;
	let mockRoom: jest.Mocked<YGOProRoom>;
	let mockPlayer: jest.Mocked<YGOProClient>;

	const makeDeckPayload = (): Buffer => {
		// Minimal valid YGOProCtosUpdateDeck payload (2 cards main, 0 side)
		// Format: main_count (u32le) + side_count (u32le) + card codes (u32le each)
		const main = [0x00000001, 0x00000002];
		const side: number[] = [];
		const buf = Buffer.alloc(4 + 4 + (main.length + side.length) * 4);
		let offset = 0;
		buf.writeUInt32LE(main.length, offset); offset += 4;
		buf.writeUInt32LE(side.length, offset); offset += 4;
		for (const code of [...main, ...side]) {
			buf.writeUInt32LE(code, offset); offset += 4;
		}
		return buf;
	};

	const makeClientMessage = (data: Buffer): ClientMessage => ({
		data,
		previousMessage: Buffer.alloc(0),
	} as unknown as ClientMessage);

	beforeEach(() => {
		eventEmitter = new EventEmitter();

		mockLogger = {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<Logger>;

		mockUserAuth = {} as unknown as jest.Mocked<UserAuth>;

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
			mockUserAuth,
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
			// validator WOULD return an error — but it must not be called
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
			// Even if shouldValidateDeck returns true, validator must not run for internal clients
			mockRoom.shouldValidateDeck.mockReturnValue(true);
			const fakeDeck = { allCards: [] };
			mockDeckCreator.build.mockResolvedValue(fakeDeck as never);

			await emitUpdateDeck(mockPlayer);

			expect(mockRoom.shouldValidateDeck).not.toHaveBeenCalled();
			expect(mockDeckValidator.validate).not.toHaveBeenCalled();
		});
	});
});
