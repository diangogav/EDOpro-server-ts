import WebSocket from "ws";

import WebSocketSingleton from "./WebSocketSingleton";

jest.mock("../edopro/room/infrastructure/RoomList", () => ({
	__esModule: true,
	default: { getRooms: () => [] },
}));

jest.mock("@ygopro/room/infrastructure/YGOProRoomList", () => ({
	__esModule: true,
	default: {
		getListedRooms: () => [
			{ turn: 0, toRealTimePresentation: () => ({ id: 1 }) },
			{ turn: 3, toRealTimePresentation: () => ({ id: 2, turn: 3 }) },
		],
	},
}));

type Received = { action: string; data: unknown };

const open = async (port: number): Promise<{ socket: WebSocket; messages: Received[] }> => {
	const socket = new WebSocket(`ws://127.0.0.1:${port}`);
	const messages: Received[] = [];
	socket.on("message", (data) => messages.push(JSON.parse(data.toString()) as Received));
	await new Promise((resolve) => socket.once("open", resolve));

	return { socket, messages };
};

const waitFor = async (condition: () => boolean): Promise<void> => {
	for (let i = 0; i < 100 && !condition(); i++) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
};

describe("WebSocketSingleton", () => {
	let server: WebSocketSingleton;
	let port: number;

	beforeEach(async () => {
		server = WebSocketSingleton.startForTests();
		port = await server.listening();
	});

	afterEach(async () => {
		await WebSocketSingleton.resetForTests();
	});

	it("sends the rooms with a started duel to every new socket, as the web ranking expects", async () => {
		const { socket, messages } = await open(port);
		await waitFor(() => messages.length > 0);

		expect(messages).toEqual([{ action: "GET-ROOMS", data: [{ id: 2, turn: 3 }] }]);
		socket.close();
	});

	it("broadcasts room changes to anonymous sockets unchanged", async () => {
		const { socket, messages } = await open(port);
		await waitFor(() => messages.length > 0);

		server.broadcast({ action: "UPDATE-ROOM", data: { id: 2, turn: 4 } });
		await waitFor(() => messages.length > 1);

		expect(messages[1]).toEqual({ action: "UPDATE-ROOM", data: { id: 2, turn: 4 } });
		socket.close();
	});

	it("hands each socket's text messages and its close to presence, and delivers presence replies", async () => {
		const events: string[] = [];
		server.attachPresence({
			connect: (socketId) => events.push(`connect:${socketId}`),
			message: async (socketId, raw) => {
				events.push(`message:${raw}`);
				server.send(socketId, { action: "PRESENCE-ERROR", data: { code: "not-joined" } });
			},
			disconnect: (socketId) => events.push(`disconnect:${socketId}`),
		});
		const { socket, messages } = await open(port);

		socket.send('{"action":"PRESENCE-SET"}');
		await waitFor(() => messages.length > 1);
		socket.close();
		await waitFor(() => events.length > 2);

		const socketId = events[0].replace("connect:", "");
		expect(events).toEqual([
			`connect:${socketId}`,
			'message:{"action":"PRESENCE-SET"}',
			`disconnect:${socketId}`,
		]);
		expect(messages[1]).toEqual({ action: "PRESENCE-ERROR", data: { code: "not-joined" } });
	});

	it("closes a socket that sends a message over 4 KB", async () => {
		const { socket } = await open(port);
		const closed = new Promise<number>((resolve) => socket.once("close", resolve));

		socket.send("x".repeat(5000));

		await expect(closed).resolves.toBe(1009);
	});
});
