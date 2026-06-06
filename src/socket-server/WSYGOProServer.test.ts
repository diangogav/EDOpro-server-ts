import { IncomingMessage } from "http";
import { mock, MockProxy } from "jest-mock-extended";
import { WebSocket, WebSocketServer } from "ws";

import { Logger } from "@shared/logger/domain/Logger";
import { TicketRepository } from "@shared/ticket/domain/TicketRepository";
import { WebSocketClientSocket } from "../shared/socket/domain/WebSocketClientSocket";
import { WSYGOProServer } from "./WSYGOProServer";

// --- Infrastructure mocks (prevent DB connections and port binding) ---
jest.mock("ws");
jest.mock("http", () => ({ createServer: jest.fn().mockReturnValue({}) }));
jest.mock("crypto", () => ({ randomUUID: jest.fn().mockReturnValue("test-socket-uuid") }));
jest.mock("src/config", () => ({
  config: { servers: { mercury: { wsPort: 7800 } } },
}));
jest.mock("src/shared/user-auth/application/CheckIfUserCanJoin");
jest.mock("src/shared/user-auth/application/UserAuth");
jest.mock("src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository");
jest.mock("../edopro/MessageEmitter");
jest.mock("../shared/room/application/DisconnectHandler");
jest.mock("../shared/room/application/RoomFinder");
jest.mock("../shared/socket/domain/WebSocketClientSocket");
jest.mock("@ygopro/room/application/YGOProGameCreatorHandler");
jest.mock("@ygopro/room/application/YGOProJoinHandler");
jest.mock("@ygopro/room/infrastructure/YGOProMessageRepository");

// ---------------------------------------------------------------------------

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const makeRawSocket = (): WebSocket =>
  ({
    on: jest.fn(),
    off: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn(),
    readyState: 1, // WebSocket.OPEN
  } as unknown as WebSocket);

const makeRequest = (authHeader?: string): IncomingMessage =>
  ({
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  } as unknown as IncomingMessage);

// ---------------------------------------------------------------------------

describe("WSYGOProServer", () => {
  let ticketRepo: MockProxy<TicketRepository>;
  let logger: MockProxy<Logger>;
  let mockClientSocket: {
    resolvedUserId?: string;
    close: jest.Mock;
    onMessage: jest.Mock;
    onClose: jest.Mock;
    id?: string;
    remoteAddress: string;
  };
  let mockWssInstance: { on: jest.Mock; options: { server: { listen: jest.Mock } } };
  let connectionCallback: (rawSocket: WebSocket, req: IncomingMessage) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Fake socket instance returned each time `new WebSocketClientSocket(raw)` is called
    mockClientSocket = {
      resolvedUserId: undefined,
      close: jest.fn(),
      onMessage: jest.fn(),
      onClose: jest.fn(),
      id: undefined,
      remoteAddress: "127.0.0.1",
    };
    (WebSocketClientSocket as unknown as jest.Mock).mockImplementation(() => mockClientSocket);

    // Fake WebSocketServer that captures the "connection" handler
    mockWssInstance = {
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "connection") connectionCallback = cb as typeof connectionCallback;
      }),
      options: { server: { listen: jest.fn() } },
    };
    (WebSocketServer as unknown as jest.Mock).mockImplementation(() => mockWssInstance);

    logger = mock<Logger>();
    logger.child.mockReturnValue(logger);
    ticketRepo = mock<TicketRepository>();

    const server = new WSYGOProServer(logger, ticketRepo);
    server.initialize();
  });

  describe("connection handler — ticket authentication", () => {
    it("sets resolvedUserId on the socket when Bearer token resolves to a userId", async () => {
      ticketRepo.consume.mockResolvedValue("user-123");

      await connectionCallback(makeRawSocket(), makeRequest(`Bearer ${VALID_UUID}`));

      expect(ticketRepo.consume).toHaveBeenCalledWith(VALID_UUID);
      expect(mockClientSocket.resolvedUserId).toBe("user-123");
      expect(mockClientSocket.close).not.toHaveBeenCalled();
    });

    it("closes the socket when consume returns null", async () => {
      ticketRepo.consume.mockResolvedValue(null);

      await connectionCallback(makeRawSocket(), makeRequest(`Bearer ${VALID_UUID}`));

      expect(mockClientSocket.close).toHaveBeenCalled();
      expect(mockClientSocket.resolvedUserId).toBeUndefined();
    });

    it("closes the socket when Bearer token is not a valid UUID (repo returns null per its contract)", async () => {
      ticketRepo.consume.mockResolvedValue(null);

      await connectionCallback(makeRawSocket(), makeRequest("Bearer not-a-uuid"));

      expect(mockClientSocket.close).toHaveBeenCalled();
    });

    it("closes the socket when Redis is unavailable (consume returns null fail-closed)", async () => {
      ticketRepo.consume.mockResolvedValue(null);

      await connectionCallback(makeRawSocket(), makeRequest(`Bearer ${VALID_UUID}`));

      expect(mockClientSocket.close).toHaveBeenCalled();
    });

    it("does not call consume and does not close when Authorization header is absent", async () => {
      await connectionCallback(makeRawSocket(), makeRequest());

      expect(ticketRepo.consume).not.toHaveBeenCalled();
      expect(mockClientSocket.resolvedUserId).toBeUndefined();
      expect(mockClientSocket.close).not.toHaveBeenCalled();
    });

    it("registers the message pump before the ticket check resolves (no message-race)", async () => {
      let resolveConsume!: (value: string | null) => void;
      ticketRepo.consume.mockReturnValue(
        new Promise<string | null>((resolve) => {
          resolveConsume = resolve;
        })
      );

      const handlerPromise = connectionCallback(makeRawSocket(), makeRequest(`Bearer ${VALID_UUID}`));

      // The pump must be registered synchronously before consume resolves
      expect(mockClientSocket.onMessage).toHaveBeenCalled();

      resolveConsume("user-123");
      await handlerPromise;
    });
  });
});
