import "reflect-metadata";
import { container } from "../../../../../src/shared/dependency-injection";
import { EventBus } from "../../../../../src/shared/event-bus/EventBus";
import WebSocketSingleton from "../../../../../src/web-socket-server/WebSocketSingleton";
import { Client } from "../../../../../src/edopro/client/domain/Client";
import { FinishDuelHandler } from "../../../../../src/edopro/room/application/FinishDuelHandler";
import { DuelFinishReason } from "../../../../../src/edopro/room/domain/DuelFinishReason";
import { Room } from "../../../../../src/edopro/room/domain/Room";
import { Replay } from "../../../../../src/edopro/replay/Replay";

// Mock dependencies
jest.mock("../../../../../src/shared/dependency-injection");
jest.mock("../../../../../src/shared/event-bus/EventBus");
jest.mock("../../../../../src/web-socket-server/WebSocketSingleton");
jest.mock("../../../../../src/edopro/client/domain/Client");
jest.mock("../../../../../src/edopro/room/domain/Room");

describe("FinishDuelHandler", () => {
  let handler: FinishDuelHandler;
  let mockRoom: jest.Mocked<Room>;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockWebSocketSingleton: jest.Mocked<WebSocketSingleton>;
  let mockClient1: jest.Mocked<Client>;
  let mockClient2: jest.Mocked<Client>;
  let mockSpectator: jest.Mocked<Client>;
  let mockReplay: jest.Mocked<Replay>;

  beforeEach(() => {
    // Mock WebSocketSingleton
    mockWebSocketSingleton = {
      broadcast: jest.fn(),
    } as unknown as jest.Mocked<WebSocketSingleton>;
    (WebSocketSingleton.getInstance as jest.Mock).mockReturnValue(
      mockWebSocketSingleton,
    );

    // Mock EventBus
    mockEventBus = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<EventBus>;
    (container.get as jest.Mock).mockReturnValue(mockEventBus);

    // Mock Clients
    mockClient1 = new Client({} as any) as jest.Mocked<Client>;
    Object.assign(mockClient1, {
      sendMessage: jest.fn(),
      notReady: jest.fn(),
      position: 0,
      team: 0,
    });

    mockClient2 = new Client({} as any) as jest.Mocked<Client>;
    Object.assign(mockClient2, {
      sendMessage: jest.fn(),
      notReady: jest.fn(),
      position: 1,
      team: 1,
    });

    mockSpectator = new Client({} as any) as jest.Mocked<Client>;
    Object.assign(mockSpectator, {
      sendMessage: jest.fn(),
    });

    // Mock Replay
    mockReplay = {
      addMessage: jest.fn(),
      addPlayers: jest.fn(),
      serialize: jest.fn().mockResolvedValue(Buffer.from("replay-data")),
    } as unknown as jest.Mocked<Replay>;

    // Mock Room
    mockRoom = {
      duelWinner: jest.fn(),
      toRealTimePresentation: jest.fn().mockReturnValue({}),
      stopRoomTimer: jest.fn(),
      stopTimer: jest.fn(),
      clearSpectatorCache: jest.fn(),
      clients: [mockClient1, mockClient2],
      spectators: [mockSpectator],
      score: "0-0",
      firstToPlay: 0,
      replay: mockReplay,
      resetReplay: jest.fn(),
      isMatchFinished: jest.fn().mockReturnValue(false),
      sideDecking: jest.fn(),
      setClientWhoChoosesTurn: jest.fn(),
      team0: 1,
      team1: 1,
    } as unknown as jest.Mocked<Room>;

    handler = new FinishDuelHandler({
      reason: DuelFinishReason.SURRENDERED,
      winner: 1,
      room: mockRoom,
    });
  });

  it("should handle duel finish with surrender (not match finish)", async () => {
    await handler.run();

    expect(mockRoom.duelWinner).toHaveBeenCalledWith(1);
    expect(mockWebSocketSingleton.broadcast).toHaveBeenCalledWith({
      action: "UPDATE-ROOM",
      data: {},
    });
    expect(mockRoom.stopRoomTimer).toHaveBeenCalled();
    expect(mockRoom.stopTimer).toHaveBeenCalledTimes(2);
    expect(mockRoom.clearSpectatorCache).toHaveBeenCalled();

    // Verify score message sent
    expect(mockClient1.sendMessage).toHaveBeenCalled();
    expect(mockSpectator.sendMessage).toHaveBeenCalled();

    // Verify win message (due to surrender)
    expect(mockRoom.replay.addMessage).toHaveBeenCalled();

    // Verify replay handling
    expect(mockRoom.replay.addPlayers).toHaveBeenCalled();
    expect(mockRoom.replay.serialize).toHaveBeenCalled();
    expect(mockRoom.resetReplay).toHaveBeenCalled();

    // Verify side decking
    expect(mockRoom.sideDecking).toHaveBeenCalled();
    expect(mockClient1.sendMessage).toHaveBeenCalled(); // SideDeckClientMessage
    expect(mockClient1.notReady).toHaveBeenCalled();
    expect(mockSpectator.sendMessage).toHaveBeenCalled(); // SideDeckWaitClientMessage

    // Verify choosing turn logic
    // Winner is 1 (Team 1). Looser is 0 (Team 0).
    // Team 0 player is mockClient1 (position 0).
    expect(mockRoom.setClientWhoChoosesTurn).toHaveBeenCalledWith(mockClient1);
  });

  it("should handle duel finish with surrender when winner is team 0", async () => {
    const handlerTeam0 = new FinishDuelHandler({
      reason: DuelFinishReason.SURRENDERED,
      winner: 0,
      room: mockRoom,
    });

    await handlerTeam0.run();

    expect(mockRoom.duelWinner).toHaveBeenCalledWith(0);
    // Winner is 0 (Team 0). Looser is 1 (Team 1).
    // Team 1 player is mockClient2 (position 1).
    // mockRoom.team1 is 1. position % team1 === 0? 1 % 1 === 0. True.
    expect(mockRoom.setClientWhoChoosesTurn).toHaveBeenCalledWith(mockClient2);
  });

  it("should handle match finish", async () => {
    mockRoom.isMatchFinished.mockReturnValue(true);
    Object.defineProperty(mockRoom, "matchPlayersHistory", { value: [] });
    Object.defineProperty(mockRoom, "bestOf", { value: 3 });
    Object.defineProperty(mockRoom, "banListHash", { value: 123 });
    Object.defineProperty(mockRoom, "ranked", { value: true });

    await handler.run();

    expect(mockRoom.isMatchFinished).toHaveBeenCalled();
    // DuelEndMessage sent
    expect(mockClient1.sendMessage).toHaveBeenCalled();
    expect(mockSpectator.sendMessage).toHaveBeenCalled();

    // Event published
    expect(mockEventBus.publish).toHaveBeenCalled();

    // Room removed broadcast
    expect(mockWebSocketSingleton.broadcast).toHaveBeenCalledWith({
      action: "REMOVE-ROOM",
      data: {},
    });

    // Should NOT side deck
    expect(mockRoom.sideDecking).not.toHaveBeenCalled();
  });
});
