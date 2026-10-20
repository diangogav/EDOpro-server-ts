/**
 * A player who drops mid-duel and never returns must not strand the match: the
 * server-side response clock keeps running while the socket is gone, expires,
 * and settles the duel against the absentee. When that was the deciding duel the
 * match ends through the lifecycle hooks with the recorded result; otherwise
 * the room moves on to side decking.
 */
import { Logger } from "@shared/logger/domain/Logger";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";
import { Match } from "@shared/room/domain/match/domain/Match";
import { Team } from "@shared/room/Team";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { OCGCore } from "@ygopro/ocgcore-worker/ocgcore";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import { mock } from "jest-mock-extended";
import { YGOProMsgWin } from "ygopro-msg-encode";

import { YGOProDuelingState } from "./YGOProDuelingState";

jest.mock("@ygopro/ocgcore-worker/ocgcore-worker", () => ({}));
jest.mock("@ygopro/ygopro", () => ({}));
jest.mock("@ygopro/room/domain/DuelRecord", () => ({}));
jest.mock("@shared/dependency-injection");

import { container } from "@shared/dependency-injection";

const TIME_LIMIT_S = 180;

type TestableState = {
	handleWinCondition(msg: YGOProMsgWin): Promise<void>;
};

type TestableCore = {
	setResponseTimer(team: number): Promise<void>;
};

function buildScenario(bestOf: number, ranked: boolean) {
	const absent = mock<YGOProClient>({ position: 0, team: Team.PLAYER, id: "absent", name: "Gone" });
	const present = mock<YGOProClient>({
		position: 1,
		team: Team.OPPONENT,
		id: "present",
		name: "Here",
	});
	Object.assign(absent, { socket: { closed: true, remoteAddress: undefined } });
	Object.assign(present, { socket: { closed: false, remoteAddress: undefined } });
	const players = [absent, present];

	const match = new Match({ bestOf });
	match.initializeHistoricalData(
		players.map((p) => ({ id: p.id as string, team: p.team, name: p.name })),
	);

	const state = Object.create(YGOProDuelingState.prototype) as TestableState &
		Record<string, unknown>;
	const room = mock<YGOProRoom>();
	Object.assign(room, {
		id: 77,
		matchId: "match-77",
		ranked,
		bestOf,
		banListName: "TCG",
		turn: 3,
		players,
		spectators: [],
		clients: players,
		isTag: false,
		isPositionSwapped: false,
		hostInfo: { time_limit: TIME_LIMIT_S },
		currentDuelRecord: undefined,
		messageSender: { winMessage: jest.fn().mockReturnValue(Buffer.alloc(0)) },
	});
	room.getTeamPlayers.mockImplementation((team) => players.filter((p) => p.team === team));
	room.isFinished.mockReturnValue(false);
	room.duelWinner.mockImplementation((winner) => match.duelWinner(winner, 3, []));
	room.isMatchFinished.mockImplementation(() => match.isFinished());
	room.matchScore.mockImplementation(() => match.score);
	Object.defineProperty(room, "matchPlayersHistory", { get: () => match.playersHistory });

	const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as Logger;
	const core = new OCGCore(room, logger);
	core.resetResponseRequestState();
	room.emitRoomEvent.mockImplementation((event: string, msg: unknown) => {
		if (event === "FINISH_DUEL_BY_TIMEOUT") {
			void state.handleWinCondition(msg as YGOProMsgWin);
		}
		return true;
	});

	const runEnding = jest.fn().mockResolvedValue(undefined);
	(container.get as jest.Mock).mockReturnValue({ runEnding } as unknown as MatchLifecycleHooks);

	Object.assign(state, {
		room,
		logger,
		ocgCore: core,
		finalizeWithReplays: jest.fn().mockResolvedValue(undefined),
		dispatchGameOverDomainEvent: jest.fn(),
		removeRoom: jest.fn(),
		transitionToSideDecking: jest.fn(),
	});

	return { state, room, core: core as unknown as TestableCore, runEnding };
}

async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

describe("mid-duel no-show settlement (YGOPro)", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(1000);
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	it("keeps the clock of an absent player running and records the match when it expires", async () => {
		const { state, core, runEnding } = buildScenario(1, true);

		await core.setResponseTimer(Team.PLAYER);
		await jest.advanceTimersByTimeAsync(TIME_LIMIT_S * 1000 - 1);
		await flush();
		expect(runEnding).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(1);
		await flush();

		expect(runEnding).toHaveBeenCalledTimes(1);
		expect(runEnding).toHaveBeenCalledWith(
			expect.objectContaining({
				matchId: "match-77",
				ranked: true,
				players: [
					{ id: "absent", team: Team.PLAYER, name: "Gone", winner: false },
					{ id: "present", team: Team.OPPONENT, name: "Here", winner: true },
				],
			}),
		);
		expect(
			(state as unknown as { finalizeWithReplays: jest.Mock }).finalizeWithReplays,
		).toHaveBeenCalled();
		expect((state as unknown as { removeRoom: jest.Mock }).removeRoom).toHaveBeenCalled();
	});

	it("moves a best-of-three on to side decking with the absentee's loss counted", async () => {
		const { room, state, core, runEnding } = buildScenario(3, true);

		await core.setResponseTimer(Team.PLAYER);
		await jest.advanceTimersByTimeAsync(TIME_LIMIT_S * 1000);
		await flush();

		expect(runEnding).not.toHaveBeenCalled();
		expect(room.matchScore()).toEqual({ team0: 0, team1: 1 });
		expect(
			(state as unknown as { transitionToSideDecking: jest.Mock }).transitionToSideDecking,
		).toHaveBeenCalledWith(Team.OPPONENT);
	});
});
