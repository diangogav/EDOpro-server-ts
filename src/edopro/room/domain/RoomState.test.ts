import { EventEmitter } from "stream";

import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { RoomState } from "./RoomState";
import { Commands } from "../../../shared/messages/Commands";
import { RoomType } from "src/shared/room/domain/RoomType";

// RoomState is abstract but declares no abstract members — a bare concrete
// subclass is enough to exercise the inherited CHAT and EMOTE handlers
// (registered in the constructor). The handlers are private, so we drive them
// through the "CHAT" / "EMOTE" events, exactly as the runtime does.
class TestRoomState extends RoomState {}

const makeSocket = () => ({
	send: jest.fn(),
	destroy: jest.fn(),
	close: jest.fn(),
});

const makeChatMessage = (text: string) => ({
	data: Buffer.from(text, "utf16le"),
	previousMessage: Buffer.alloc(0),
});

// Emote ids travel as raw utf-8 in the frame body (not utf16le like chat).
const makeEmoteMessage = (id: string) => ({
	data: Buffer.from(id, "utf8"),
	previousMessage: Buffer.alloc(0),
});

const makeMercuryRoom = (socket: { send: jest.Mock }) =>
	({
		roomType: RoomType.MERCURY,
		isPositionSwapped: false,
		clients: [{ socket }],
	}) as unknown as never;

describe("RoomState — Mercury spectator chat (Option A: server prefixes name)", () => {
	let eventEmitter: EventEmitter;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		new TestRoomState(eventEmitter);
	});

	it("prefixes the spectator's name to the chat msg in a Mercury room", () => {
		const socket = makeSocket();
		const room = makeMercuryRoom(socket);
		const spectator = {
			name: "Duelista 5863",
			isSpectator: true,
			position: 7,
			team: 3,
		} as unknown as never;

		eventEmitter.emit(Commands.CHAT as unknown as string, makeChatMessage("hola"), room, spectator);

		expect(socket.send).toHaveBeenCalled();
		const sent = socket.send.mock.calls[0][0] as Buffer;
		// The outgoing STOC_CHAT msg must carry "Name: text" (UTF-16LE on the wire).
		expect(sent.includes(Buffer.from("Duelista 5863: hola", "utf16le"))).toBe(true);
	});

	it("does NOT prefix a name for a duelist (player) chat", () => {
		const socket = makeSocket();
		const room = makeMercuryRoom(socket);
		const player = {
			name: "Jugador A",
			isSpectator: false,
			position: 0,
			team: 0,
		} as unknown as never;

		eventEmitter.emit(Commands.CHAT as unknown as string, makeChatMessage("hola"), room, player);

		expect(socket.send).toHaveBeenCalled();
		const sent = socket.send.mock.calls[0][0] as Buffer;
		expect(sent.includes(Buffer.from("Jugador A: hola", "utf16le"))).toBe(false);
		expect(sent.includes(Buffer.from("hola", "utf16le"))).toBe(true);
	});
});

describe("RoomState — existing-player (nickname taken) rejection", () => {
	let eventEmitter: EventEmitter;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
	});

	it("sends 'Nickname '<name>' is already in use — choose another.' via RED STOC_CHAT, then JOINERROR, then destroys the socket", () => {
		const state = new TestRoomState(eventEmitter) as unknown as {
			sendExistingPlayerErrorMessage: (
				playerInfoMessage: { name: string },
				socket: unknown,
			) => void;
		};
		const socket = makeSocket();

		state.sendExistingPlayerErrorMessage({ name: "Diango" }, socket);

		const expectedFrame = Buffer.from(
			new YGOProStocChat()
				.fromPartial({
					player_type: ChatColor.RED,
					msg: "Nickname 'Diango' is already in use — choose another.",
				})
				.toFullPayload(),
		);
		expect(socket.send).toHaveBeenCalledWith(expectedFrame);
		expect(socket.destroy).toHaveBeenCalled();
	});
});

describe("RoomState — :score command", () => {
	let eventEmitter: EventEmitter;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		new TestRoomState(eventEmitter);
	});

	it("answers with a WHITE STOC_CHAT frame carrying room.score, not the legacy 0xF3 frame", () => {
		const socket = makeSocket();
		const room = { score: "Score · Diango 1 – 0 Rival" } as unknown as never;
		const client = { socket } as unknown as never;

		eventEmitter.emit(Commands.CHAT as unknown as string, makeChatMessage(":score"), room, client);

		const expectedFrame = Buffer.from(
			new YGOProStocChat()
				.fromPartial({ player_type: ChatColor.WHITE, msg: "Score · Diango 1 – 0 Rival" })
				.toFullPayload(),
		);
		expect(socket.send).toHaveBeenCalledWith(expectedFrame);
	});
});

describe("RoomState — Mercury emote gate (only seated duelists send)", () => {
	let eventEmitter: EventEmitter;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		new TestRoomState(eventEmitter);
	});

	it("broadcasts a duelist's valid emote to the room", () => {
		const socket = makeSocket();
		const room = makeMercuryRoom(socket);
		const duelist = {
			isSpectator: false,
			position: 0,
			tryEmote: () => true,
		} as unknown as never;

		eventEmitter.emit(Commands.EMOTE as unknown as string, makeEmoteMessage("wave"), room, duelist);

		expect(socket.send).toHaveBeenCalledTimes(1);
	});

	it("does NOT broadcast a spectator's emote (rejected before rate-limit)", () => {
		const socket = makeSocket();
		const room = makeMercuryRoom(socket);
		const spectator = {
			isSpectator: true,
			position: 7,
			// The gate must short-circuit BEFORE the rate-limiter — if tryEmote is
			// reached the spectator slipped through, so make that a hard failure.
			tryEmote: () => {
				throw new Error("tryEmote must not be reached for a spectator");
			},
		} as unknown as never;

		eventEmitter.emit(
			Commands.EMOTE as unknown as string,
			makeEmoteMessage("wave"),
			room,
			spectator,
		);

		expect(socket.send).not.toHaveBeenCalled();
	});
});

describe("RoomState — Mercury emote ids are relayed without a catalog check", () => {
	let eventEmitter: EventEmitter;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		new TestRoomState(eventEmitter);
	});

	const makeDuelist = () =>
		({
			isSpectator: false,
			position: 0,
			tryEmote: () => true,
		}) as unknown as never;

	const sendEmote = (id: string) => {
		const socket = makeSocket();
		eventEmitter.emit(
			Commands.EMOTE as unknown as string,
			makeEmoteMessage(id),
			makeMercuryRoom(socket),
			makeDuelist(),
		);
		return socket;
	};

	it("broadcasts an emote pack ref the server has never seen", () => {
		const socket = sendEmote("halloween-duelist/attack");

		expect(socket.send).toHaveBeenCalledTimes(1);
		const frame: Buffer = socket.send.mock.calls[0][0];
		expect(frame.subarray(4).toString("utf8")).toBe("halloween-duelist/attack");
	});

	it("broadcasts an id of exactly 48 bytes", () => {
		expect(sendEmote("a".repeat(48)).send).toHaveBeenCalledTimes(1);
	});

	it("drops an id longer than 48 bytes, counting bytes rather than characters", () => {
		expect(sendEmote("a".repeat(49)).send).not.toHaveBeenCalled();
		// 24 two-byte characters = 48 bytes (accepted); 25 = 50 bytes (dropped).
		expect(sendEmote("é".repeat(24)).send).toHaveBeenCalledTimes(1);
		expect(sendEmote("é".repeat(25)).send).not.toHaveBeenCalled();
	});

	it("drops an empty id", () => {
		expect(sendEmote("").send).not.toHaveBeenCalled();
	});
});

// srvpro2 announces a duelist as `pos ^ (1 << teamOffsetBit)` once the turn
// choice swaps positions: teamOffsetBit is 1 in Tag (teams sit at 0-1 and
// 2-3), so the swap flips teams, not teammates.
describe("RoomState — Mercury sender seat after a position swap", () => {
	let eventEmitter: EventEmitter;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		new TestRoomState(eventEmitter);
	});

	const makeRoom = (
		socket: { send: jest.Mock },
		opts: { isTag: boolean; isPositionSwapped: boolean },
	) => ({ roomType: RoomType.MERCURY, clients: [{ socket }], ...opts }) as unknown as never;

	const makeDuelist = (position: number) =>
		({
			name: `seat ${position}`,
			isSpectator: false,
			position,
			team: position >> 1,
			tryEmote: () => true,
		}) as unknown as never;

	// STOC_CHAT: [u16 length][u8 opcode][u16 player_type][msg]
	const chatSeat = (position: number, opts: { isTag: boolean; isPositionSwapped: boolean }) => {
		const socket = makeSocket();
		eventEmitter.emit(
			Commands.CHAT as unknown as string,
			makeChatMessage("hola"),
			makeRoom(socket, opts),
			makeDuelist(position),
		);
		return (socket.send.mock.calls[0][0] as Buffer).readUInt16LE(3);
	};

	// STOC emote: [u16 length][u8 opcode][u8 player_type][id]
	const emoteSeat = (position: number, opts: { isTag: boolean; isPositionSwapped: boolean }) => {
		const socket = makeSocket();
		eventEmitter.emit(
			Commands.EMOTE as unknown as string,
			makeEmoteMessage("wave"),
			makeRoom(socket, opts),
			makeDuelist(position),
		);
		return (socket.send.mock.calls[0][0] as Buffer).readUInt8(3);
	};

	it.each([
		[0, 2],
		[1, 3],
		[2, 0],
		[3, 1],
	])("announces Tag seat %i as seat %i in chat and emotes", (position, expected) => {
		const swappedTag = { isTag: true, isPositionSwapped: true };

		expect(chatSeat(position, swappedTag)).toBe(expected);
		expect(emoteSeat(position, swappedTag)).toBe(expected);
	});

	it("still flips the seat with ^ 1 in a swapped single duel", () => {
		const swappedSingle = { isTag: false, isPositionSwapped: true };

		expect(chatSeat(0, swappedSingle)).toBe(1);
		expect(emoteSeat(1, swappedSingle)).toBe(0);
	});

	it("keeps the lobby seat when positions are not swapped", () => {
		const tag = { isTag: true, isPositionSwapped: false };

		expect(chatSeat(2, tag)).toBe(2);
		expect(emoteSeat(3, tag)).toBe(3);
	});
});
