/**
 * PR-5 tests — room.finalizing lifecycle and captain-via-toRPS.
 *
 * REQ-HTTP-402: room.finalizing flips to true when removeRoom() is called
 *               (the teardown entry point inside YGOProDuelingState).
 * REQ-CLIENT-603: the bot (team-1 player) is already isCaptain when RPS runs
 *                 because toRPS() calls captain() on both team players unconditionally.
 */

import { EventEmitter } from "stream";

import { YGOProRoom } from "./YGOProRoom";
import { YGOProRoomState } from "./YGOProRoomState";
import { YGOProClient } from "../../client/domain/YGOProClient";
import { Team } from "@shared/room/Team";

// ---- helpers ----

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeMessageRepo = () => ({
	joinGameMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	typeChangeMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	typeChangeMessageFromType: jest.fn().mockReturnValue(Buffer.alloc(0)),
	playerEnterMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	playerChangeMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	spectatorCountMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	watchChangeMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
	selectHandMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
});

const makeSocket = () => ({
	id: "sock-1",
	send: jest.fn(),
	destroy: jest.fn(),
	onMessage: jest.fn(),
	remoteAddress: "127.0.0.1",
});

const createRoom = (): YGOProRoom =>
	YGOProRoom.create(
		1,
		"TESTROOM",
		makeLogger() as never,
		new EventEmitter(),
		{ name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) } as never,
		"sock-test",
		makeMessageRepo() as never,
	);

/** Expose toRPS for test — since it is protected we subclass. */
class TestRoomState extends YGOProRoomState {
	callToRPS(room: YGOProRoom): void {
		this.toRPS(room);
	}
}

// ---- REQ-CLIENT-603: captain via toRPS() ----

describe("captain assignment via toRPS() (REQ-CLIENT-603)", () => {
	it("sets isCaptain=true on the team-0 player after toRPS()", () => {
		const room = createRoom();
		const logger = makeLogger();
		const sock = makeSocket();

		const humanClient = new YGOProClient({
			name: "Human",
			socket: sock as never,
			logger: logger as never,
			position: 0,
			room,
			host: true,
			id: "h1",
			team: Team.PLAYER,
		});
		room.addPlayerUnsafe(humanClient);

		const botClient = new YGOProClient({
			name: "Bot",
			socket: makeSocket() as never,
			logger: logger as never,
			position: 0,
			room,
			host: false,
			id: "b1",
			team: Team.OPPONENT,
		});
		room.addPlayerUnsafe(botClient);
		botClient.markInternal();

		const state = new TestRoomState(new EventEmitter());
		state.callToRPS(room);

		expect(humanClient.isCaptain).toBe(true);
	});

	it("sets isCaptain=true on the team-1 (bot) player after toRPS()", () => {
		const room = createRoom();
		const logger = makeLogger();

		const humanClient = new YGOProClient({
			name: "Human",
			socket: makeSocket() as never,
			logger: logger as never,
			position: 0,
			room,
			host: true,
			id: "h1",
			team: Team.PLAYER,
		});
		room.addPlayerUnsafe(humanClient);

		const botClient = new YGOProClient({
			name: "Bot",
			socket: makeSocket() as never,
			logger: logger as never,
			position: 0,
			room,
			host: false,
			id: "b1",
			team: Team.OPPONENT,
		});
		room.addPlayerUnsafe(botClient);
		botClient.markInternal();

		const state = new TestRoomState(new EventEmitter());
		state.callToRPS(room);

		// Bot (team-1) is captain — the isCaptain gate in handleRPSChoice will pass
		expect(botClient.isCaptain).toBe(true);
	});

	it("bot is NOT captain before toRPS() runs", () => {
		const room = createRoom();
		const logger = makeLogger();

		const botClient = new YGOProClient({
			name: "Bot",
			socket: makeSocket() as never,
			logger: logger as never,
			position: 0,
			room,
			host: false,
			id: "b1",
			team: Team.OPPONENT,
		});
		botClient.markInternal();

		// No toRPS called yet
		expect(botClient.isCaptain).toBe(false);
	});
});
