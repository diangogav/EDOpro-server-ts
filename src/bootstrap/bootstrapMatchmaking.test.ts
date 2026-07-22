// Verifies the composition-root wiring: the spawnBot dependency injected into
// MatchmakingQueue must request a bot with a deckOverride taken from the curated
// TCG pool, so a bot dropped into a TCG matchmaking room plays a TCG-legal deck.
//
// All singleton collaborators are mocked so no timers, sockets, or real windbot
// are touched. We capture the deps object passed to MatchmakingQueue.init and
// invoke its spawnBot directly.

import { Logger } from "@shared/logger/domain/Logger";

import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";
import { MATCHMAKING_TCG_BOT_DECKS } from "@ygopro/matchmaking/domain/MatchmakingTcgBotDecks";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import { WindbotModule } from "@ygopro/windbot/application/WindbotModule";

import { bootstrapMatchmaking } from "./bootstrapMatchmaking";

jest.mock("@ygopro/matchmaking/application/MatchmakingRoomFactory", () => ({
	createMatchmakingRoom: jest.fn(),
}));
jest.mock("@ygopro/room/application/FinalizeYGOProRoom", () => ({
	FinalizeYGOProRoom: { run: jest.fn() },
}));

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

describe("bootstrapMatchmaking — spawnBot TCG deck wiring", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	function captureSpawnBot(): (roomId: number) => void {
		const captured: { spawnBot?: (roomId: number) => void } = {};
		jest.spyOn(MatchmakingQueue, "init").mockImplementation((d) => {
			captured.spawnBot = (d as unknown as { spawnBot: (roomId: number) => void }).spawnBot;
		});
		jest
			.spyOn(MatchmakingQueue, "getInstance")
			.mockReturnValue({ start: jest.fn() } as unknown as MatchmakingQueue);

		bootstrapMatchmaking(fakeLogger());

		if (!captured.spawnBot) throw new Error("MatchmakingQueue.init was not called");
		return captured.spawnBot;
	}

	it("requests a bot with a deckOverride from the TCG pool", () => {
		const requestBot = jest.fn().mockResolvedValue({ bot: { name: "Bot", deck: "x" } });
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
		spawnBot(123);

		expect(requestBot).toHaveBeenCalledTimes(1);
		const [roomId, botName, isFinalizing, deckOverride] = requestBot.mock.calls[0];
		expect(roomId).toBe(123);
		expect(botName).toBeNull();
		expect(typeof isFinalizing).toBe("function");
		expect(MATCHMAKING_TCG_BOT_DECKS).toContain(deckOverride);
	});

	it("is a no-op when windbot is not initialized", () => {
		jest.spyOn(WindbotModule, "isInitialized").mockReturnValue(false);
		const getInstance = jest.spyOn(WindbotModule, "getInstance");

		const spawnBot = captureSpawnBot();
		spawnBot(123);

		expect(getInstance).not.toHaveBeenCalled();
	});
});
