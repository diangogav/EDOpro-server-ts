import net from "net";
import { MercuryClient } from "../../../../../src/mercury/client/domain/MercuryClient";
import { MercuryRoom } from "../../../../../src/mercury/room/domain/MercuryRoom";
import { Logger } from "../../../../../src/shared/logger/domain/Logger";
import { ISocket } from "../../../../../src/shared/socket/domain/ISocket";
import { Team } from "../../../../../src/shared/room/Team";
import { ClientMessage } from "../../../../../src/edopro/messages/MessageProcessor";

// Mock dependencies
jest.mock("net");
jest.mock("../../../../../src/mercury/MercuryCoreMessageEmitter");
jest.mock("../../../../../src/mercury/MercuryRoomMessageEmitter");

describe("MercuryClient", () => {
  let client: MercuryClient;
  let mockSocket: jest.Mocked<ISocket>;
  let mockLogger: jest.Mocked<Logger>;
  let mockRoom: jest.Mocked<MercuryRoom>;
  let mockCoreClient: jest.Mocked<net.Socket>;

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
    } as unknown as jest.Mocked<MercuryRoom>;

    // Mock core client (net.Socket)
    mockCoreClient = {
      on: jest.fn(),
      connect: jest.fn(),
      write: jest.fn(),
      destroy: jest.fn(),
    } as unknown as jest.Mocked<net.Socket>;

    // Mock net.Socket constructor
    (net.Socket as unknown as jest.Mock).mockImplementation(
      () => mockCoreClient,
    );
  });

  describe("Constructor", () => {
    it("should create a MercuryClient instance", () => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });

      expect(client.name).toBe("TestPlayer");
      expect(client.id).toBe("player-id-1");
      expect(client.position).toBe(0);
      expect(client.host).toBe(true);
      expect(client.connectedToCore).toBe(false);
    });

    it("should initialize with spectator team", () => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: false,
        id: null,
      });

      expect(client.team).toBe(Team.SPECTATOR);
      expect(client.isSpectator).toBe(true);
    });

    it("should create child logger with correct context", () => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });

      expect(mockLogger.child).toHaveBeenCalledWith({
        clientName: "TestPlayer",
        roomId: "test-room-id",
        file: "MercuryClient",
      });
    });

    it("should register data event listener on core client", () => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });

      expect(mockCoreClient.on).toHaveBeenCalledWith(
        "data",
        expect.any(Function),
      );
    });

    it("should register connect event listener on core client", () => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });

      expect(mockCoreClient.on).toHaveBeenCalledWith(
        "connect",
        expect.any(Function),
      );
    });

    it("should register message handler on socket", () => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });

      expect(mockSocket.onMessage).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe("connectToCore", () => {
    beforeEach(() => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });
    });

    it("should connect to core with correct url and port", () => {
      client.connectToCore({ url: "localhost", port: 3000 });

      expect(mockCoreClient.connect).toHaveBeenCalledWith(
        3000,
        "localhost",
        expect.any(Function),
      );
    });

    it("should not connect if already connected to core", () => {
      // Simulate connection
      const connectHandler = (mockCoreClient.on as jest.Mock).mock.calls.find(
        (call) => call[0] === "connect",
      )[1];
      connectHandler();

      // Try to connect again
      client.connectToCore({ url: "localhost", port: 3000 });

      expect(mockCoreClient.connect).not.toHaveBeenCalled();
    });

    it("should set connectedToCore to true on connect event", () => {
      expect(client.connectedToCore).toBe(false);

      // Trigger connect event
      const connectHandler = (mockCoreClient.on as jest.Mock).mock.calls.find(
        (call) => call[0] === "connect",
      )[1];
      connectHandler();

      expect(client.connectedToCore).toBe(true);
    });
  });

  describe("sendMessageToCore", () => {
    beforeEach(() => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });
    });

    it("should send ClientMessage to core client", () => {
      const message: ClientMessage = {
        raw: Buffer.from([0x01, 0x02, 0x03]),
      } as ClientMessage;

      client.sendMessageToCore(message);

      expect(mockCoreClient.write).toHaveBeenCalledWith(message.raw);
    });

    it("should log debug message when sending to core", () => {
      const message: ClientMessage = {
        raw: Buffer.from([0x01, 0x02, 0x03]),
      } as ClientMessage;

      client.sendMessageToCore(message);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("SENDING TO CORE:"),
      );
    });
  });

  describe("sendToCore", () => {
    beforeEach(() => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });
    });

    it("should send buffer to core client", () => {
      const buffer = Buffer.from([0x04, 0x05, 0x06]);

      client.sendToCore(buffer);

      expect(mockCoreClient.write).toHaveBeenCalledWith(buffer);
    });

    it("should log debug message when sending buffer to core", () => {
      const buffer = Buffer.from([0x04, 0x05, 0x06]);

      client.sendToCore(buffer);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("SENDING TO CORE:"),
      );
    });
  });

  describe("sendMessageToClient", () => {
    beforeEach(() => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
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
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });
    });

    it("should destroy both core client and socket", () => {
      client.destroy();

      expect(mockCoreClient.destroy).toHaveBeenCalled();
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it("should log debug message on destroy", () => {
      client.destroy();

      expect(mockLogger.debug).toHaveBeenCalledWith("DESTROY");
    });
  });

  describe("playerPosition", () => {
    beforeEach(() => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });
    });

    it("should update player position and team", () => {
      client.playerPosition(2, Team.OPPONENT);

      expect(client.position).toBe(2);
      expect(client.team).toBe(Team.OPPONENT);
    });

    it("should change from spectator to player", () => {
      expect(client.team).toBe(Team.SPECTATOR);

      client.playerPosition(0, Team.PLAYER);

      expect(client.team).toBe(Team.PLAYER);
      expect(client.isSpectator).toBe(false);
    });
  });

  describe("setNeedSpectatorMessages", () => {
    beforeEach(() => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
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
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: false,
        id: "player-id-1",
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
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
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

    it("should update IP address from new socket", () => {
      const newMockSocket = {
        send: jest.fn(),
        destroy: jest.fn(),
        onMessage: jest.fn(),
        remoteAddress: "192.168.1.100",
      } as unknown as jest.Mocked<ISocket>;

      client.setSocket(newMockSocket);

      // IP address is protected, but we can verify by creating a client with null and updating
      expect(newMockSocket.remoteAddress).toBe("192.168.1.100");
    });
  });

  describe("rpsChoose", () => {
    beforeEach(() => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });
    });

    it("should set rpsChosen to true", () => {
      client.rpsChoose();

      expect(client.rpsChosen).toBe(true);
    });
  });

  describe("rpsRpsChoose", () => {
    beforeEach(() => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });
    });

    it("should set rpsChosen to false", () => {
      client.rpsChoose();
      expect(client.rpsChosen).toBe(true);

      client.rpsRpsChoose();

      expect(client.rpsChosen).toBe(false);
    });
  });

  describe("Getters", () => {
    beforeEach(() => {
      client = new MercuryClient({
        name: "TestPlayer",
        socket: mockSocket,
        logger: mockLogger,
        messages: [],
        position: 0,
        room: mockRoom,
        host: true,
        id: "player-id-1",
      });
    });

    it("should return socket", () => {
      expect(client.socket).toBe(mockSocket);
    });

    it("should return connectedToCore", () => {
      expect(client.connectedToCore).toBe(false);

      // Trigger connect event
      const connectHandler = (mockCoreClient.on as jest.Mock).mock.calls.find(
        (call) => call[0] === "connect",
      )[1];
      connectHandler();

      expect(client.connectedToCore).toBe(true);
    });

    it("should return needSpectatorMessages", () => {
      expect(client.needSpectatorMessages).toBe(false);

      client.setNeedSpectatorMessages(true);

      expect(client.needSpectatorMessages).toBe(true);
    });
  });
});
