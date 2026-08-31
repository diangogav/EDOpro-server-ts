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
import { BanListDeckError } from "@shared/deck/domain/errors/BanListDeckError";
import { encodeDeckErrorCode } from "@shared/deck/domain/errors/encodeDeckErrorCode";
import { AdmitToRoom } from "../../admission/application/AdmitToRoom";
import { ISocket } from "@shared/socket/domain/ISocket";
import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";
import { roomCreationNotice } from "@shared/room/domain/chat/RoomCreationNotice";
import { ErrorMessageType } from "ygopro-msg-encode";

import { config } from "../../../../config";

// ---- helpers ----

// mercuryConfig.version = 4962 = 0x1362 → LE bytes: 0x62 0x13
const makeJoinData = (version = 4962): Buffer => {
	const buf = Buffer.alloc(48);
	buf.writeUInt16LE(version, 0);
	return buf;
};

// "Jaden" in UTF-16LE with no password separator (40 bytes)
const PLAYER_INFO_HEX =
	"4a006100640065006e00000000000000000000000000000000000000000000000000000000000000";

const makeJoinMessage = (version?: number): ClientMessage =>
	({
		data: makeJoinData(version),
		previousMessage: Buffer.from(PLAYER_INFO_HEX, "hex"),
	}) as unknown as ClientMessage;

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
	}) as unknown as ClientMessage;

const makeAdmitToRoom = (): { run: jest.Mock } => ({ run: jest.fn() });

const makeLogger = (): jest.Mocked<Logger> =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as unknown as jest.Mocked<Logger>;

describe("YGOProWaitingState.handleUpdateDeck", () => {
	let eventEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockAdmitToRoom: { run: jest.Mock };
	let mockDeckCreator: jest.Mocked<YGOProDeckCreator>;
	let mockDeckValidator: jest.Mocked<YGOProDeckValidator>;
	let mockRoom: jest.Mocked<YGOProRoom>;
	let mockPlayer: jest.Mocked<YGOProClient>;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		mockLogger = makeLogger();
		mockAdmitToRoom = makeAdmitToRoom();

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
			cardPool: "standard",
		} as unknown as jest.Mocked<YGOProRoom>;

		mockPlayer = {
			isSpectator: false,
			isInternal: false,
			position: 0,
			logger: makeLogger(),
			sendMessageToClient: jest.fn(),
		} as unknown as jest.Mocked<YGOProClient>;

		new YGOProWaitingState(
			mockAdmitToRoom as unknown as AdmitToRoom,
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

			expect(mockRoom.setDecksToPlayerUnsafe).toHaveBeenCalledWith(mockPlayer.position, fakeDeck);
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

	describe("deck error code is encoded (DeckErrorType in high 4 bits)", () => {
		const errorMessageMock = () => mockRoom.messageSender.errorMessage as unknown as jest.Mock;

		it("sends DECKERROR with the encoded code when build returns a DeckError", async () => {
			const deckError = new BanListDeckError(12345); // type=CARD_BANLISTED(1), code=12345
			mockDeckCreator.build.mockResolvedValue(deckError as never);

			await emitUpdateDeck(mockPlayer);

			expect(errorMessageMock()).toHaveBeenCalledWith(
				ErrorMessageType.DECKERROR,
				encodeDeckErrorCode(deckError.type, deckError.code),
			);
			// Must NOT be the old bug (raw unshifted type)
			expect(errorMessageMock()).not.toHaveBeenCalledWith(
				ErrorMessageType.DECKERROR,
				deckError.type,
			);
		});

		it("sends DECKERROR with the encoded code when validation fails", async () => {
			const fakeDeck = { allCards: [{ code: 12345 }] };
			const deckError = new NotOfficialCardError(12345); // type=CARD_UNOFFICIAL(0xa), code=12345
			mockDeckCreator.build.mockResolvedValue(fakeDeck as never);
			mockDeckValidator.validate.mockReturnValue(deckError);

			await emitUpdateDeck(mockPlayer);

			expect(errorMessageMock()).toHaveBeenCalledWith(
				ErrorMessageType.DECKERROR,
				encodeDeckErrorCode(deckError.type, deckError.code),
			);
		});
	});
});

describe("YGOProWaitingState.handleJoin", () => {
	let eventEmitter: EventEmitter;
	let mockLogger: jest.Mocked<Logger>;
	let mockAdmitToRoom: { run: jest.Mock };
	let mockDeckCreator: jest.Mocked<YGOProDeckCreator>;
	let mockDeckValidator: jest.Mocked<YGOProDeckValidator>;
	let mockRoom: jest.Mocked<YGOProRoom>;
	let mockSocket: jest.Mocked<ISocket>;
	let admissionTarget: object;

	const makeMockRoom = (): jest.Mocked<YGOProRoom> =>
		({
			ranked: false,
			players: [],
			league: RoomLeague.Casual,
			createdBySocketId: "sock-test",
			mutex: {
				runExclusive: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
			},
			admissionTarget: jest.fn().mockReturnValue(admissionTarget),
			reservationAdmits: jest.fn().mockReturnValue(true),
			rejectReservedJoin: jest.fn(),
			messageSender: {
				errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
			},
		}) as unknown as jest.Mocked<YGOProRoom>;

	const makeMockSocket = (): jest.Mocked<ISocket> =>
		({
			id: "sock-test",
			remoteAddress: "127.0.0.1",
			closed: false,
			send: jest.fn(),
			close: jest.fn(),
			destroy: jest.fn(),
			removeAllListeners: jest.fn(),
		}) as unknown as jest.Mocked<ISocket>;

	const emitJoin = (
		room: jest.Mocked<YGOProRoom>,
		socket: jest.Mocked<ISocket>,
		version?: number,
	): Promise<void> => {
		const message = makeJoinMessage(version);
		return new Promise((resolve) => {
			setImmediate(() => resolve());
			eventEmitter.emit("JOIN", message, room, socket);
		});
	};

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		mockLogger = makeLogger();
		mockAdmitToRoom = makeAdmitToRoom();
		admissionTarget = { league: "casual" };

		mockDeckCreator = {
			build: jest.fn(),
		} as unknown as jest.Mocked<YGOProDeckCreator>;

		mockDeckValidator = {
			validate: jest.fn().mockReturnValue(null),
		} as unknown as jest.Mocked<YGOProDeckValidator>;

		mockRoom = makeMockRoom();
		mockSocket = makeMockSocket();

		new YGOProWaitingState(
			mockAdmitToRoom as unknown as AdmitToRoom,
			eventEmitter,
			mockLogger,
			mockDeckCreator,
			mockDeckValidator,
		);
	});

	it("delegates the join to AdmitToRoom with the room's admission target", async () => {
		await emitJoin(mockRoom, mockSocket);

		expect(mockRoom.admissionTarget).toHaveBeenCalledWith(mockSocket, expect.anything());
		expect(mockAdmitToRoom.run).toHaveBeenCalledWith(
			mockSocket,
			expect.anything(),
			admissionTarget,
		);
	});

	describe("seat reservation", () => {
		it("asks the room whether the reservation admits the joining socket", async () => {
			await emitJoin(mockRoom, mockSocket);

			expect(mockRoom.reservationAdmits).toHaveBeenCalledWith(mockSocket);
		});

		it("rejects a joiner the reservation does not admit, without delegating to AdmitToRoom", async () => {
			(mockRoom.reservationAdmits as jest.Mock).mockReturnValue(false);

			await emitJoin(mockRoom, mockSocket);

			expect(mockRoom.rejectReservedJoin).toHaveBeenCalledWith(mockSocket);
			expect(mockAdmitToRoom.run).not.toHaveBeenCalled();
			expect(mockRoom.admissionTarget).not.toHaveBeenCalled();
		});

		// The gate runs BEFORE any admission work. A watch stamp for THIS room
		// is admitted (stands only); a stamp for another room is inert, so a
		// watch-intent joiner the gate does not admit is rejected like any
		// other third party.
		it("rejects a watch-intent joiner the reservation does not admit (a foreign stamp never bypasses the gate)", async () => {
			(mockRoom.reservationAdmits as jest.Mock).mockReturnValue(false);
			(mockSocket as { watchForRoomId?: number }).watchForRoomId = 99;

			await emitJoin(mockRoom, mockSocket);

			expect(mockRoom.rejectReservedJoin).toHaveBeenCalledWith(mockSocket);
			expect(mockAdmitToRoom.run).not.toHaveBeenCalled();
			expect(mockRoom.admissionTarget).not.toHaveBeenCalled();
		});

		it("still delegates an admitted joiner to AdmitToRoom (ordinary rooms unaffected)", async () => {
			await emitJoin(mockRoom, mockSocket);

			expect(mockRoom.rejectReservedJoin).not.toHaveBeenCalled();
			expect(mockAdmitToRoom.run).toHaveBeenCalled();
		});
	});

	it("rejects a duplicate name without delegating to AdmitToRoom", async () => {
		mockRoom = makeMockRoom();
		(mockRoom as unknown as { players: unknown[] }).players = [
			{ name: "Jaden", socket: { remoteAddress: "127.0.0.1", closed: true } },
		];

		await emitJoin(mockRoom, mockSocket);

		expect(mockAdmitToRoom.run).not.toHaveBeenCalled();
		expect(mockSocket.send).toHaveBeenCalled();
	});

	// Regression: the duplicate-name path used to reuse the EDOPro-flavoured
	// RoomState.sendExistingPlayerErrorMessage, which writes an EDOPro-packed
	// STOC_ERROR_MSG (2-byte size = 6) plus a 0xF3 frame the classic ygopro
	// client does not know. ygopro drops STOC_ERROR_MSG when
	// `len < 1 + sizeof(STOC_ErrorMsg)` (9 with struct alignment), so the joiner
	// never saw the error and sat on the connecting screen. It must use the
	// ygopro encoder (YGOProMessageRepository.errorMessage -> 9-byte frame).
	it("sends the ygopro-encoded JOINERROR frame, not the EDOPro-packed one", async () => {
		mockRoom = makeMockRoom();
		(mockRoom as unknown as { players: unknown[] }).players = [
			{ name: "Jaden", socket: { remoteAddress: "127.0.0.1", closed: true } },
		];

		await emitJoin(mockRoom, mockSocket);

		expect(mockRoom.messageSender.errorMessage).toHaveBeenCalledWith(ErrorMessageType.JOINERROR, 0);
		// The EDOPro-packed frame (size 6) must never reach a ygopro client.
		const edoproPacked = Buffer.from("060002010000000", "hex");
		for (const [buf] of (mockSocket.send as jest.Mock).mock.calls as [Buffer][]) {
			expect(buf.equals(edoproPacked)).toBe(false);
			expect(buf[2]).not.toBe(0xf3);
		}
	});

	// close() (not destroy()): destroy() tears the socket down abruptly and can
	// drop the queued JOINERROR frame. Same invariant as SocketCloseOnError.test.ts.
	it("closes the socket gracefully after the error frames", async () => {
		mockRoom = makeMockRoom();
		(mockRoom as unknown as { players: unknown[] }).players = [
			{ name: "Jaden", socket: { remoteAddress: "127.0.0.1", closed: true } },
		];

		await emitJoin(mockRoom, mockSocket);

		expect(mockSocket.close).toHaveBeenCalled();
		expect(mockSocket.destroy).not.toHaveBeenCalled();
	});

	// Regression: the version check used to live in the EDOPro RoomState base and
	// `throw`. handleJoin is async and the "JOIN" listener voids its promise, so the
	// throw became an unhandled rejection that Node routes to the global
	// uncaughtException hook (src/shared/error-handler/error-handler.ts) — a routine
	// client-version mismatch logged as "Excepción no capturada" — AND the rejected
	// socket was left open, since nothing after the throw ever ran.
	describe("version mismatch", () => {
		const WRONG_VERSION = 4961;

		it("rejects without delegating to AdmitToRoom", async () => {
			await emitJoin(mockRoom, mockSocket, WRONG_VERSION);

			expect(mockAdmitToRoom.run).not.toHaveBeenCalled();
			expect(mockRoom.admissionTarget).not.toHaveBeenCalled();
		});

		it("sends VERERROR carrying the server version and closes the socket", async () => {
			await emitJoin(mockRoom, mockSocket, WRONG_VERSION);

			expect(mockRoom.messageSender.errorMessage).toHaveBeenCalledWith(
				ErrorMessageType.VERERROR,
				4962,
			);
			expect(mockSocket.close).toHaveBeenCalled();
			expect(mockSocket.destroy).not.toHaveBeenCalled();
		});

		it("does not leak an unhandled rejection", async () => {
			const rejections: unknown[] = [];
			const onRejection = (reason: unknown): void => {
				rejections.push(reason);
			};
			process.on("unhandledRejection", onRejection);
			try {
				await emitJoin(mockRoom, mockSocket, WRONG_VERSION);
				// unhandledRejection fires on a later microtask/tick than the void'ed call
				await new Promise((resolve) => setImmediate(resolve));
			} finally {
				process.off("unhandledRejection", onRejection);
			}

			expect(rejections).toEqual([]);
		});

		it("still admits a client on the matching version", async () => {
			await emitJoin(mockRoom, mockSocket);

			expect(mockAdmitToRoom.run).toHaveBeenCalled();
			expect(mockSocket.close).not.toHaveBeenCalled();
		});
	});

	// The edopro pipeline sends this via GameCreatorHandler right after room
	// creation; the ygopro/Mercury pipeline creates the room inside the JOIN
	// flow and only seats the creator once admission succeeds here, so this
	// is the one place that path can send it.
	describe("room creation notice", () => {
		const originalRankingEnabled = config.ranking.enabled;

		afterEach(() => {
			config.ranking.enabled = originalRankingEnabled;
		});

		it("sends the creator's room-creation notice once they are seated as the first player", async () => {
			config.ranking.enabled = true;
			(mockRoom as unknown as { league: RoomLeague }).league = RoomLeague.External;
			(mockRoom as unknown as { players: unknown[] }).players = [{}];
			mockAdmitToRoom.run.mockResolvedValue({
				kind: "player",
				credential: { kind: "external", userId: "u" } as PlayerCredential,
				seat: { position: 0, team: 0 },
			});

			await emitJoin(mockRoom, mockSocket);

			expect(mockSocket.send).toHaveBeenCalledWith(
				roomCreationNotice({ ranked: true, rankingEnabled: true }),
			);
		});

		it("does not send the notice when a second player is seated", async () => {
			config.ranking.enabled = true;
			(mockRoom as unknown as { league: RoomLeague }).league = RoomLeague.Casual;
			(mockRoom as unknown as { createdBySocketId: string }).createdBySocketId = "creator-socket";
			(mockRoom as unknown as { players: unknown[] }).players = [{}, {}];
			mockAdmitToRoom.run.mockResolvedValue({
				kind: "player",
				credential: { kind: "guest", name: "Jaden" } as PlayerCredential,
				seat: { position: 1, team: 0 },
			});

			await emitJoin(mockRoom, mockSocket);

			expect(mockSocket.send).not.toHaveBeenCalled();
		});

		it("does not send the notice when the creator's socket is only admitted as a spectator", async () => {
			mockAdmitToRoom.run.mockResolvedValue({ kind: "spectator" });

			await emitJoin(mockRoom, mockSocket);

			expect(mockSocket.send).not.toHaveBeenCalled();
		});

		it("does not send the notice when admission rejects the creator's socket", async () => {
			mockAdmitToRoom.run.mockResolvedValue({
				kind: "rejected",
				reason: "ranked-requires-account",
			});

			await emitJoin(mockRoom, mockSocket);

			expect(mockSocket.send).not.toHaveBeenCalled();
		});
	});
});

describe("YGOProWaitingState.handleToDuel (spectator -> player)", () => {
	let eventEmitter: EventEmitter;

	const makeRoom = (league: RoomLeague): jest.Mocked<YGOProRoom> =>
		({
			league,
			mutex: {
				runExclusive: jest.fn().mockImplementation((fn: () => void) => fn()),
			},
			// Default true = a room without reservations (ordinary rooms permit
			// every promotion, exactly as before the reservation seat gate).
			reservationPermitsSeat: jest.fn().mockReturnValue(true),
			spectatorToPlayerUnsafe: jest.fn(),
			movePlayerToAnotherCellUnsafe: jest.fn(),
		}) as unknown as jest.Mocked<YGOProRoom>;

	const makeSpectator = (credential: PlayerCredential | null): jest.Mocked<YGOProClient> =>
		({
			isSpectator: true,
			credential,
			name: "X",
			socket: { id: "spectator-socket" },
			logger: makeLogger(),
		}) as unknown as jest.Mocked<YGOProClient>;

	const emitToDuel = (
		room: jest.Mocked<YGOProRoom>,
		player: jest.Mocked<YGOProClient>,
	): Promise<void> =>
		new Promise((resolve) => {
			setImmediate(() => resolve());
			eventEmitter.emit(
				Commands.TO_DUEL as unknown as string,
				makeClientMessage(Buffer.alloc(0)),
				room,
				player,
			);
		});

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		new YGOProWaitingState(
			makeAdmitToRoom() as unknown as AdmitToRoom,
			eventEmitter,
			makeLogger(),
			{ build: jest.fn() } as unknown as YGOProDeckCreator,
			{ validate: jest.fn() } as unknown as YGOProDeckValidator,
		);
	});

	it("does NOT seat a wrong-league spectator (external in a Verified room)", async () => {
		const room = makeRoom(RoomLeague.Verified);
		const spectator = makeSpectator({ kind: "external", userId: "u" });

		await emitToDuel(room, spectator);

		expect(room.spectatorToPlayerUnsafe).not.toHaveBeenCalled();
	});

	it("seats a matching-league spectator (verified in a Verified room)", async () => {
		const room = makeRoom(RoomLeague.Verified);
		const spectator = makeSpectator({ kind: "verified", userId: "u" });

		await emitToDuel(room, spectator);

		expect(room.spectatorToPlayerUnsafe).toHaveBeenCalledWith(spectator);
	});

	it("seats anyone in a casual room", async () => {
		const room = makeRoom(RoomLeague.Casual);
		const spectator = makeSpectator({ kind: "guest", name: "X" });

		await emitToDuel(room, spectator);

		expect(room.spectatorToPlayerUnsafe).toHaveBeenCalledWith(spectator);
	});

	// Reserved rooms admit watch spectators through the JOIN door, so the
	// promotion door needs its own gate: only a reserved identity may leave the
	// stands. The state must consult the room's SEAT-taking reservation check
	// (reservationPermitsSeat) with the spectator's socket — never the
	// watch-permitting JOIN gate — or a watcher could TO_DUEL into a reserved
	// seat during the pre-duel window.
	describe("reserved rooms", () => {
		it("does NOT seat a spectator the reservation denies (watch spectator in a reserved room)", async () => {
			const room = makeRoom(RoomLeague.Verified);
			(room.reservationPermitsSeat as jest.Mock).mockReturnValue(false);
			const spectator = makeSpectator({ kind: "verified", userId: "u-watcher" });

			await emitToDuel(room, spectator);

			expect(room.spectatorToPlayerUnsafe).not.toHaveBeenCalled();
		});

		it("consults the seat-taking reservation check with the spectator's socket", async () => {
			const room = makeRoom(RoomLeague.Verified);
			(room.reservationPermitsSeat as jest.Mock).mockReturnValue(false);
			const spectator = makeSpectator({ kind: "verified", userId: "u-watcher" });

			await emitToDuel(room, spectator);

			expect(room.reservationPermitsSeat).toHaveBeenCalledWith(spectator.socket);
		});

		it("still seats a spectator the reservation permits (reserved player)", async () => {
			const room = makeRoom(RoomLeague.Verified);
			(room.reservationPermitsSeat as jest.Mock).mockReturnValue(true);
			const spectator = makeSpectator({ kind: "verified", userId: "u-a" });

			await emitToDuel(room, spectator);

			expect(room.spectatorToPlayerUnsafe).toHaveBeenCalledWith(spectator);
		});
	});
});
