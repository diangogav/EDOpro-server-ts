import "reflect-metadata";
import { EventEmitter } from "stream";
import { Logger } from "../../../../../../../src/shared/logger/domain/Logger";
import { Reconnect } from "../../../../../../../src/edopro/room/application/Reconnect";
import { JoinToDuelAsSpectator } from "../../../../../../../src/edopro/room/application/JoinToDuelAsSpectator";
import { Room } from "../../../../../../../src/edopro/room/domain/Room";
import { JSONMessageProcessor } from "../../../../../../../src/edopro/messages/JSONMessageProcessor";
import { DuelingState } from "../../../../../../../src/edopro/room/domain/states/dueling/DuelingState";
import { Client } from "../../../../../../../src/edopro/client/domain/Client";
import { ClientMessage } from "../../../../../../../src/edopro/messages/MessageProcessor";
import { Commands } from "../../../../../../../src/edopro/messages/domain/Commands";
import { FinishDuelHandler } from "../../../../../../../src/edopro/room/application/FinishDuelHandler";
import { UpdateDeckMessageParser } from "../../../../../../../src/edopro/deck/application/UpdateDeckMessageSizeCalculator";
import { ISocket } from "../../../../../../../src/shared/socket/domain/ISocket";
import { spawn } from "child_process";
import WebSocketSingleton from "../../../../../../../src/web-socket-server/WebSocketSingleton";

// Mocks
jest.mock("../../../../../../../src/shared/logger/domain/Logger");
jest.mock("../../../../../../../src/edopro/room/application/Reconnect");
jest.mock(
  "../../../../../../../src/edopro/room/application/JoinToDuelAsSpectator",
);
jest.mock("../../../../../../../src/edopro/room/domain/Room");
jest.mock("../../../../../../../src/edopro/messages/JSONMessageProcessor");
jest.mock("../../../../../../../src/edopro/client/domain/Client");
jest.mock("../../../../../../../src/edopro/room/application/FinishDuelHandler");
jest.mock(
  "../../../../../../../src/edopro/deck/application/UpdateDeckMessageSizeCalculator",
);
jest.mock("child_process");
jest.mock("../../../../../../../src/web-socket-server/WebSocketSingleton");

describe("DuelingState", () => {
  let state: DuelingState;
  let mockEmitter: EventEmitter;
  let mockLogger: jest.Mocked<Logger>;
  let mockReconnect: jest.Mocked<Reconnect>;
  let mockJoinToDuelAsSpectator: jest.Mocked<JoinToDuelAsSpectator>;
  let mockRoom: jest.Mocked<Room>;
  let mockJsonMessageProcessor: jest.Mocked<JSONMessageProcessor>;
  let mockClient: jest.Mocked<Client>;
  let mockSocket: jest.Mocked<ISocket>;
  let mockCore: any;
  let mockWebSocketSingleton: jest.Mocked<WebSocketSingleton>;

  beforeEach(() => {
    mockEmitter = new EventEmitter();

    mockWebSocketSingleton = {
      broadcast: jest.fn(),
    } as unknown as jest.Mocked<WebSocketSingleton>;
    (WebSocketSingleton.getInstance as jest.Mock).mockReturnValue(
      mockWebSocketSingleton,
    );

    mockLogger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    mockReconnect = {
      run: jest.fn(),
    } as unknown as jest.Mocked<Reconnect>;

    mockJoinToDuelAsSpectator = {
      run: jest.fn(),
    } as unknown as jest.Mocked<JoinToDuelAsSpectator>;

    mockJsonMessageProcessor = {
      read: jest.fn(),
      process: jest.fn(),
      isMessageReady: jest.fn(),
      payload: { data: "", size: 0 },
      currentBuffer: Buffer.alloc(0),
      clear: jest.fn(),
    } as unknown as jest.Mocked<JSONMessageProcessor>;

    mockSocket = {
      send: jest.fn(),
      remoteAddress: "127.0.0.1",
      destroy: jest.fn(),
    } as unknown as jest.Mocked<ISocket>;

    mockClient = {
      logger: mockLogger,
      sendMessage: jest.fn(),
      socket: mockSocket,
      setCanReconnect: jest.fn(),
      deck: { main: [], side: [], extra: [] },
      position: 0,
      team: 0,
      duelPosition: 0,
      host: true,
      isSpectator: false,
      isReconnecting: false,
      canReconnect: false,
      clearReconnecting: jest.fn(),
    } as unknown as jest.Mocked<Client>;

    mockRoom = {
      clients: [mockClient],
      spectators: [],
      startLp: 8000,
      startHand: 5,
      drawCount: 1,
      timeLimit: 300,
      duelFlag: 0n,
      firstToPlay: 0,
      banListHash: 123,
      id: 1,
      score: "0-0",
      replay: {
        setSeed: jest.fn(),
        addMessage: jest.fn(),
        addResponse: jest.fn(),
      },
      prepareTurnOrder: jest.fn(),
      setDuel: jest.fn(),
      createDuel: jest.fn(),
      setPlayerDecksSize: jest.fn(),
      setOpponentDecksSize: jest.fn(),
      sendMessageToCpp: jest.fn(),
      cacheTeamMessage: jest.fn(),
      resetTimer: jest.fn(),
      calculateTimeReceiver: jest.fn().mockReturnValue(0),
      getTime: jest.fn().mockReturnValue(300),
      nextTurn: jest.fn(),
      isFinished: jest.fn().mockReturnValue(false),
      finished: jest.fn(),
      stopTimer: jest.fn(),
      setLastPhaseMessage: jest.fn(),
      lastPhaseMessage: null,
      playerMainDeckSize: 40,
      playerExtraDeckSize: 15,
      opponentMainDeckSize: 40,
      opponentExtraDeckSize: 15,
      isFirstDuel: jest.fn().mockReturnValue(true),
      toRealTimePresentation: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<Room>;

    mockCore = {
      stderr: { on: jest.fn() },
      stdout: { on: jest.fn() },
      on: jest.fn(),
      stdin: { write: jest.fn() },
    };
    (spawn as jest.Mock).mockReturnValue(mockCore);

    state = new DuelingState(
      mockEmitter,
      mockLogger,
      mockReconnect,
      mockJoinToDuelAsSpectator,
      mockRoom,
      mockJsonMessageProcessor,
    );
  });

  it("should initialize and start duel", () => {
    expect(mockRoom.setDuel).toHaveBeenCalledWith(mockCore);
    expect(mockRoom.createDuel).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith("Starting Duel");
  });

  it("should handle UPDATE_DECK command (valid deck)", () => {
    const message = { data: Buffer.alloc(10) } as ClientMessage;
    const mockParser = {
      getDeck: jest.fn().mockReturnValue([[1, 2], [3]]),
    };
    (UpdateDeckMessageParser as jest.Mock).mockReturnValue(mockParser);

    Object.defineProperty(mockClient.deck, "main", {
      value: [{ code: "1" }, { code: "2" }],
    });
    Object.defineProperty(mockClient.deck, "side", { value: [{ code: "3" }] });
    Object.defineProperty(mockClient.deck, "extra", { value: [] });

    mockEmitter.emit(
      Commands.UPDATE_DECK as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockClient.setCanReconnect).toHaveBeenCalledWith(true);
  });

  it("should handle UPDATE_DECK command (invalid deck length)", () => {
    const message = { data: Buffer.alloc(10) } as ClientMessage;
    const mockParser = {
      getDeck: jest.fn().mockReturnValue([[1], []]),
    };
    (UpdateDeckMessageParser as jest.Mock).mockReturnValue(mockParser);

    Object.defineProperty(mockClient.deck, "main", {
      value: [{ code: "1" }, { code: "2" }],
    });

    mockEmitter.emit(
      Commands.UPDATE_DECK as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockClient.setCanReconnect).toHaveBeenCalledWith(false);
    expect(mockClient.socket.send).toHaveBeenCalled(); // Error message
  });

  it("should handle SURRENDER command", () => {
    const message = {} as ClientMessage;

    mockEmitter.emit(
      Commands.SURRENDER as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockRoom.sendMessageToCpp).toHaveBeenCalledWith(
      expect.stringContaining("DESTROY_DUEL"),
    );
    expect(FinishDuelHandler).toHaveBeenCalled();
  });

  it("should handle RESPONSE command", () => {
    const message = {
      data: Buffer.from([0x01, 0x02]),
    } as ClientMessage;

    mockEmitter.emit(
      Commands.RESPONSE as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockRoom.replay.addResponse).toHaveBeenCalled();
    expect(mockRoom.stopTimer).toHaveBeenCalled();
    expect(mockRoom.sendMessageToCpp).toHaveBeenCalledWith(
      expect.stringContaining("RESPONSE"),
    );
  });

  it("should handle READY command (reconnecting)", () => {
    const message = {} as ClientMessage;
    Object.defineProperty(mockClient, "isReconnecting", { value: true });
    Object.defineProperty(mockClient, "canReconnect", { value: true });

    mockEmitter.emit(
      Commands.READY as unknown as string,
      message,
      mockRoom,
      mockClient,
    );

    expect(mockClient.sendMessage).toHaveBeenCalled(); // StartDuel messages
    expect(mockRoom.sendMessageToCpp).toHaveBeenCalledWith(
      expect.stringContaining("GET_FIELD"),
    );
  });

  it("should handle JOIN command (password fail)", () => {
    const message = {
      data: Buffer.alloc(50),
      previousMessage: Buffer.alloc(40),
    } as ClientMessage;
    Object.defineProperty(mockRoom, "password", { value: "secret" });

    // Mock JoinGameMessage constructor behavior?

    // It reads from buffer. We passed empty buffer, so password will be empty string.
    // "secret" !== "" -> fail

    mockEmitter.emit("JOIN", message, mockRoom, mockSocket);

    expect(mockSocket.send).toHaveBeenCalled();
    expect(mockSocket.destroy).toHaveBeenCalled();
  });

  it("should process all ready core messages in the same tick when under limit", () => {
    Object.defineProperty(mockJsonMessageProcessor, "payload", {
      value: {
        data: JSON.stringify({ type: "UNKNOWN" }),
        size: 0,
      },
    });
    mockJsonMessageProcessor.isMessageReady
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    (state as any).processMessage();

    expect(mockJsonMessageProcessor.process).toHaveBeenCalledTimes(2);
  });

  it("should defer remaining core messages to next tick when limit is reached", () => {
    Object.defineProperty(mockJsonMessageProcessor, "payload", {
      value: {
        data: JSON.stringify({ type: "UNKNOWN" }),
        size: 0,
      },
    });

    let readyCalls = 0;
    mockJsonMessageProcessor.isMessageReady.mockImplementation(() => {
      readyCalls += 1;
      return readyCalls <= 1001;
    });

    const setImmediateSpy = jest
      .spyOn(global, "setImmediate")
      .mockImplementation(() => {
        return 0 as unknown as NodeJS.Immediate;
      });

    (state as any).processMessage();

    expect(mockJsonMessageProcessor.process).toHaveBeenCalledTimes(1000);
    expect(setImmediateSpy).toHaveBeenCalledTimes(1);

    setImmediateSpy.mockRestore();
  });

});
