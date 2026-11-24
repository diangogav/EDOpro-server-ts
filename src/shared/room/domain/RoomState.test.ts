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

import { config } from "src/config";
import { YgoClient } from "@shared/client/domain/YgoClient";
import { ClientMother } from "@test-support/mothers/client/ClientMother";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";

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

describe("RoomState — verified account chat gate", () => {
	const NOTICE =
		"Verify your email to chat: log in at evolutionygo.com and confirm it from your profile.";
	const originalChatRequired = config.verifiedAccount.chatRequired;

	let eventEmitter: EventEmitter;
	let state: TestRoomState;

	class BotClient extends YgoClient {
		public override get isInternal(): boolean {
			return true;
		}
	}

	const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

	const chatLine = (text: string) => ({
		data: Buffer.from(text, "utf16le"),
		previousMessage: Buffer.alloc(0),
	});

	const noticeFrame = (): Buffer =>
		Buffer.from(
			new YGOProStocChat().fromPartial({ player_type: ChatColor.RED, msg: NOTICE }).toFullPayload(),
		);

	function makeClient(verified: boolean | null): {
		client: YgoClient;
		send: jest.SpyInstance;
		socket: SocketMock;
	} {
		const socket = new SocketMock();
		const send = jest.spyOn(socket, "send");
		const client = ClientMother.create({ socket });
		if (verified !== null) {
			client.setAccountVerification(Promise.resolve(verified));
		}

		return { client, send, socket };
	}

	function sendChat(text: string, room: YgoRoom, client: YgoClient) {
		const message = chatLine(text);
		eventEmitter.emit(Commands.CHAT as unknown as string, message, room, client);

		return message;
	}

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		state = new TestRoomState(eventEmitter);
	});

	afterEach(() => {
		config.verifiedAccount.chatRequired = originalChatRequired;
	});

	describe("with the gate off", () => {
		beforeEach(() => {
			config.verifiedAccount.chatRequired = false;
		});

		it("relays an unverified client's line right away", () => {
			const { client } = makeClient(false);
			const room = makeRoom();

			const message = sendChat("hola", room, client);

			expect(state.relayedChat).toHaveBeenCalledWith(message, room, client);
		});

		it("still answers :score privately without relaying it", () => {
			const { client, send } = makeClient(false);
			const room = makeRoom({ score: "Score 1 - 0" });

			sendChat(":score", room, client);

			expect(send).toHaveBeenCalledTimes(1);
			expect(state.relayedChat).not.toHaveBeenCalled();
		});
	});

	describe("with the gate on", () => {
		beforeEach(() => {
			config.verifiedAccount.chatRequired = true;
		});

		it("relays a verified client's line", async () => {
			const { client, send } = makeClient(true);
			const room = makeRoom();

			const message = sendChat("hola", room, client);
			await flush();

			expect(state.relayedChat).toHaveBeenCalledWith(message, room, client);
			expect(send).not.toHaveBeenCalled();
		});

		it("blocks an unverified client's line and tells only the sender", async () => {
			const { client, send } = makeClient(false);
			const other = makeClient(true);
			const room = makeRoom({ clients: [client, other.client] });

			sendChat("hola", room, client);
			await flush();

			expect(state.relayedChat).not.toHaveBeenCalled();
			expect(send).toHaveBeenCalledTimes(1);
			expect(send).toHaveBeenCalledWith(noticeFrame());
			expect(other.send).not.toHaveBeenCalled();
		});

		it("blocks a guest whose verification was never set", async () => {
			const { client, send } = makeClient(null);

			sendChat("hola", makeRoom(), client);
			await flush();

			expect(state.relayedChat).not.toHaveBeenCalled();
			expect(send).toHaveBeenCalledWith(noticeFrame());
		});

		it("relays a bot's line without checking its verification", () => {
			const socket = new SocketMock();
			const bot = new BotClient({
				name: "AI",
				position: 1,
				team: 1,
				socket,
				host: false,
				id: null,
			});
			const room = makeRoom();

			const message = sendChat("gg", room, bot);

			expect(state.relayedChat).toHaveBeenCalledWith(message, room, bot);
		});

		it("still answers :score for an unverified client", () => {
			const { client, send } = makeClient(false);

			sendChat(":score", makeRoom({ score: "Score 1 - 0" }), client);

			expect(send).toHaveBeenCalledTimes(1);
			expect(send).not.toHaveBeenCalledWith(noticeFrame());
			expect(state.relayedChat).not.toHaveBeenCalled();
		});

		it("sends nothing when the sender disconnected before the verification resolved", async () => {
			const { client, send, socket } = makeClient(false);
			socket.closed = true;

			sendChat("hola", makeRoom(), client);
			await flush();

			expect(send).not.toHaveBeenCalled();
			expect(state.relayedChat).not.toHaveBeenCalled();
		});

		it("does not leak a rejection when the notice cannot be sent", async () => {
			const { client, send } = makeClient(false);
			send.mockImplementation(() => {
				throw new Error("socket gone");
			});
			const unhandled = jest.fn();
			process.on("unhandledRejection", unhandled);

			sendChat("hola", makeRoom(), client);
			await flush();
			await flush();
			process.off("unhandledRejection", unhandled);

			expect(unhandled).not.toHaveBeenCalled();
		});

		it("relays one client's lines in the order they were sent", async () => {
			const { client } = makeClient(null);
			let resolveVerification: (verified: boolean) => void = () => undefined;
			client.setAccountVerification(
				new Promise<boolean>((resolve) => {
					resolveVerification = resolve;
				}),
			);
			const room = makeRoom();

			const first = sendChat("one", room, client);
			const second = sendChat("two", room, client);
			resolveVerification(true);
			await flush();

			expect(state.relayedChat.mock.calls.map((call) => call[0])).toEqual([first, second]);
		});
	});
});
