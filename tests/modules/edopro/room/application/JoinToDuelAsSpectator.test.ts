import { ISocket } from "../../../../../src/shared/socket/domain/ISocket";
import { Client } from "../../../../../src/edopro/client/domain/Client";
import { JoinGameMessage } from "../../../../../src/edopro/messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../../src/edopro/messages/client-to-server/PlayerInfoMessage";
import { JoinToDuelAsSpectator } from "../../../../../src/edopro/room/application/JoinToDuelAsSpectator";
import { Room } from "../../../../../src/edopro/room/domain/Room";

// Mock dependencies
jest.mock("../../../../../src/edopro/room/domain/Room");
jest.mock("../../../../../src/edopro/client/domain/Client");
jest.mock(
  "../../../../../src/edopro/messages/server-to-client/JoinGameClientMessage",
);
jest.mock(
  "../../../../../src/shared/messages/server-to-client/DuelStartClientMessage",
);
jest.mock(
  "../../../../../src/edopro/messages/server-to-client/CatchUpClientMessage",
);
jest.mock(
  "../../../../../src/edopro/messages/server-to-client/ServerMessageClientMessage",
);

describe("JoinToDuelAsSpectator", () => {
  let handler: JoinToDuelAsSpectator;
  let mockSocket: jest.Mocked<ISocket>;
  let mockRoom: jest.Mocked<Room>;
  let mockSpectator: jest.Mocked<Client>;
  let mockClient1: jest.Mocked<Client>;
  let mockClient2: jest.Mocked<Client>;

  beforeEach(() => {
    handler = new JoinToDuelAsSpectator();

    mockSocket = {
      send: jest.fn(),
    } as unknown as jest.Mocked<ISocket>;

    mockSpectator = {
      name: "Spectator\0",
      sendMessage: jest.fn(),
    } as unknown as jest.Mocked<Client>;

    mockClient1 = {
      name: "Player1\0",
      team: 0,
      sendMessage: jest.fn(),
    } as unknown as jest.Mocked<Client>;

    mockClient2 = {
      name: "Player2",
      team: 1,
      sendMessage: jest.fn(),
    } as unknown as jest.Mocked<Client>;

    mockRoom = {
      createSpectatorUnsafe: jest.fn().mockReturnValue(mockSpectator),
      addSpectatorUnsafe: jest.fn(),
      notifyToAllPlayers: jest.fn(),
      spectatorCache: [Buffer.from("cache1"), Buffer.from("cache2")],
      clients: [mockClient1, mockClient2],
      spectators: [mockSpectator],
      matchScore: jest.fn().mockReturnValue({ team0: 1, team1: 0 }),
    } as unknown as jest.Mocked<Room>;
  });

  it("should handle spectator join correctly", async () => {
    const joinMessage = {} as JoinGameMessage;
    const playerInfoMessage = { name: "Spectator" } as PlayerInfoMessage;

    await handler.run(joinMessage, playerInfoMessage, mockSocket, mockRoom);

    expect(mockRoom.createSpectatorUnsafe).toHaveBeenCalledWith(
      mockSocket,
      "Spectator",
    );
    expect(mockRoom.addSpectatorUnsafe).toHaveBeenCalledWith(mockSpectator);
    expect(mockRoom.notifyToAllPlayers).toHaveBeenCalledWith(mockSpectator);

    // Verify messages sent to spectator
    expect(mockSpectator.sendMessage).toHaveBeenCalledTimes(5); // JoinGame, DuelStart, CatchUp(true), CatchUp(false), ServerMessage(has entered)

    // Verify socket messages (cache + welcome + score)
    expect(mockSocket.send).toHaveBeenCalledTimes(4); // 2 cache items + Welcome + Score

    // Verify notification to other clients
    expect(mockClient1.sendMessage).toHaveBeenCalled();
    expect(mockClient2.sendMessage).toHaveBeenCalled();
    expect(mockSpectator.sendMessage).toHaveBeenCalled(); // Also notified self? Logic says [...room.clients, ...room.spectators]
  });
});
