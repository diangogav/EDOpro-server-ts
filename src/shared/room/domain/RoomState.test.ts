/**
 * Exercises what RoomState owns for both engines: the match start hooks
 * (EDOPro's DuelingState and Mercury's YGOProDuelingState both call
 * this.notifyDuelStart(this.room)) and the `:score` chat command.
 */
import { EventEmitter } from "stream";
import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { Commands } from "@shared/messages/Commands";

import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { Team } from "@shared/room/Team";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";

import { RoomState } from "./RoomState";

jest.mock("@shared/dependency-injection");
jest.mock("src/web-socket-server/WebSocketSingleton");

import { container } from "@shared/dependency-injection";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";

class TestRoomState extends RoomState {
	public readonly relayedChat = jest.fn();

	protected relayChat(...args: unknown[]): void {
		this.relayedChat(...args);
	}

	public callNotifyDuelStart(room: YgoRoom): void {
		this.notifyDuelStart(room);
	}

	public callNotifyMatchStarting(room: YgoRoom): void {
		this.notifyMatchStarting(room);
	}
}

function makeRoom(overrides: Record<string, unknown> = {}) {
	return {
		id: 4242,
		matchId: "match-uuid-1",
		ranked: true,
		banListName: "TCG",
		isFirstDuel: () => true,
		toRealTimePresentation: () => ({}),
		players: [
			{ id: "p1", team: Team.PLAYER, name: "Diango" },
			{ id: "p2", team: Team.OPPONENT, name: "Rival" },
		],
		clients: [],
		...overrides,
	} as unknown as YgoRoom;
}

describe("RoomState.notifyDuelStart() — MatchLifecycleHooks wiring", () => {
	let runStarted: jest.Mock;

	beforeEach(() => {
		runStarted = jest.fn();
		(container.get as jest.Mock).mockReturnValue({ runStarted } as unknown as MatchLifecycleHooks);
		(WebSocketSingleton.getInstance as jest.Mock).mockReturnValue({ broadcast: jest.fn() });
	});

	it("calls runStarted with a MatchContext built from the room on the first duel", () => {
		const state = new TestRoomState(new EventEmitter());
		const room = makeRoom();

		state.callNotifyDuelStart(room);

		expect(runStarted).toHaveBeenCalledWith(
			expect.objectContaining({
				roomId: 4242,
				matchId: "match-uuid-1",
				ranked: true,
				banListName: "TCG",
				players: [
					{ id: "p1", team: Team.PLAYER, name: "Diango", winner: false },
					{ id: "p2", team: Team.OPPONENT, name: "Rival", winner: false },
				],
			}),
		);
	});

	it("does not call runStarted on a later game of the same match (no repeat)", () => {
		const state = new TestRoomState(new EventEmitter());
		const room = makeRoom({ isFirstDuel: () => false });

		state.callNotifyDuelStart(room);

		expect(runStarted).not.toHaveBeenCalled();
	});

	it("defaults banListName to N/A when the room reports none", () => {
		const state = new TestRoomState(new EventEmitter());
		const room = makeRoom({ banListName: null });

		state.callNotifyDuelStart(room);

		expect(runStarted).toHaveBeenCalledWith(expect.objectContaining({ banListName: "N/A" }));
	});
});

describe("RoomState.notifyMatchStarting() — start hooks at STOC_DUEL_START", () => {
	let runStarted: jest.Mock;

	beforeEach(() => {
		runStarted = jest.fn();
		(container.get as jest.Mock).mockReturnValue({ runStarted } as unknown as MatchLifecycleHooks);
	});

	it("runs the start hooks with the new match's context, before any duel engine exists", () => {
		const state = new TestRoomState(new EventEmitter());

		state.callNotifyMatchStarting(makeRoom());

		expect(runStarted).toHaveBeenCalledTimes(1);
		expect(runStarted).toHaveBeenCalledWith(
			expect.objectContaining({
				roomId: 4242,
				matchId: "match-uuid-1",
				ranked: true,
				banListName: "TCG",
			}),
		);
	});
});

describe("RoomState — :score command", () => {
	let eventEmitter: EventEmitter;

	let state: TestRoomState;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		state = new TestRoomState(eventEmitter);
	});

	it("answers with a WHITE STOC_CHAT frame carrying room.score, not the legacy 0xF3 frame", () => {
		const socket = { send: jest.fn() };
		const room = { score: "Score · Diango 1 – 0 Rival" } as unknown as never;
		const client = { socket } as unknown as never;

		eventEmitter.emit(
			Commands.CHAT as unknown as string,
			{ data: Buffer.from(":score", "utf16le"), previousMessage: Buffer.alloc(0) },
			room,
			client,
		);

		const expectedFrame = Buffer.from(
			new YGOProStocChat()
				.fromPartial({ player_type: ChatColor.WHITE, msg: "Score · Diango 1 – 0 Rival" })
				.toFullPayload(),
		);
		expect(socket.send).toHaveBeenCalledWith(expectedFrame);
		expect(state.relayedChat).not.toHaveBeenCalled();
	});

	it("hands any other line to the engine's chat relay", () => {
		const room = { score: "" } as unknown as never;
		const client = { socket: { send: jest.fn() } } as unknown as never;
		const message = {
			data: Buffer.from("hola", "utf16le"),
			previousMessage: Buffer.alloc(0),
		};

		eventEmitter.emit(Commands.CHAT as unknown as string, message, room, client);

		expect(state.relayedChat).toHaveBeenCalledWith(message, room, client);
	});
});
