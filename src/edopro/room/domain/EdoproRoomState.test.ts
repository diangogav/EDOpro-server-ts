import { EventEmitter } from "stream";

import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { EdoproRoomState } from "./EdoproRoomState";
import { Commands } from "../../../shared/messages/Commands";
import { RoomType } from "src/shared/room/domain/RoomType";
import { PlayerMessageClientMessage } from "../../messages/server-to-client/PlayerMessageClientMessage";
import { SpectatorMessageClientMessage } from "../../messages/server-to-client/SpectatorMessageClientMessage";

// EdoproRoomState is abstract but declares no abstract members of its own, so a
// bare subclass exercises the CHAT and EMOTE handlers registered in the
// constructor. They are driven through the events, as the runtime does.
class TestRoomState extends EdoproRoomState {}

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

describe("EdoproRoomState — existing-player (nickname taken) rejection", () => {
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

describe("EdoproRoomState — EDOPro chat relay", () => {
	let eventEmitter: EventEmitter;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		new TestRoomState(eventEmitter);
	});

	const makeEdoRoom = (
		players: { socket: { send: jest.Mock }; team: number }[],
		spectators: { socket: { send: jest.Mock } }[],
	) => ({ roomType: RoomType.EDO, players, spectators }) as unknown as never;

	it("sends a duelist's line to teammates as their team and to opponents and spectators as the other team", () => {
		const teammate = { socket: makeSocket(), team: 0 };
		const opponent = { socket: makeSocket(), team: 1 };
		const spectator = { socket: makeSocket() };
		const room = makeEdoRoom([teammate, opponent], [spectator]);
		const sender = { name: "Diango\0", isSpectator: false, team: 0 } as unknown as never;
		const chat = makeChatMessage("hola");

		eventEmitter.emit(Commands.CHAT as unknown as string, chat, room, sender);

		const ownTeamFrame = PlayerMessageClientMessage.create("Diango", chat.data, 0);
		const otherTeamFrame = PlayerMessageClientMessage.create("Diango", chat.data, 1);
		expect(teammate.socket.send).toHaveBeenCalledWith(ownTeamFrame);
		expect(opponent.socket.send).toHaveBeenCalledWith(otherTeamFrame);
		expect(spectator.socket.send).toHaveBeenCalledWith(otherTeamFrame);
	});

	it("sends a spectator's line to every player and spectator as a spectator message", () => {
		const player = { socket: makeSocket(), team: 0 };
		const otherSpectator = { socket: makeSocket() };
		const room = makeEdoRoom([player], [otherSpectator]);
		const sender = { name: "Watcher", isSpectator: true, team: 3 } as unknown as never;
		const chat = makeChatMessage("gg");

		eventEmitter.emit(Commands.CHAT as unknown as string, chat, room, sender);

		const frame = SpectatorMessageClientMessage.create("Watcher", chat.data);
		expect(player.socket.send).toHaveBeenCalledWith(frame);
		expect(otherSpectator.socket.send).toHaveBeenCalledWith(frame);
	});

	it("does not relay emotes in an EDOPro room", () => {
		const socket = makeSocket();
		const room = { roomType: RoomType.EDO, clients: [{ socket }] } as unknown as never;
		const duelist = {
			isSpectator: false,
			position: 0,
			tryEmote: () => true,
		} as unknown as never;

		eventEmitter.emit(Commands.EMOTE as unknown as string, makeEmoteMessage("wave"), room, duelist);

		expect(socket.send).not.toHaveBeenCalled();
	});
});
