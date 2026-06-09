import { EventEmitter } from "stream";

import { RoomState } from "./RoomState";
import { Commands } from "../../../shared/messages/Commands";
import { RoomType } from "src/shared/room/domain/RoomType";

// RoomState is abstract but declares no abstract members — a bare concrete
// subclass is enough to exercise the inherited CHAT handler (registered in the
// constructor). handleChat/handleMercuryChat are private, so we drive them
// through the "CHAT" event, exactly as the runtime does.
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

const makeMercuryRoom = (socket: { send: jest.Mock }) =>
	({
		roomType: RoomType.MERCURY,
		isPositionSwapped: false,
		clients: [{ socket }],
	} as unknown as never);

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

		eventEmitter.emit(
			Commands.CHAT as unknown as string,
			makeChatMessage("hola"),
			room,
			spectator,
		);

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

		eventEmitter.emit(
			Commands.CHAT as unknown as string,
			makeChatMessage("hola"),
			room,
			player,
		);

		expect(socket.send).toHaveBeenCalled();
		const sent = socket.send.mock.calls[0][0] as Buffer;
		expect(sent.includes(Buffer.from("Jugador A: hola", "utf16le"))).toBe(false);
		expect(sent.includes(Buffer.from("hola", "utf16le"))).toBe(true);
	});
});
