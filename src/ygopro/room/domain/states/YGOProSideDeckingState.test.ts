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
	({ data, previousMessage: Buffer.alloc(0) } as unknown as ClientMessage);

describe("YGOProSideDeckingState.handleUpdateDeck — deck error code is encoded", () => {
	let eventEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockDeckCreator: jest.Mocked<YGOProDeckCreator>;
	let mockDeckValidator: jest.Mocked<YGOProDeckValidator>;
	let mockRoom: jest.Mocked<YGOProRoom>;
	let mockPlayer: jest.Mocked<YGOProClient>;

	const errorMessageMock = () =>
		mockRoom.messageSender.errorMessage as unknown as jest.Mock;

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
			useExtendedCardPool: false,
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
