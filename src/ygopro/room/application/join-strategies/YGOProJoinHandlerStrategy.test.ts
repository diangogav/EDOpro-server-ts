/**
 * Integration tests for YGOProJoinHandler with strategy chain.
 *
 * Verifies that:
 * 1. Normal (non-AI) joins still work (regression guard for DefaultJoinStrategy extraction)
 * 2. Strategy chain iterates in order until one handles
 * 3. The registry can be injected for testing via createForTests
 */

import { EventEmitter } from "stream";

import { YGOProJoinHandler } from "../YGOProJoinHandler";
import { JoinStrategyRegistry } from "./JoinStrategyRegistry";
import { JoinContext, JoinStrategy } from "./JoinStrategy";

import YGOProRoomList from "../../infrastructure/YGOProRoomList";
import { YGOProRoom } from "../../domain/YGOProRoom";

// Suppress unhandled WaitingState errors in tests that don't set up full room infrastructure
let waitingSpy: jest.SpyInstance;
let roomEmitSpy: jest.SpyInstance;

// ---- helpers ----

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = (id = "sock-handler") => ({
	id,
	destroy: jest.fn(),
	send: jest.fn(),
	roomId: undefined as number | undefined,
});

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	joinGameMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	typeChangeMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	playerEnterMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	playerChangeMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	spectatorCountMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
});

const makeCheckIfUserCanJoin = () => ({
	check: jest.fn().mockResolvedValue(true),
});

/**
 * Build a minimal JOIN_GAME ClientMessage payload.
 *
 * YGOProCtosJoinGame field layout (from BinaryField decorators):
 *   - version:  u16 at offset 0  (2 bytes)
 *   - (padding) 2 bytes at offset 2
 *   - gameid:   u32 at offset 4  (4 bytes)
 *   - pass:     utf16 at offset 8, max 20 chars = 40 bytes
 *
 * Total data size: 48 bytes minimum.
 */
const makeJoinMessage = (pass: string): { data: Buffer; previousMessage: Buffer } => {
	// Build previousMessage (PlayerInfo): 40 bytes, UTF-16LE player name
	// PlayerInfoMessage reads up to data.length bytes from previousMessage
	const prevMsg = Buffer.alloc(40, 0);
	const nameEncoded = Buffer.from("TestPlayer", "utf16le");
	nameEncoded.copy(prevMsg, 0);

	// Build join data according to actual BinaryField layout
	const data = Buffer.alloc(48, 0);
	data.writeUInt16LE(0x1362, 0); // version at offset 0
	data.writeUInt16LE(0, 2);       // padding/gametype
	data.writeUInt32LE(0, 4);       // gameid at offset 4

	// pass at offset 8, max 20 UTF-16LE chars
	const passChars = pass.slice(0, 20);
	for (let i = 0; i < passChars.length; i++) {
		data.writeUInt16LE(passChars.charCodeAt(i), 8 + i * 2);
	}

	return { data, previousMessage: prevMsg };
};

// ---- tests ----

describe("YGOProJoinHandler — strategy chain integration", () => {
	let emitter: EventEmitter;

	beforeEach(() => {
		emitter = new EventEmitter();
		JoinStrategyRegistry.reset();
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
		// Prevent real WaitingState setup and JOIN processing in these integration tests
		waitingSpy = jest.spyOn(YGOProRoom.prototype, "waiting").mockImplementation(() => undefined);
		roomEmitSpy = jest.spyOn(YGOProRoom.prototype, "emit").mockImplementation(() => undefined);
	});

	afterEach(() => {
		JoinStrategyRegistry.reset();
		waitingSpy.mockRestore();
		roomEmitSpy.mockRestore();
	});

	it("still creates a normal room for a non-AI join (DefaultJoinStrategy regression)", async () => {
		// Listen for the JOIN emit that WaitingState would handle
		emitter.on("JOIN", jest.fn());

		const socket = makeSocket();
		const messageRepo = makeMessageRepository();
		const checkJoin = makeCheckIfUserCanJoin();
		const logger = makeLogger();

		new YGOProJoinHandler(
			emitter,
			logger as never,
			socket as never,
			checkJoin as never,
			messageRepo as never,
		);

		const { data, previousMessage } = makeJoinMessage("NORMALROOM");
		emitter.emit(18 as unknown as string, { data, previousMessage });

		// Allow async ops to complete
		await new Promise((r) => setImmediate(r));

		const room = YGOProRoomList.findByName("NORMALROOM");
		expect(room).not.toBeNull();
	});

	it("iterates strategies in order — first matching strategy handles", async () => {
		const handled: string[] = [];

		const s1: JoinStrategy = {
			matches: (_ctx: JoinContext) => {
				handled.push("s1-matches");
				return false;
			},
			handle: jest.fn(),
		};
		const s2: JoinStrategy = {
			matches: (_ctx: JoinContext) => {
				handled.push("s2-matches");
				return true;
			},
			handle: jest.fn().mockResolvedValue(undefined),
		};
		const s3: JoinStrategy = {
			matches: jest.fn().mockReturnValue(true),
			handle: jest.fn(),
		};

		const registry = JoinStrategyRegistry.createForTests([s1, s2, s3]);

		const socket = makeSocket();
		const messageRepo = makeMessageRepository();
		const checkJoin = makeCheckIfUserCanJoin();
		const logger = makeLogger();

		const handler = new YGOProJoinHandler(
			emitter,
			logger as never,
			socket as never,
			checkJoin as never,
			messageRepo as never,
			registry,
		);

		const { data, previousMessage } = makeJoinMessage("ANYTHING");
		emitter.emit(18 as unknown as string, { data, previousMessage });

		await new Promise((r) => setImmediate(r));

		// s1 evaluated but did not match; s2 matched and handled; s3 never evaluated
		expect(handled).toContain("s1-matches");
		expect(handled).toContain("s2-matches");
		expect(s2.handle).toHaveBeenCalled();
		expect(s3.handle).not.toHaveBeenCalled();
	});

	it("YGOProJoinHandler uses the default registry when none is injected", () => {
		const socket = makeSocket();
		const messageRepo = makeMessageRepository();
		const checkJoin = makeCheckIfUserCanJoin();
		const logger = makeLogger();

		expect(() => {
			new YGOProJoinHandler(
				emitter,
				logger as never,
				socket as never,
				checkJoin as never,
				messageRepo as never,
			);
		}).not.toThrow();
	});
});
