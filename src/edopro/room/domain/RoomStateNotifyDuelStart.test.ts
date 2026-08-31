/**
 * Exercises RoomState.notifyDuelStart()'s MatchLifecycleHooks.runStarted
 * wiring — shared by both server pipelines (legacy edopro's DuelingState and
 * Mercury's YGOProDuelingState both call this.notifyDuelStart(this.room)).
 */
import { EventEmitter } from "stream";

import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { Team } from "@shared/room/Team";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";

import { RoomState } from "./RoomState";

jest.mock("@shared/dependency-injection");
jest.mock("src/web-socket-server/WebSocketSingleton");

import { container } from "@shared/dependency-injection";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";

class TestRoomState extends RoomState {
	public callNotifyDuelStart(room: YgoRoom): void {
		this.notifyDuelStart(room);
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
