/**
 * Exercises YGOProDuelingState.determineNextPhase()'s match-finished branch:
 * MatchLifecycleHooks.runEnding must be awaited with a MatchContext built
 * from the room BEFORE finalizeWithReplays() starts tearing down sockets.
 *
 * determineNextPhase is private and the real constructor spins up an
 * OCGCore worker, so this stands up a prototype instance (same pattern as
 * YGOProDuelingStateEvrp.test.ts / YGOProRoomStateCoherence.test.ts) with
 * room/logger injected and finalizeWithReplays/dispatchGameOverDomainEvent/
 * removeRoom replaced by call-order-recording spies.
 */
import { Logger } from "@shared/logger/domain/Logger";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";
import { Team } from "@shared/room/Team";

import { YGOProDuelingState } from "./YGOProDuelingState";

jest.mock("@shared/dependency-injection");

import { container } from "@shared/dependency-injection";

type TestableDuelingState = {
	determineNextPhase(winner: number): Promise<void>;
};

function buildState(room: object, logger: Logger): TestableDuelingState {
	const state = Object.create(YGOProDuelingState.prototype);
	Object.assign(state, { room, logger });
	return state as TestableDuelingState;
}

function makeRoom(overrides: Record<string, unknown> = {}) {
	return {
		id: 4242,
		ranked: true,
		bestOf: 1,
		banListName: "TCG",
		matchPlayersHistory: [
			{ id: "p1", team: Team.PLAYER, name: "Diango", winner: true, games: [], score: 1 },
			{ id: "p2", team: Team.OPPONENT, name: "Rival", winner: false, games: [], score: 0 },
		],
		matchScore: () => ({ team0: 1, team1: 0 }),
		isMatchFinished: () => true,
		...overrides,
	};
}

describe("YGOProDuelingState.determineNextPhase() — match-finished branch", () => {
	let calls: string[];
	let runEnding: jest.Mock;

	beforeEach(() => {
		calls = [];
		runEnding = jest.fn().mockImplementation(async () => {
			calls.push("runEnding");
		});
		(container.get as jest.Mock).mockReturnValue({ runEnding } as unknown as MatchLifecycleHooks);
	});

	it("awaits MatchLifecycleHooks.runEnding before finalizeWithReplays()", async () => {
		const room = makeRoom();
		const state = buildState(room, { info: jest.fn() } as unknown as Logger);
		Object.assign(state, {
			finalizeWithReplays: jest.fn().mockImplementation(async () => {
				calls.push("finalizeWithReplays");
			}),
			dispatchGameOverDomainEvent: jest.fn(),
			removeRoom: jest.fn(),
		});

		await state.determineNextPhase(Team.PLAYER);

		expect(calls).toEqual(["runEnding", "finalizeWithReplays"]);
	});

	it("builds the MatchContext from the room's ranked/banlist/match history", async () => {
		const room = makeRoom();
		const state = buildState(room, { info: jest.fn() } as unknown as Logger);
		Object.assign(state, {
			finalizeWithReplays: jest.fn().mockResolvedValue(undefined),
			dispatchGameOverDomainEvent: jest.fn(),
			removeRoom: jest.fn(),
		});

		await state.determineNextPhase(Team.PLAYER);

		expect(runEnding).toHaveBeenCalledWith(
			expect.objectContaining({
				roomId: 4242,
				ranked: true,
				banListName: "TCG",
				players: [
					{ id: "p1", team: Team.PLAYER, name: "Diango", winner: true },
					{ id: "p2", team: Team.OPPONENT, name: "Rival", winner: false },
				],
			}),
		);
	});

	it("defaults banListName to N/A when the room has none", async () => {
		const room = makeRoom({ banListName: null });
		const state = buildState(room, { info: jest.fn() } as unknown as Logger);
		Object.assign(state, {
			finalizeWithReplays: jest.fn().mockResolvedValue(undefined),
			dispatchGameOverDomainEvent: jest.fn(),
			removeRoom: jest.fn(),
		});

		await state.determineNextPhase(Team.PLAYER);

		expect(runEnding).toHaveBeenCalledWith(expect.objectContaining({ banListName: "N/A" }));
	});

	it("does not call runEnding when the match is not finished (side-decking branch)", async () => {
		const room = makeRoom({
			isMatchFinished: () => false,
			matchScore: () => ({ team0: 1, team1: 1 }),
		});
		const state = buildState(room, { info: jest.fn() } as unknown as Logger);
		Object.assign(state, {
			transitionToSideDecking: jest.fn(),
		});

		await state.determineNextPhase(Team.PLAYER);

		expect(runEnding).not.toHaveBeenCalled();
	});
});
