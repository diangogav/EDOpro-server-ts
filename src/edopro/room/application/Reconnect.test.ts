import { ISocket } from "@shared/socket/domain/ISocket";
import { CheckIfUseCanJoin } from "@shared/user-auth/application/CheckIfUserCanJoin";
import { Client } from "@edopro/client/domain/Client";
import { JoinGameMessage } from "@edopro/messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { Reconnect } from "./Reconnect";
import { Room } from "@edopro/room/domain/Room";

// Mock dependencies
jest.mock("@edopro/room/domain/Room");
jest.mock("@edopro/client/domain/Client");
jest.mock("@shared/user-auth/application/CheckIfUserCanJoin");
jest.mock(
  "@edopro/messages/server-to-client/JoinGameClientMessage",
);
jest.mock(
  "@shared/messages/server-to-client/TypeChangeClientMessage",
);
jest.mock(
  "@shared/messages/server-to-client/PlayerEnterClientMessage",
);

describe("Reconnect", () => {
  let reconnect: Reconnect;
  let mockCheckIfUseCanJoin: jest.Mocked<CheckIfUseCanJoin>;
  let mockSocket: jest.Mocked<ISocket>;
  let mockRoom: jest.Mocked<Room>;
  let mockPlayer: jest.Mocked<Client>;

  beforeEach(() => {
    mockCheckIfUseCanJoin = {
      check: jest.fn(),
    } as unknown as jest.Mocked<CheckIfUseCanJoin>;

    reconnect = new Reconnect(mockCheckIfUseCanJoin);

    mockSocket = {
      id: "socket-id",
    } as unknown as jest.Mocked<ISocket>;

    mockPlayer = {
      setSocket: jest.fn(),
      reconnecting: jest.fn(),
      sendMessage: jest.fn(),
      host: true,
      position: 0,
    } as unknown as jest.Mocked<Client>;

    mockRoom = {
      ranked: false,
      players: [mockPlayer],
    } as unknown as jest.Mocked<Room>;
  });

  it("should allow reconnect for unranked room", async () => {
    const joinMessage = {} as JoinGameMessage;
    const playerInfoMessage = {} as PlayerInfoMessage;

    await reconnect.run(
      playerInfoMessage,
      mockPlayer,
      joinMessage,
      mockSocket,
      mockRoom,
    );

    expect(mockPlayer.setSocket).toHaveBeenCalledWith(
      mockSocket,
      mockRoom.players,
      mockRoom,
    );
    expect(mockPlayer.reconnecting).toHaveBeenCalled();
    expect(mockPlayer.sendMessage).toHaveBeenCalledTimes(3); // JoinGame, TypeChange, PlayerEnter
  });

  it("should allow reconnect for ranked room if check passes", async () => {
    Object.defineProperty(mockRoom, "ranked", { value: true });
    mockCheckIfUseCanJoin.check.mockResolvedValue(true);

    const joinMessage = {} as JoinGameMessage;

    const playerInfoMessage = {} as PlayerInfoMessage;

    await reconnect.run(
      playerInfoMessage,
      mockPlayer,
      joinMessage,
      mockSocket,
      mockRoom,
    );

    expect(mockCheckIfUseCanJoin.check).toHaveBeenCalledWith(
      playerInfoMessage,
      mockSocket,
    );
    expect(mockPlayer.setSocket).toHaveBeenCalled();
  });

  it("should deny reconnect for ranked room if check fails", async () => {
    Object.defineProperty(mockRoom, "ranked", { value: true });
    mockCheckIfUseCanJoin.check.mockResolvedValue(false);

    const joinMessage = {} as JoinGameMessage;

    const playerInfoMessage = {} as PlayerInfoMessage;

    await reconnect.run(
      playerInfoMessage,
      mockPlayer,
      joinMessage,
      mockSocket,
      mockRoom,
    );

    expect(mockCheckIfUseCanJoin.check).toHaveBeenCalled();
    expect(mockPlayer.setSocket).not.toHaveBeenCalled();
  });
});
