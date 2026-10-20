/**
 * A player who drops mid-duel and never returns must not strand the match: the
 * room's own clock for that player keeps running without a socket, expires,
 * and finishes the duel against them. When it was the deciding duel the match
 * ends through the lifecycle hooks with the recorded result.
 */
import "reflect-metadata";

import { container } from "@shared/dependency-injection";
import { EventBus } from "@shared/event-bus/EventBus";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";
import { DuelState } from "@shared/room/domain/YgoRoom";
import { Team } from "@shared/room/Team";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { ClientMother } from "@test-support/mothers/client/ClientMother";
import { RoomMother } from "@test-support/mothers/room/RoomMother";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";
import { Room } from "./Room";
import RoomList from "../infrastructure/RoomList";

jest.mock("@shared/dependency-injection");
jest.mock("@shared/event-bus/EventBus");
jest.mock("../../../web-socket-server/WebSocketSingleton");

const TIME_LIMIT_S = 5;

function buildRoom(bestOf: number, ranked: boolean) {
	const room: Room = RoomMother.create({
		id: 4001,
		bestOf,
		ranked,
		timeLimit: TIME_LIMIT_S,
		team0: 1,
		team1: 1,
	});
	const goneSocket = new SocketMock();
	const hereSocket = new SocketMock();
	const gone = ClientMother.create({
		id: "gone",
		name: "Gone",
		team: Team.PLAYER,
		position: 0,
		socket: goneSocket,
	});
	const here = ClientMother.create({
		id: "here",
		name: "Here",
		team: Team.OPPONENT,
		position: 1,
		socket: hereSocket,
	});
	room.addPlayerUnsafe(gone);
	room.addPlayerUnsafe(here);
	room.createMatch();
	jest.spyOn(room.replay, "serialize").mockResolvedValue(Buffer.from("replay"));
	goneSocket.closed = true;

	return room;
}

async function flush(): Promise<void> {
	for (let i = 0; i < 20; i++) {
		await Promise.resolve();
	}
}

describe("mid-duel no-show settlement (EDOpro)", () => {
	let runEnding: jest.Mock;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(1000);
		runEnding = jest.fn().mockResolvedValue(undefined);
		(container.get as jest.Mock).mockImplementation((token: unknown) =>
			token === MatchLifecycleHooks ? { runEnding } : { publish: jest.fn() },
		);
		(WebSocketSingleton.getInstance as jest.Mock).mockReturnValue({ broadcast: jest.fn() });
		jest.spyOn(RoomList, "deleteRoom").mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it("expires the clock of an absent player and records the match as lost", async () => {
		const room = buildRoom(1, true);

		room.resetTimer(Team.PLAYER, TIME_LIMIT_S);
		await jest.advanceTimersByTimeAsync(TIME_LIMIT_S * 1000 - 1000);
		await flush();
		expect(runEnding).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(2000);
		await flush();

		expect(runEnding).toHaveBeenCalledTimes(1);
		expect(runEnding).toHaveBeenCalledWith(
			expect.objectContaining({
				matchId: room.matchId,
				ranked: true,
				players: [
					{ id: "gone", team: Team.PLAYER, name: "Gone", winner: false },
					{ id: "here", team: Team.OPPONENT, name: "Here", winner: true },
				],
			}),
		);
		expect(RoomList.deleteRoom).toHaveBeenCalledWith(room);
	});

	it("counts the lost duel and moves a best-of-three to side decking", async () => {
		const room = buildRoom(3, true);

		room.resetTimer(Team.PLAYER, TIME_LIMIT_S);
		await jest.advanceTimersByTimeAsync(TIME_LIMIT_S * 1000 + 1000);
		await flush();

		expect(runEnding).not.toHaveBeenCalled();
		expect(room.matchScore()).toEqual({ team0: 0, team1: 1 });
		expect(room.duelState).toBe(DuelState.SIDE_DECKING);
	});
});
