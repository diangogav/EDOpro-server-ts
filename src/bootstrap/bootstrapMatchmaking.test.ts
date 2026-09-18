// Verifies the composition-root wiring: the spawnBot dependency injected into
// MatchmakingQueue must request a bot using a (name, deck) identity pair from the
// per-format roster. The bot is requested with an EXPLICIT name and a deckOverride
// equal to the roster pair's deck.
//
// All singleton collaborators are mocked so no timers, sockets, or real windbot
// are touched. We capture the deps object passed to MatchmakingQueue.init and
// invoke its spawnBot directly.

import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";

import { Commands } from "@shared/messages/Commands";
import { buildStocMatchmakingStatusFrame } from "@ygopro/matchmaking/protocol/matchmaking-protocol";
import {
	MatchmakingQueue,
	MatchmakingQueueDeps,
} from "@ygopro/matchmaking/application/MatchmakingQueue";
import { MATCHMAKING_BOT_ROSTER } from "@ygopro/matchmaking/domain/MatchmakingBotRoster";
import { MatchmakingFormat } from "@ygopro/matchmaking/domain/QueueEntry";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import { WindbotModule } from "@ygopro/windbot/application/WindbotModule";

import { bootstrapMatchmaking } from "./bootstrapMatchmaking";

jest.mock("@ygopro/matchmaking/application/MatchmakingRoomFactory", () => ({
	createMatchmakingRoom: jest.fn(),
}));
jest.mock("@ygopro/room/application/FinalizeYGOProRoom", () => ({
	FinalizeYGOProRoom: { run: jest.fn() },
}));
jest.mock("@shared/ticket/infrastructure/redis/RedisTicketRepository");
jest.mock("@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository");

function fakeLogger(): Logger {
	const logger = {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		child: jest.fn(),
	} as unknown as Logger;
	(logger.child as jest.Mock).mockReturnValue(logger);
	return logger;
}

describe("bootstrapMatchmaking — spawnBot roster identity-pair wiring", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	function captureSpawnBot(): (roomId: number, format: MatchmakingFormat) => void {
		const captured: { spawnBot?: (roomId: number, format: MatchmakingFormat) => void } = {};
		jest.spyOn(MatchmakingQueue, "init").mockImplementation((d) => {
			captured.spawnBot = (
				d as unknown as { spawnBot: (roomId: number, format: MatchmakingFormat) => void }
			).spawnBot;
		});
		jest
			.spyOn(MatchmakingQueue, "getInstance")
			.mockReturnValue({ start: jest.fn() } as unknown as MatchmakingQueue);

		bootstrapMatchmaking(fakeLogger());

		if (!captured.spawnBot) throw new Error("MatchmakingQueue.init was not called");
		return captured.spawnBot;
	}

	it("requests a TCG bot with explicit name and deckOverride from the TCG roster", () => {
		const requestBot = jest
			.fn()
			.mockResolvedValue({ bot: { name: "Salamangreat", deck: "Salamangreat" } });
		jest.spyOn(WindbotModule, "isInitialized").mockReturnValue(true);
		jest.spyOn(WindbotModule, "getInstance").mockReturnValue({
			isEnabled: () => true,
			requestBot,
		} as unknown as WindbotModule);
		jest
			.spyOn(YGOProRoomList, "findById")
			.mockReturnValue({ finalizing: false } as unknown as ReturnType<
				typeof YGOProRoomList.findById
			>);

		const spawnBot = captureSpawnBot();
		spawnBot(123, "tcg");

		expect(requestBot).toHaveBeenCalledTimes(1);
		const [roomId, botName, isFinalizing, deckOverride] = requestBot.mock.calls[0];
		expect(roomId).toBe(123);
		// Explicit name from the roster (not null)
		expect(typeof botName).toBe("string");
		expect(botName.length).toBeGreaterThan(0);
		expect(typeof isFinalizing).toBe("function");
		// deckOverride must be from the TCG roster
		const tcgDecks = MATCHMAKING_BOT_ROSTER.tcg.map((p) => p.deck);
		expect(tcgDecks).toContain(deckOverride);
		// name and deck must come from the SAME pair
		const pair = MATCHMAKING_BOT_ROSTER.tcg.find((p) => p.name === botName);
		expect(pair).toBeDefined();
		expect(pair?.deck).toBe(deckOverride);
	});

	it("requests a JTP bot with explicit name and deckOverride from the JTP roster", () => {
		const requestBot = jest.fn().mockResolvedValue({ bot: { name: "Joey", deck: "JTP" } });
		jest.spyOn(WindbotModule, "isInitialized").mockReturnValue(true);
		jest.spyOn(WindbotModule, "getInstance").mockReturnValue({
			isEnabled: () => true,
			requestBot,
		} as unknown as WindbotModule);
		jest
			.spyOn(YGOProRoomList, "findById")
			.mockReturnValue({ finalizing: false } as unknown as ReturnType<
				typeof YGOProRoomList.findById
			>);

		const spawnBot = captureSpawnBot();
		spawnBot(456, "jtp");

		expect(requestBot).toHaveBeenCalledTimes(1);
		const [roomId, botName, isFinalizing, deckOverride] = requestBot.mock.calls[0];
		expect(roomId).toBe(456);
		expect(typeof botName).toBe("string");
		expect(typeof isFinalizing).toBe("function");
		// deckOverride must be from the JTP roster
		const jtpDecks = MATCHMAKING_BOT_ROSTER.jtp.map((p) => p.deck);
		expect(jtpDecks).toContain(deckOverride);
		// name and deck must come from the SAME pair
		const pair = MATCHMAKING_BOT_ROSTER.jtp.find((p) => p.name === botName);
		expect(pair).toBeDefined();
		expect(pair?.deck).toBe(deckOverride);
	});

	it("is a no-op when windbot is not initialized", () => {
		jest.spyOn(WindbotModule, "isInitialized").mockReturnValue(false);
		const getInstance = jest.spyOn(WindbotModule, "getInstance");

		const spawnBot = captureSpawnBot();
		spawnBot(123, "tcg");

		expect(getInstance).not.toHaveBeenCalled();
	});
});

describe("bootstrapMatchmaking — connection factory", () => {
	afterEach(() => {
		MatchmakingQueue.resetForTests();
		jest.restoreAllMocks();
	});

	it("returns a MatchmakingConnectionFactory", () => {
		const factory = bootstrapMatchmaking(fakeLogger());

		expect(typeof factory).toBe("function");
	});

	it("answers the three CTOS opcodes with rejected/internal_error when matchmaking is not initialized", () => {
		const factory = bootstrapMatchmaking(fakeLogger());
		// Simulates the singleton becoming unavailable after bootstrap captured
		// the factory — the guard this scenario proves is defensive, not a path
		// index.ts's own composition order ever takes.
		MatchmakingQueue.resetForTests();

		const socket = new SocketMock();
		const send = jest.spyOn(socket, "send");
		const eventEmitter = new EventEmitter();
		factory(socket, eventEmitter);

		eventEmitter.emit(Commands.MATCHMAKING_AUTH as unknown as string, { data: Buffer.alloc(0) });
		eventEmitter.emit(Commands.MATCHMAKING_ENTER as unknown as string, { data: Buffer.alloc(0) });
		eventEmitter.emit(Commands.MATCHMAKING_CANCEL as unknown as string, { data: Buffer.alloc(0) });

		const expectedFrame = buildStocMatchmakingStatusFrame("rejected", 0, "internal_error");
		expect(send).toHaveBeenCalledTimes(3);
		for (const call of send.mock.calls) {
			expect(call[0]).toEqual(expectedFrame);
		}
	});
});
