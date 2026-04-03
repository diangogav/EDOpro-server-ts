import { YGOProClient } from "../../../../../src/ygopro/client/domain/YGOProClient";
import { YGOProRoom } from "../../../../../src/ygopro/room/domain/YGOProRoom";
import { Logger } from "../../../../../src/shared/logger/domain/Logger";
import { ISocket } from "../../../../../src/shared/socket/domain/ISocket";
import { Team } from "../../../../../src/shared/room/Team";

// Mock dependencies
jest.mock("../../../../../src/ygopro/SimpleRoomMessageEmitter");

describe("YGOProClient", () => {
  let client: YGOProClient;
  let mockSocket: jest.Mocked<ISocket>;
  let mockLogger: jest.Mocked<Logger>;
  let mockRoom: jest.Mocked<YGOProRoom>;
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock socket
    mockSocket = {
      send: jest.fn(),
      destroy: jest.fn(),
      onMessage: jest.fn(),
      remoteAddress: "127.0.0.1",
    } as unknown as jest.Mocked<ISocket>;

    // Mock logger
    mockLogger = {
      child: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    // Mock room
    mockRoom = {
      id: "test-room-id",
    } as unknown as jest.Mocked<YGOProRoom>;
  });

  describe("Constructor", () => {
    it("should create a YGOProClient instance", () => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });

      expect(client.name).toBe("TestPlayer");
      expect(client.id).toBe("player-id-1");
      expect(client.position).toBe(0);
      expect(client.host).toBe(true);
      expect(client.connectedToCore).toBe(false);
    });

    it("should initialize with the team passed in constructor", () => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });

      expect(client.team).toBe(Team.PLAYER);
      expect(client.isSpectator).toBe(false);
    });

    it("should initialize as spectator when spectator team is passed", () => {
      client = new YGOProClient({
        name: "Spectator",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: false,
        id: "spectator-id-1",
        team: Team.SPECTATOR,
      });

      expect(client.team).toBe(Team.SPECTATOR);
      expect(client.isSpectator).toBe(true);
    });

    it("should create child logger with correct context", () => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });

      expect(mockLogger.child).toHaveBeenCalledWith({
        clientName: "TestPlayer",
        roomId: "test-room-id",
        file: "YGOProClient",
      });
    });

    it("should register message handler on socket via roomMessageEmitter", () => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });

      expect(mockSocket.onMessage).toHaveBeenCalledWith(expect.any(Function));
    });

  });

  describe("sendMessageToClient", () => {
    beforeEach(() => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });
    });

    it("should send message to client socket", () => {
      const buffer = Buffer.from([0x07, 0x08, 0x09]);

      client.sendMessageToClient(buffer);

      expect(mockSocket.send).toHaveBeenCalledWith(buffer);
    });
  });

  describe("destroy", () => {
    beforeEach(() => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });
    });

    it("should destroy socket", () => {
      client.destroy();

      expect(mockSocket.destroy).toHaveBeenCalled();
    });
  });

  describe("playerPosition", () => {
    beforeEach(() => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });
    });

    it("should update player position and team", () => {
      client.playerPosition(2, Team.OPPONENT);

      expect(client.position).toBe(2);
      expect(client.team).toBe(Team.OPPONENT);
    });

    it("should change from spectator to player", () => {
      const spectatorClient = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: false,
        id: "player-id-1",
        team: Team.SPECTATOR,
      });

      expect(spectatorClient.team).toBe(Team.SPECTATOR);

      spectatorClient.playerPosition(0, Team.PLAYER);

      expect(spectatorClient.team).toBe(Team.PLAYER);
      expect(spectatorClient.isSpectator).toBe(false);
    });
  });

  describe("setNeedSpectatorMessages", () => {
    beforeEach(() => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });
    });

    it("should set needSpectatorMessages to true", () => {
      client.setNeedSpectatorMessages(true);

      expect(client.needSpectatorMessages).toBe(true);
    });

    it("should set needSpectatorMessages to false", () => {
      client.setNeedSpectatorMessages(true);
      client.setNeedSpectatorMessages(false);

      expect(client.needSpectatorMessages).toBe(false);
    });
  });

  describe("setHost", () => {
    beforeEach(() => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: false,
        id: "player-id-1",
        team: Team.PLAYER,
      });
    });

    it("should set host to true", () => {
      expect(client.host).toBe(false);

      client.setHost(true);

      expect(client.host).toBe(true);
    });

    it("should set host to false", () => {
      client.setHost(true);
      client.setHost(false);

      expect(client.host).toBe(false);
    });
  });

  describe("setSocket", () => {
    beforeEach(() => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });
    });

    it("should replace socket with new socket", () => {
      const newMockSocket = {
        send: jest.fn(),
        destroy: jest.fn(),
        onMessage: jest.fn(),
        remoteAddress: "192.168.1.1",
      } as unknown as jest.Mocked<ISocket>;

      client.setSocket(newMockSocket);

      expect(client.socket).toBe(newMockSocket);
    });

    it("should register message handler on new socket", () => {
      const newMockSocket = {
        send: jest.fn(),
        destroy: jest.fn(),
        onMessage: jest.fn(),
        remoteAddress: "192.168.1.1",
      } as unknown as jest.Mocked<ISocket>;

      client.setSocket(newMockSocket);

      expect(newMockSocket.onMessage).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

  });

  describe("rpsChoose", () => {
    beforeEach(() => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });
    });

    it("should set rpsChosen to true", () => {
      client.rpsChoose();

      expect(client.rpsChosen).toBe(true);
    });
  });

  describe("rpsRpsChoose", () => {
    beforeEach(() => {
      client = new YGOProClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
        team: Team.PLAYER,
      });
    });

    it("should set rpsChosen to false", () => {
      client.rpsChoose();
      expect(client.rpsChosen).toBe(true);

      client.rpsRpsChoose();

      expect(client.rpsChosen).toBe(false);
    });
  });

});
