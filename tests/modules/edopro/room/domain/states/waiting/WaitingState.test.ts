import { EventEmitter } from "stream";
import { Logger } from "../../../../../../../src/shared/logger/domain/Logger";
import { UserAuth } from "../../../../../../../src/shared/user-auth/application/UserAuth";
import { DeckCreator } from "../../../../../../../src/edopro/deck/application/DeckCreator";
import { WaitingState } from "../../../../../../../src/edopro/room/domain/states/waiting/WaitingState";
import { Room } from "../../../../../../../src/edopro/room/domain/Room";
import { Client } from "../../../../../../../src/edopro/client/domain/Client";
import { Commands } from "../../../../../../../src/edopro/messages/domain/Commands";
import { ISocket } from "../../../../../../../src/shared/socket/domain/ISocket";
import { ClientMessage } from "../../../../../../../src/edopro/messages/MessageProcessor";
import { DuelStartClientMessage } from "../../../../../../../src/shared/messages/server-to-client/DuelStartClientMessage";

jest.mock("../../../../../../../src/shared/logger/domain/Logger");
jest.mock("../../../../../../../src/shared/user-auth/application/UserAuth");
jest.mock("../../../../../../../src/edopro/deck/application/DeckCreator");
jest.mock("../../../../../../../src/edopro/room/domain/Room");
jest.mock("../../../../../../../src/edopro/client/domain/Client");
jest.mock(
  "../../../../../../../src/shared/messages/server-to-client/DuelStartClientMessage",
);

describe("WaitingState", () => {
  let state: WaitingState;
  let mockEmitter: EventEmitter;
  let mockLogger: jest.Mocked<Logger>;
  let mockUserAuth: jest.Mocked<UserAuth>;
  let mockDeckCreator: jest.Mocked<DeckCreator>;
  let mockRoom: jest.Mocked<Room>;
  let mockClient: jest.Mocked<Client>;
  let mockSocket: jest.Mocked<ISocket>;

  beforeEach(() => {
    mockEmitter = new EventEmitter();
    mockLogger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    mockUserAuth = {} as unknown as jest.Mocked<UserAuth>;
    mockDeckCreator = {
      build: jest.fn(),
    } as unknown as jest.Mocked<DeckCreator>;

    mockSocket = {
      send: jest.fn(),
      remoteAddress: "127.0.0.1",
    } as unknown as jest.Mocked<ISocket>;

    mockRoom = {
      mutex: {
        runExclusive: jest.fn((cb) => cb()),
      },
      clients: [],
      spectators: [],
      addKick: jest.fn(),
      playerToSpectatorUnsafe: jest.fn(),
      spectatorToPlayerUnsafe: jest.fn(),
      movePlayerToAnotherCellUnsafe: jest.fn(),
      allPlayersReady: false,
      readyUnsafe: jest.fn(),
      notReadyUnsafe: jest.fn(),
      createMatchUnsafe: jest.fn(),
      rpsUnsafe: jest.fn(),
      setDecksToPlayerUnsafe: jest.fn(),
      banListHash: 123,
      kick: [],
      addPlayerUnsafe: jest.fn(),
      addSpectatorUnsafe: jest.fn(),
      notifyToAllLobbyClients: jest.fn(),
      sendSpectatorCount: jest.fn(),
      deckRules: {
        rule: 0,
        mainMin: 40,
        mainMax: 60,
        extraMin: 0,
        extraMax: 15,
        sideMin: 0,
        sideMax: 15,
        maxDeckPoints: 100,
      },
    } as unknown as jest.Mocked<Room>;

    mockClient = new Client({} as any) as jest.Mocked<Client>;
    Object.assign(mockClient, {
      logger: mockLogger,
      sendMessage: jest.fn(),
      isSpectator: false,
      host: false,
      name: "TestPlayer",
      socket: { remoteAddress: "127.0.0.1" },
      isUpdatingDeck: false,
      saveReadyCommand: jest.fn(),
      updatingDeck: jest.fn(),
      deckUpdated: jest.fn(),
      haveReadyCommand: false,
      clearReadyCommand: jest.fn(),
    });

    state = new WaitingState(
      mockEmitter,
      mockLogger,
      mockUserAuth,
      mockDeckCreator,
    );
  });

  it("should handle KICK command", () => {
    const kickPos = 1;
    const message = {
      data: Buffer.from([kickPos]),
    } as ClientMessage;

    const kickedClient = new Client({} as any) as jest.Mocked<Client>;
    Object.assign(kickedClient, {
      ...mockClient,
      position: kickPos,
      isSpectator: false,
      host: false,
      name: "Kicked",
    });

    Object.defineProperty(mockRoom, "clients", { value: [kickedClient] });

    mockEmitter.emit(
      Commands.KICK as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockRoom.playerToSpectatorUnsafe).toHaveBeenCalledWith(kickedClient);
    expect(mockRoom.addKick).toHaveBeenCalledWith(kickedClient);
    expect(kickedClient.sendMessage).toHaveBeenCalled(); // Banned message
  });

  it("should handle TO_DUEL command (spectator to player)", () => {
    const message = {} as ClientMessage;
    Object.defineProperty(mockClient, "isSpectator", { value: true });

    mockEmitter.emit(
      Commands.TO_DUEL as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockRoom.spectatorToPlayerUnsafe).toHaveBeenCalledWith(mockClient);
  });

  it("should handle TO_DUEL command (move cell)", () => {
    const message = {} as ClientMessage;
    Object.defineProperty(mockClient, "isSpectator", { value: false });

    mockEmitter.emit(
      Commands.TO_DUEL as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockRoom.movePlayerToAnotherCellUnsafe).toHaveBeenCalledWith(
      mockClient,
    );
  });

  it("should handle READY command", () => {
    const message = {} as ClientMessage;

    mockEmitter.emit(
      Commands.READY as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockRoom.readyUnsafe).toHaveBeenCalledWith(mockClient);
  });

  it("should handle READY command while updating deck", () => {
    const message = {} as ClientMessage;
    Object.defineProperty(mockClient, "isUpdatingDeck", { value: true });

    mockEmitter.emit(
      Commands.READY as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockClient.saveReadyCommand).toHaveBeenCalledWith(message);
    expect(mockRoom.readyUnsafe).not.toHaveBeenCalled();
  });

  it("should handle NOT_READY command", () => {
    const message = {} as ClientMessage;

    mockEmitter.emit(
      Commands.NOT_READY as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockRoom.notReadyUnsafe).toHaveBeenCalledWith(mockClient);
  });

  it("should handle OBSERVER command", () => {
    const message = {} as ClientMessage;
    Object.defineProperty(mockClient, "isSpectator", { value: false });
    Object.defineProperty(mockClient, "host", { value: false });

    mockEmitter.emit(
      Commands.OBSERVER as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockRoom.playerToSpectatorUnsafe).toHaveBeenCalledWith(mockClient);
  });

  it("should handle TRY_START command", () => {
    const message = {} as ClientMessage;
    Object.defineProperty(mockRoom, "allPlayersReady", { value: true });

    // Setup clients for teams
    const t0 = new Client({} as any) as jest.Mocked<Client>;
    Object.assign(t0, { ...mockClient, team: 0, position: 0 });

    const t1 = new Client({} as any) as jest.Mocked<Client>;
    Object.assign(t1, { ...mockClient, team: 1, position: 1 });

    Object.defineProperty(mockRoom, "clients", { value: [t0, t1] });

    mockEmitter.emit(
      Commands.TRY_START as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockRoom.createMatchUnsafe).toHaveBeenCalled();
    expect(mockRoom.rpsUnsafe).toHaveBeenCalled();
    expect(t0.sendMessage).toHaveBeenCalled(); // DuelStart, RPSChoose
  });

  it("should handle UPDATE_DECK command", async () => {
    const message = {
      data: Buffer.alloc(10), // Mock data
    } as ClientMessage;

    // Mock deck creator response
    const mockDeck = {
      validate: jest.fn().mockReturnValue(null),
    };
    mockDeckCreator.build.mockResolvedValue(mockDeck as any);

    // We need to wait for the async handler
    const handlerPromise = new Promise<void>((resolve) => {
      // We can't easily hook into the void return of the event handler.
      // But since we are calling emit, it runs synchronously or we can await if it returns promise?
      // The event emitter listener is: (message, room, client) => void this.handleUpdateDeck.bind(this)(...)
      // It returns void, so we can't await it directly via emit.
      // However, since handleUpdateDeck is async, we can mock it? No we are testing it.
      // We can assume DeckCreator.build is awaited.
      resolve();
    });

    mockEmitter.emit(
      Commands.UPDATE_DECK as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    // Since the handler is async and not awaited by emitter, we need to wait a bit or flush promises.
    await new Promise(process.nextTick);

    expect(mockDeckCreator.build).toHaveBeenCalled();
    expect(mockDeck.validate).toHaveBeenCalled();
    expect(mockRoom.setDecksToPlayerUnsafe).toHaveBeenCalled();
    expect(mockClient.deckUpdated).toHaveBeenCalled();
  });

  it("should handle UPDATE_DECK command with validation error", async () => {
    const message = {
      data: Buffer.alloc(10),
    } as ClientMessage;

    const mockError = {
      buffer: jest.fn().mockReturnValue(Buffer.from("error")),
    };
    const mockDeck = {
      validate: jest.fn().mockReturnValue(mockError),
    };
    mockDeckCreator.build.mockResolvedValue(mockDeck as any);

    mockEmitter.emit(
      Commands.UPDATE_DECK as unknown as string,
      message,
      mockRoom,
      mockClient,
    );
    await new Promise(process.nextTick);

    expect(mockClient.sendMessage).toHaveBeenCalledWith(Buffer.from("error"));
    expect(mockRoom.notReadyUnsafe).toHaveBeenCalledWith(mockClient);
    expect(mockRoom.setDecksToPlayerUnsafe).not.toHaveBeenCalled();
  });

  it("should handle JOIN event (success)", async () => {
    const message = {
      data: Buffer.alloc(50), // JoinGameMessage size
      previousMessage: Buffer.alloc(40), // PlayerInfoMessage size
    } as ClientMessage;

    // Mock PlayerInfo parsing (BufferToUTF16) inside PlayerInfoMessage constructor
    // We might need to mock PlayerInfoMessage or just provide valid buffer.
    // Since we can't easily mock inner constructor, let's rely on it not crashing with empty buffer?
    // Or better, let's mock the methods Room uses.

    mockRoom.calculatePlaceUnsafe = jest
      .fn()
      .mockReturnValue({ position: 0, team: 0 });
    mockRoom.createPlayerUnsafe = jest.fn().mockReturnValue(mockClient);

    mockEmitter.emit("JOIN", message, mockRoom, mockSocket);
    await new Promise(process.nextTick);

    expect(mockRoom.calculatePlaceUnsafe).toHaveBeenCalled();
    expect(mockRoom.createPlayerUnsafe).toHaveBeenCalled();
    expect(mockRoom.addPlayerUnsafe).toHaveBeenCalledWith(mockClient);
  });

  it("should handle JOIN event (room full -> spectator)", async () => {
    const message = {
      data: Buffer.alloc(50),
      previousMessage: Buffer.alloc(40),
    } as ClientMessage;

    mockRoom.calculatePlaceUnsafe = jest.fn().mockReturnValue(null); // No place
    mockRoom.createSpectatorUnsafe = jest.fn().mockReturnValue(mockClient);

    mockEmitter.emit("JOIN", message, mockRoom, mockSocket);
    await new Promise(process.nextTick);

    expect(mockRoom.createSpectatorUnsafe).toHaveBeenCalled();
    expect(mockRoom.addSpectatorUnsafe).toHaveBeenCalledWith(mockClient);
  });
});
