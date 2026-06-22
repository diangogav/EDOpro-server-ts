import { IncomingMessage } from "http";
import { mock, MockProxy } from "jest-mock-extended";
import { WebSocket, WebSocketServer } from "ws";

import { Logger } from "@shared/logger/domain/Logger";
import { WebSocketClientSocket } from "../shared/socket/domain/WebSocketClientSocket";
import { Commands } from "../shared/messages/Commands";
import { MessageEmitter } from "../edopro/MessageEmitter";
import { HandshakeTicketAuthenticator } from "./HandshakeTicketAuthenticator";
import { WSYGOProServer } from "./WSYGOProServer";

// --- Infrastructure mocks (prevent DB connections and port binding) ---
jest.mock("ws");
jest.mock("http", () => ({ createServer: jest.fn().mockReturnValue({}) }));
jest.mock("crypto", () => ({ randomUUID: jest.fn().mockReturnValue("test-socket-uuid") }));
jest.mock("src/config", () => ({
	config: { servers: { mercury: { wsPort: 7800, wsHeartbeatIntervalMs: 30000 } } },
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
		ping: jest.fn(),
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
		send: jest.Mock;
		onMessage: jest.Mock;
		onClose: jest.Mock;
		id?: string;
		remoteAddress: string;
	};
	let mockWssInstance: {
		on: jest.Mock;
		options: { server: { listen: jest.Mock } };
		clients: Set<WebSocket>;
	};
	let connectionCallback: (rawSocket: WebSocket, req: IncomingMessage) => Promise<void>;
	let heartbeatTick: () => void;
	let setIntervalSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();

		// Fake socket instance returned each time `new WebSocketClientSocket(raw)` is called
		mockClientSocket = {
			resolvedUserId: undefined,
			close: jest.fn(),
			send: jest.fn(),
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
			clients: new Set<WebSocket>(),
		};
		(WebSocketServer as unknown as jest.Mock).mockImplementation(() => mockWssInstance);

		// Capture the heartbeat sweep callback instead of running a real timer,
		// so tests can drive it deterministically and no handle leaks between tests.
		setIntervalSpy = jest.spyOn(global, "setInterval").mockImplementation(((cb: () => void) => {
			heartbeatTick = cb;
			return { unref: jest.fn() } as unknown as NodeJS.Timeout;
		}) as unknown as typeof setInterval);

		logger = mock<Logger>();
		logger.child.mockReturnValue(logger);
		handshakeAuth = mock<HandshakeTicketAuthenticator>();

		const server = new WSYGOProServer(logger, handshakeAuth);
		server.initialize();
	});

	afterEach(() => {
		jest.restoreAllMocks();
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

	describe("heartbeat — liveness detection", () => {
		type AliveSocket = WebSocket & { isAlive?: boolean };

		const getPongHandler = (rawSocket: WebSocket): (() => void) => {
			const call = (rawSocket.on as jest.Mock).mock.calls.find(([event]) => event === "pong");
			return call[1] as () => void;
		};

		it("starts the sweep with the configured heartbeat interval", () => {
			expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
		});

		it("marks the connection alive and registers a pong listener on connect", async () => {
			const rawSocket = makeRawSocket();
			handshakeAuth.authenticate.mockResolvedValue({ status: "anonymous" });

			await connectionCallback(rawSocket, makeRequest());

			expect((rawSocket as AliveSocket).isAlive).toBe(true);
			expect(rawSocket.on).toHaveBeenCalledWith("pong", expect.any(Function));
		});

		it("re-marks the connection alive when a pong arrives", async () => {
			const rawSocket = makeRawSocket();
			handshakeAuth.authenticate.mockResolvedValue({ status: "anonymous" });

			await connectionCallback(rawSocket, makeRequest());

			(rawSocket as AliveSocket).isAlive = false;
			getPongHandler(rawSocket)();

			expect((rawSocket as AliveSocket).isAlive).toBe(true);
		});

		it("re-marks the connection alive on any inbound message (keeps active duels alive)", async () => {
			const rawSocket = makeRawSocket();
			handshakeAuth.authenticate.mockResolvedValue({ status: "authenticated", userId: "u1" });

			let pumpCallback!: (data: Buffer) => Promise<void>;
			mockClientSocket.onMessage.mockImplementation((cb: (d: Buffer) => Promise<void>) => {
				pumpCallback = cb;
			});

			await connectionCallback(rawSocket, makeRequest());

			(rawSocket as AliveSocket).isAlive = false;
			await pumpCallback(Buffer.from("000022", "hex")); // CHAT, not a ping

			expect((rawSocket as AliveSocket).isAlive).toBe(true);
		});

		it("terminates unresponsive clients and pings the responsive ones on each sweep", () => {
			const dead = makeRawSocket() as AliveSocket;
			const alive = makeRawSocket() as AliveSocket;
			dead.isAlive = false;
			alive.isAlive = true;
			mockWssInstance.clients.add(dead);
			mockWssInstance.clients.add(alive);

			heartbeatTick();

			expect(dead.terminate).toHaveBeenCalled();
			expect(dead.ping).not.toHaveBeenCalled();
			expect(alive.terminate).not.toHaveBeenCalled();
			expect(alive.ping).toHaveBeenCalled();
			expect(alive.isAlive).toBe(false);
		});
	});

	describe("application-level ping (0xff) echo", () => {
		const runPump = async (data: Buffer): Promise<void> => {
			handshakeAuth.authenticate.mockResolvedValue({ status: "authenticated", userId: "u1" });
			let pumpCallback!: (data: Buffer) => Promise<void>;
			mockClientSocket.onMessage.mockImplementation((cb: (d: Buffer) => Promise<void>) => {
				pumpCallback = cb;
			});
			await connectionCallback(makeRawSocket(), makeRequest());
			await pumpCallback(data);
		};

		it("echoes a PING (0xff) back as PONG (0xfe) preserving the payload, without forwarding it", async () => {
			const handleMessage = jest.fn();
			(MessageEmitter as unknown as jest.Mock).mockImplementation(() => ({ handleMessage }));
			const ping = Buffer.from([0x04, 0x00, Commands.PING, 0xde, 0xad, 0xbe]);

			await runPump(ping);

			expect(mockClientSocket.send).toHaveBeenCalledTimes(1);
			const sent = mockClientSocket.send.mock.calls[0][0] as Buffer;
			expect(sent.readUInt8(2)).toBe(0xfe);
			expect(sent.subarray(3)).toEqual(ping.subarray(3));
			expect(handleMessage).not.toHaveBeenCalled();
		});

		it("forwards non-ping frames to the message emitter", async () => {
			const handleMessage = jest.fn();
			(MessageEmitter as unknown as jest.Mock).mockImplementation(() => ({ handleMessage }));
			const chat = Buffer.from([0x01, 0x00, Commands.CHAT]);

			await runPump(chat);

			expect(handleMessage).toHaveBeenCalledWith(chat);
			expect(mockClientSocket.send).not.toHaveBeenCalled();
		});
	});
});
