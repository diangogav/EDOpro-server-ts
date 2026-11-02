import { RoomMother } from "@test-support/mothers/room/RoomMother";

import { FinishDuelHandler } from "../application/FinishDuelHandler";
import RoomList from "../infrastructure/RoomList";
import { DuelFinishReason } from "./DuelFinishReason";

jest.mock("../application/FinishDuelHandler");
jest.mock("../infrastructure/RoomList");

const FinishDuelHandlerMock = FinishDuelHandler as jest.MockedClass<typeof FinishDuelHandler>;

describe("Room timers", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		FinishDuelHandlerMock.mockClear();
		(RoomList.deleteRoom as jest.Mock).mockClear();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it.each([
		[0, 1],
		[1, 0],
	])("ends the duel by timeout when team %i runs out of time, with team %i as the winner", (team, winner) => {
		const room = RoomMother.create({ timeLimit: 3 });

		room.startTimer(team);
		jest.advanceTimersByTime(4_000);

		expect(FinishDuelHandlerMock).toHaveBeenCalledTimes(1);
		expect(FinishDuelHandlerMock).toHaveBeenCalledWith({
			reason: DuelFinishReason.TIMEOUT,
			winner,
			room,
		});
		expect(FinishDuelHandlerMock.mock.instances[0].run).toHaveBeenCalledTimes(1);
	});

	it("does not end the duel while the team still has time", () => {
		const room = RoomMother.create({ timeLimit: 3 });

		room.startTimer(0);
		jest.advanceTimersByTime(2_000);

		expect(FinishDuelHandlerMock).not.toHaveBeenCalled();
	});

	it("removes the room from the room list once the room timer runs out", () => {
		const room = RoomMother.create({ timeLimit: 3 });

		room.startRoomTimer();
		jest.advanceTimersByTime(5_000);
		expect(RoomList.deleteRoom).not.toHaveBeenCalled();

		jest.advanceTimersByTime(2_000);
		expect(RoomList.deleteRoom).toHaveBeenCalledTimes(1);
		expect(RoomList.deleteRoom).toHaveBeenCalledWith(room);
	});
});
