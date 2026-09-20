import { container } from "@shared/dependency-injection";
import { EventBus } from "@shared/event-bus/EventBus";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";
import { GameOverDomainEvent } from "@shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { Team } from "@shared/room/Team";
import { Logger } from "@shared/logger/domain/Logger";

import { YGOProRoom } from "../domain/YGOProRoom";
import { EndMatchByAbandon } from "./EndMatchByAbandon";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";

jest.mock("./FinalizeYGOProRoom", () => ({
	FinalizeYGOProRoom: { run: jest.fn() },
}));

describe("EndMatchByAbandon", () => {
	let publish: jest.Mock;
	let runEnding: jest.Mock;
	let logger: jest.Mocked<Logger>;

	const makeRoom = (overrides: Partial<YGOProRoom> = {}) =>
		({
			id: 42,
			matchId: "match-1",
			bestOf: 3,
			ranked: true,
			banListName: "2010.03 Edison",
			edoBanListHash: 1,
			duelIds: ["duel-1"],
			matchPlayersHistory: [],
			finalizing: false,
			isMatchFinished: jest.fn().mockReturnValue(false),
			matchForfeit: jest.fn(),
			players: [],
			clients: [],
			...overrides,
		}) as unknown as jest.Mocked<YGOProRoom>;

	beforeEach(() => {
		jest.clearAllMocks();
		publish = jest.fn();
		runEnding = jest.fn().mockResolvedValue(undefined);
		logger = {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<Logger>;

		jest.spyOn(container, "get").mockImplementation((token: unknown) => {
			if (token === MatchLifecycleHooks) return { runEnding } as unknown as MatchLifecycleHooks;
			if (token === EventBus) return { publish } as unknown as EventBus;
			throw new Error("unexpected token");
		});
	});

	it("awards the match to the team that stayed", async () => {
		const room = makeRoom();

		await EndMatchByAbandon.run(room, Team.OPPONENT, logger);

		expect(room.matchForfeit).toHaveBeenCalledWith(Team.PLAYER);
	});

	it("publishes the game-over event so the result is recorded", async () => {
		const room = makeRoom();

		await EndMatchByAbandon.run(room, Team.OPPONENT, logger);

		expect(publish).toHaveBeenCalledWith(GameOverDomainEvent.DOMAIN_EVENT, expect.anything());
	});

	it("runs the ending hooks before tearing the room down", async () => {
		const room = makeRoom();
		const order: string[] = [];
		runEnding.mockImplementation(() => {
			order.push("ending");
			return Promise.resolve();
		});
		(FinalizeYGOProRoom.run as jest.Mock).mockImplementation(() => order.push("finalize"));

		await EndMatchByAbandon.run(room, Team.OPPONENT, logger);

		expect(order).toEqual(["ending", "finalize"]);
	});

	it("does nothing for a match that already reached a result", async () => {
		const room = makeRoom({ isMatchFinished: jest.fn().mockReturnValue(true) } as never);

		await EndMatchByAbandon.run(room, Team.OPPONENT, logger);

		expect(room.matchForfeit).not.toHaveBeenCalled();
		expect(publish).not.toHaveBeenCalled();
		expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
	});

	it("does nothing for a room already being torn down", async () => {
		const room = makeRoom({ finalizing: true } as never);

		await EndMatchByAbandon.run(room, Team.OPPONENT, logger);

		expect(room.matchForfeit).not.toHaveBeenCalled();
		expect(publish).not.toHaveBeenCalled();
	});
});
