import { EventEmitter } from "stream";

import YGOProRoomList from "../infrastructure/YGOProRoomList";
import { YGOProJoinHandler } from "./YGOProJoinHandler";
import { JoinStrategyRegistry } from "./join-strategies/JoinStrategyRegistry";

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = () => ({
	id: "sock-one-room",
	remoteAddress: undefined,
	send: jest.fn(),
	close: jest.fn(),
	destroy: jest.fn(),
});

const makeJoinMessage = (pass: string): { data: Buffer; previousMessage: Buffer } => {
	const previousMessage = Buffer.alloc(40, 0);
	Buffer.from("Player", "utf16le").copy(previousMessage, 0);
	const data = Buffer.alloc(48, 0);
	data.writeUInt16LE(0x1362, 0);
	for (let i = 0; i < pass.length; i++) {
		data.writeUInt16LE(pass.charCodeAt(i), 8 + i * 2);
	}

	return { data, previousMessage };
};

describe("YGOProJoinHandler — one room per connection", () => {
	let roomsSpy: jest.SpyInstance;

	const roomsHolding = (socketId: string | null) =>
		roomsSpy.mockReturnValue(
			socketId === null
				? []
				: [{ players: [{ socket: { id: socketId } }], spectators: [], createdBySocketId: null }],
		);

	const makeHandler = (handle: jest.Mock) => {
		const resolve = jest.fn().mockReturnValue({ handle });
		const registry = { resolve } as unknown as JoinStrategyRegistry;
		const socket = makeSocket();
		const handler = new YGOProJoinHandler(
			new EventEmitter(),
			makeLogger() as never,
			socket as never,
			{ errorMessage: jest.fn() } as never,
			registry,
		);

		return { handler, resolve, socket };
	};

	beforeEach(() => {
		roomsSpy = jest.spyOn(YGOProRoomList, "getRooms");
		roomsHolding(null);
	});

	afterEach(() => {
		roomsSpy.mockRestore();
	});

	it("ignores a JOIN from a connection that is already in a room", async () => {
		const { handler, resolve, socket } = makeHandler(jest.fn().mockResolvedValue(undefined));
		roomsHolding("sock-one-room");

		await handler.handleJoinGame(makeJoinMessage("second#pw") as never);

		expect(resolve).not.toHaveBeenCalled();
		expect(socket.close).not.toHaveBeenCalled();
	});

	it("ignores a JOIN that arrives while the previous JOIN is still being handled", async () => {
		let finishFirst!: () => void;
		const handle = jest.fn().mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finishFirst = resolve;
			}),
		);
		const { handler, resolve } = makeHandler(handle);

		const first = handler.handleJoinGame(makeJoinMessage("first#pw") as never);
		await handler.handleJoinGame(makeJoinMessage("second#pw") as never);
		finishFirst();
		await first;

		expect(resolve).toHaveBeenCalledTimes(1);
	});

	it("handles a later JOIN when the earlier one left the connection without a room", async () => {
		const { handler, resolve } = makeHandler(jest.fn().mockResolvedValue(undefined));

		await handler.handleJoinGame(makeJoinMessage("first#pw") as never);
		await handler.handleJoinGame(makeJoinMessage("retry#pw") as never);

		expect(resolve).toHaveBeenCalledTimes(2);
	});
});
