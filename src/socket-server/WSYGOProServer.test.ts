import { IncomingMessage } from "http";
import { mock, MockProxy } from "jest-mock-extended";
import { WebSocket, WebSocketServer } from "ws";

import { Logger } from "@shared/logger/domain/Logger";
import { WebSocketClientSocket } from "../shared/socket/domain/WebSocketClientSocket";
import { MessageEmitter } from "../edopro/MessageEmitter";
import { HandshakeTicketAuthenticator } from "./HandshakeTicketAuthenticator";
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

const makeRawSocket = (): WebSocket =>
	({
		on: jest.fn(),
		off: jest.fn(),
		send: jest.fn(),
		close: jest.fn(),
		terminate: jest.fn(),
		readyState: 1, // WebSocket.OPEN
	}) as unknown as WebSocket;

const makeRequest = (): IncomingMessage =>
	({
		headers: {},
	}) as unknown as IncomingMessage;

// ---------------------------------------------------------------------------

describe("WSYGOProServer", () => {
	let handshakeAuth: MockProxy<HandshakeTicketAuthenticator>;
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
		handshakeAuth = mock<HandshakeTicketAuthenticator>();

		const server = new WSYGOProServer(logger, handshakeAuth);
		server.initialize();
	});

	describe("connection handler — ticket authentication", () => {
		it("sets resolvedUserId on the socket when Bearer token resolves to a userId", async () => {
			handshakeAuth.authenticate.mockResolvedValue({ status: "authenticated", userId: "user-123" });

			await connectionCallback(makeRawSocket(), makeRequest());

			expect(handshakeAuth.authenticate).toHaveBeenCalled();
			expect(mockClientSocket.resolvedUserId).toBe("user-123");
			expect(mockClientSocket.close).not.toHaveBeenCalled();
		});

		it("closes the socket when consume returns null", async () => {
			handshakeAuth.authenticate.mockResolvedValue({ status: "rejected" });

			await connectionCallback(makeRawSocket(), makeRequest());

			expect(mockClientSocket.close).toHaveBeenCalled();
			expect(mockClientSocket.resolvedUserId).toBeUndefined();
		});

		it("closes the socket when Bearer token is not a valid UUID (repo returns null per its contract)", async () => {
			handshakeAuth.authenticate.mockResolvedValue({ status: "rejected" });

			await connectionCallback(makeRawSocket(), makeRequest());

			expect(mockClientSocket.close).toHaveBeenCalled();
		});

		it("closes the socket when Redis is unavailable (consume returns null fail-closed)", async () => {
			handshakeAuth.authenticate.mockResolvedValue({ status: "rejected" });

			await connectionCallback(makeRawSocket(), makeRequest());

			expect(mockClientSocket.close).toHaveBeenCalled();
		});

		it("does not call authenticate and does not close when Authorization header is absent", async () => {
			handshakeAuth.authenticate.mockResolvedValue({ status: "anonymous" });

			await connectionCallback(makeRawSocket(), makeRequest());

			expect(handshakeAuth.authenticate).toHaveBeenCalled();
			expect(mockClientSocket.resolvedUserId).toBeUndefined();
			expect(mockClientSocket.close).not.toHaveBeenCalled();
		});

		it("registers the message pump before the ticket check resolves (no message-race)", async () => {
			let resolveAuth!: (value: { status: "authenticated"; userId: string }) => void;
			handshakeAuth.authenticate.mockReturnValue(
				new Promise<{ status: "authenticated"; userId: string }>((resolve) => {
					resolveAuth = resolve;
				}),
			);

			const handlerPromise = connectionCallback(makeRawSocket(), makeRequest());

			// The pump must be registered synchronously before authenticate resolves
			expect(mockClientSocket.onMessage).toHaveBeenCalled();

			resolveAuth({ status: "authenticated", userId: "user-123" });
			await handlerPromise;
		});

		it("does not pump buffered messages after rejecting an invalid ticket", async () => {
			const handleMessage = jest.fn();
			(MessageEmitter as unknown as jest.Mock).mockImplementation(() => ({ handleMessage }));
			handshakeAuth.authenticate.mockResolvedValue({ status: "rejected" });

			let pumpCallback!: (data: Buffer) => Promise<void>;
			mockClientSocket.onMessage.mockImplementation((cb: (d: Buffer) => Promise<void>) => {
				pumpCallback = cb;
			});

			await connectionCallback(makeRawSocket(), makeRequest());

			void pumpCallback(Buffer.from("00", "hex"));
			await Promise.resolve();
			await Promise.resolve();

			expect(mockClientSocket.close).toHaveBeenCalled();
			expect(handleMessage).not.toHaveBeenCalled();
		});
	});
});
