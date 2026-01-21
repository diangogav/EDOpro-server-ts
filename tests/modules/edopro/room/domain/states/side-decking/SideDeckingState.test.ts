import { EventEmitter } from "stream";
import { Logger } from "../../../../../../../src/shared/logger/domain/Logger";
import { Reconnect } from "../../../../../../../src/edopro/room/application/Reconnect";
import { JoinToDuelAsSpectator } from "../../../../../../../src/edopro/room/application/JoinToDuelAsSpectator";
import { DeckCreator } from "../../../../../../../src/edopro/deck/application/DeckCreator";
import { SideDeckingState } from "../../../../../../../src/edopro/room/domain/states/side-decking/SideDeckingState";
import { Room } from "../../../../../../../src/edopro/room/domain/Room";
import { Client } from "../../../../../../../src/edopro/client/domain/Client";
import { Commands } from "../../../../../../../src/edopro/messages/domain/Commands";
import { ClientMessage } from "../../../../../../../src/edopro/messages/MessageProcessor";
import { UpdateDeckMessageParser } from "../../../../../../../src/edopro/deck/application/UpdateDeckMessageSizeCalculator";
import { ISocket } from "../../../../../../../src/shared/socket/domain/ISocket";

// Mocks
jest.mock("../../../../../../../src/shared/logger/domain/Logger");
jest.mock("../../../../../../../src/edopro/room/application/Reconnect");
jest.mock(
  "../../../../../../../src/edopro/room/application/JoinToDuelAsSpectator",
);
jest.mock("../../../../../../../src/edopro/deck/application/DeckCreator");
jest.mock("../../../../../../../src/edopro/room/domain/Room");
jest.mock("../../../../../../../src/edopro/client/domain/Client");
jest.mock(
  "../../../../../../../src/edopro/deck/application/UpdateDeckMessageSizeCalculator",
);

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
      clients: [mockClient],
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
    mockDeckCreator.build.mockResolvedValue({} as any);

    mockEmitter.emit(
      Commands.UPDATE_DECK as unknown as string,
      message,
      mockRoom,
      mockClient,
    );
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

    mockEmitter.emit(
      Commands.UPDATE_DECK as unknown as string,
      message,
      mockRoom,
      mockClient,
    );
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
    mockDeckCreator.build.mockResolvedValue({} as any);
    Object.defineProperty(mockClient, "isReconnecting", { value: true });

    mockEmitter.emit(
      Commands.UPDATE_DECK as unknown as string,
      message,
      mockRoom,
      mockClient,
    );
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
    mockDeckCreator.build.mockResolvedValue({} as any);
    Object.defineProperty(mockClient, "isReady", { value: true }); // Assume this update happens after ready() call

    // We need to simulate ready state change.
    // The `isReady` getter on mockClient should return true when checked in `startDuel`.
    // But `ready()` is called inside `handleUpdateDeck`.
    // Let's make `isReady` return true.

    mockEmitter.emit(
      Commands.UPDATE_DECK as unknown as string,
      message,
      mockRoom,
      mockClient,
    );
    await new Promise(process.nextTick);

    expect(mockRoom.choosingOrder).toHaveBeenCalled();
  });

  it("should handle JOIN command (reconnecting)", async () => {
    const message = {
      data: Buffer.alloc(50), // JoinGameMessage size
      previousMessage: Buffer.alloc(40), // PlayerInfoMessage size
    } as ClientMessage;

    // Mock RoomState.playerAlreadyInRoom
    // Since RoomState is extended, we can mock the method on the instance if possible,
    // or better: checking logic depends on `room.clients`.
    // `playerAlreadyInRoom` checks `clients` for matching name/ip.

    // Let's assume we mock `room.clients` to include a client with same name.
    // Wait, `playerAlreadyInRoom` implementation is in `RoomState.ts`.
    // We are not testing `RoomState.ts` logic here (it's abstract/base), but we rely on it.
    // We can't easily mock the method on `state` because it's the SUT.
    // But we can ensure `room.clients` has a match.

    // RoomState.playerAlreadyInRoom logic:
    // const player = room.clients.find((client) => client.name === playerInfoMessage.name);
    // if (!player) return null;
    // ... check ip ...

    // We need to provide a JoinGameMessage buffer that parses to something usable?
    // Or just mock `Room` behavior if `playerAlreadyInRoom` delegates?
    // No, `playerAlreadyInRoom` is on `this`.

    // Let's create a real-ish scenario.
    // `playerInfoMessage` name comes from `message.previousMessage`.

    // If we can't easily trigger `reconnectingPlayer` to be found without valid buffers/logic,
    // we might mock `playerAlreadyInRoom` on the prototype or instance.

    jest.spyOn(state as any, "playerAlreadyInRoom").mockReturnValue(mockClient);

    mockEmitter.emit("JOIN", message, mockRoom, mockSocket);
    await new Promise(process.nextTick);

    expect(mockReconnect.run).toHaveBeenCalled();
  });

  it("should handle JOIN command (spectator)", async () => {
    const message = {
      data: Buffer.alloc(50),
      previousMessage: Buffer.alloc(40),
    } as ClientMessage;

    jest.spyOn(state as any, "playerAlreadyInRoom").mockReturnValue(null);

    mockEmitter.emit("JOIN", message, mockRoom, mockSocket);
    await new Promise(process.nextTick);

    expect(mockJoinToDuelAsSpectator.run).toHaveBeenCalled();
  });
});
