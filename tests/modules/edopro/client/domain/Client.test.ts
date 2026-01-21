import { Logger } from "../../../../../src/shared/logger/domain/Logger";
import { ISocket } from "../../../../../src/shared/socket/domain/ISocket";
import { Client } from "../../../../../src/edopro/client/domain/Client";
import { Deck } from "../../../../../src/edopro/deck/domain/Deck";
import { Choose } from "../../../../../src/edopro/rock-paper-scissor/RockPaperScissor";
import { Room } from "../../../../../src/edopro/room/domain/Room";
import { RoomMessageEmitter } from "../../../../../src/edopro/RoomMessageEmitter";
import {
  MessageProcessor,
  ClientMessage,
} from "../../../../../src/edopro/messages/MessageProcessor";

jest.mock("../../../../../src/edopro/RoomMessageEmitter");
jest.mock("../../../../../src/edopro/messages/MessageProcessor");

describe("Client", () => {
  let client: Client;
  let mockSocket: jest.Mocked<ISocket>;
  let mockLogger: jest.Mocked<Logger>;
  let mockRoom: jest.Mocked<Room>;

  beforeEach(() => {
    mockSocket = {
      id: "socket-id",
      send: jest.fn(),
      onMessage: jest.fn(),
      onClose: jest.fn(),
      close: jest.fn(),
      destroy: jest.fn(),
      remoteAddress: "127.0.0.1",
      roomId: 1,
      closed: false,
      removeAllListeners: jest.fn(),
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<Logger>;

    mockRoom = {} as unknown as jest.Mocked<Room>;

    client = new Client({
      socket: mockSocket,
      host: true,
      name: "TestPlayer",
      position: 1,
      roomId: 100,
      team: 0,
      logger: mockLogger,
      id: "user-id",
    });
  });

  it("should initialize correctly", () => {
    expect(client.name).toBe("TestPlayer");
    expect(client.position).toBe(1);
    expect(client.roomId).toBe(100);
    expect(client.team).toBe(0);
    expect(client.host).toBe(true);
    expect(mockLogger.child).toHaveBeenCalled();
  });

  it("should set socket and attach listeners", () => {
    const newSocket = { ...mockSocket, id: "new-socket-id" };
    const mockHandleMessage = jest.fn();
    const mockRead = jest.fn();

    (RoomMessageEmitter as jest.Mock).mockImplementation(() => ({
      handleMessage: mockHandleMessage,
    }));

    (MessageProcessor as jest.Mock).mockImplementation(() => ({
      read: mockRead,
    }));

    client.setSocket(newSocket, [], mockRoom);

    expect(client.socket.id).toBe("new-socket-id");
    expect(newSocket.onMessage).toHaveBeenCalled();

    // Simulate message
    const messageHandler = (newSocket.onMessage as jest.Mock).mock.calls[0][0];
    const data = Buffer.from("test");
    messageHandler(data);

    expect(mockHandleMessage).toHaveBeenCalledWith(data);
    expect(mockRead).toHaveBeenCalledWith(data);
  });

  it("should handle socket without remote address", () => {
    const socketWithoutIp = { ...mockSocket, remoteAddress: undefined };
    client.setSocket(socketWithoutIp, [], mockRoom);
    expect((client as any)._ipAddress).toBeNull();
  });

  it("should manage RPS choice", () => {
    expect(client.rpsChoise).toBeNull();

    client.setRpsChosen("SCISSOR");
    expect(client.rpsChoise).toBe("SCISSOR");

    client.clearRpsChoise();
    expect(client.rpsChoise).toBeNull();
  });

  it("should set readiness", () => {
    client.ready();
    expect(client.isReady).toBe(true);

    client.notReady();
    expect(client.isReady).toBe(false);
  });

  it("should manage deck", () => {
    const mockDeck = {} as Deck;
    client.setDeck(mockDeck);
    expect(client.deck).toBe(mockDeck);
  });

  it("should manage duel position", () => {
    client.setDuelPosition(5);
    expect(client.duelPosition).toBe(5);
  });

  it("should manage turn state", () => {
    client.turn();
    expect(client.inTurn).toBe(true);

    client.clearTurn();
    expect(client.inTurn).toBe(false);
  });

  it("should manage reconnect flag", () => {
    client.setCanReconnect(true);
    expect(client.canReconnect).toBe(true);

    client.setCanReconnect(false);
    expect(client.canReconnect).toBe(false);
  });

  it("should send message via socket", () => {
    const message = Buffer.from("hello");
    client.sendMessage(message);
    expect(mockSocket.send).toHaveBeenCalledWith(message);
  });

  it("should manage deck update state", () => {
    expect(client.isUpdatingDeck).toBeFalsy();

    client.updatingDeck();
    expect(client.isUpdatingDeck).toBe(true);

    client.deckUpdated();
    expect(client.isUpdatingDeck).toBe(false);
  });

  it("should manage ready command", () => {
    const mockMessage = {} as ClientMessage;
    expect(client.haveReadyCommand).toBeFalsy();

    client.saveReadyCommand(mockMessage);
    expect(client.haveReadyCommand).toBe(true);
    expect(client.readyMessage).toBe(mockMessage);

    client.clearReadyCommand();
    expect(client.haveReadyCommand).toBe(false);
  });
});
