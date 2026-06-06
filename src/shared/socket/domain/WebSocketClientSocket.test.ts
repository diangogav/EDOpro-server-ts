import WebSocket from "ws";

import { WebSocketClientSocket } from "./WebSocketClientSocket";

jest.mock("ws");

const makeRawSocket = (): WebSocket =>
  ({
    on: jest.fn(),
    off: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn(),
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket);

describe("WebSocketClientSocket", () => {
  describe("resolvedUserId", () => {
    it("is undefined by default", () => {
      const socket = new WebSocketClientSocket(makeRawSocket());
      expect(socket.resolvedUserId).toBeUndefined();
    });

    it("can be set after construction", () => {
      const socket = new WebSocketClientSocket(makeRawSocket());
      socket.resolvedUserId = "user-123";
      expect(socket.resolvedUserId).toBe("user-123");
    });
  });
});
