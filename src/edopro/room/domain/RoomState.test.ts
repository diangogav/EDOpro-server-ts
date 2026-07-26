import { EventEmitter } from "stream";

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
