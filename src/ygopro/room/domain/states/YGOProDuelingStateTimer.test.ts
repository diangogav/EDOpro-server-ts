import { mock } from "jest-mock-extended";
import { YGOProMsgSelectYesNo } from "ygopro-msg-encode";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { OCGCore } from "@ygopro/ocgcore-worker/ocgcore";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import { YGOProDuelingState } from "./YGOProDuelingState";

jest.mock("@ygopro/ocgcore-worker/ocgcore-worker", () => ({}));
jest.mock("@ygopro/ygopro", () => ({}));
jest.mock("@ygopro/room/domain/DuelRecord", () => ({}));
jest.mock("@shared/dependency-injection");

type TestableCore = { setResponseTimer(team: number): Promise<void> };
type TestableState = {
	handleResponse(message: ClientMessage, room: YGOProRoom, player: YGOProClient): Promise<void>;
};

describe("YGOProDuelingState timer acceptance", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(1000);
	});
	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	const makeScenario = async (bankMs: number) => {
		const logger = new LoggerMock();
		const players = [0, 1].map((team) => mock<YGOProClient>({ position: team, team, logger }));
		const room = mock<YGOProRoom>();
		const responses: Buffer[] = [];
		Object.assign(room, {
			players,
			isTag: false,
			isPositionSwapped: false,
			turn: 1,
			hostInfo: { time_limit: 180 },
			currentDuelRecord: { responses },
		});
		room.getTeamPlayers.mockImplementation((team) => players.filter((p) => p.team === team));
		room.isFinished.mockReturnValue(false);
		const core = new OCGCore(room, logger);
		core.resetResponseRequestState();
		const worker = { setResponse: jest.fn().mockResolvedValue(undefined) };
		Object.assign(core, {
			ocgcore: worker,
			responseSide: 0,
			lastResponseRequestMsg: new YGOProMsgSelectYesNo().fromPartial({ player: 0, desc: 1 }),
		});
		core.timerStateAccessor.leftMs[0] = bankMs;
		await (core as unknown as TestableCore).setResponseTimer(0);
		const state = Object.create(YGOProDuelingState.prototype) as TestableState;
		Object.assign(state, { ocgCore: core });
		const bonus = jest.spyOn(core, "increaseResponseTime");
		const advance = jest.spyOn(core, "advance").mockResolvedValue(undefined);
		const message = mock<ClientMessage>({ data: Buffer.from([1, 0, 0, 0]) });
		return { core, state, room, player: players[0], worker, responses, bonus, advance, message };
	};

	it.each([
		"unconfirmed",
		"confirmed",
		"zero-bank",
	])("rejects an expired %s response before recording or submitting it", async (mode) => {
		const scenario = await makeScenario(mode === "zero-bank" ? 0 : 1000);
		if (mode === "confirmed") await scenario.core.rescheduleTimerAfterConfirm(0);
		// Leave the timeout callback queued while input reaches the response handler.
		jest.setSystemTime(mode === "unconfirmed" ? 32_000 : 2000);
		await scenario.state.handleResponse(scenario.message, scenario.room, scenario.player);
		expect(scenario.room.emitRoomEvent).toHaveBeenCalledTimes(1);
		expect(scenario.responses).toEqual([]);
		expect(scenario.bonus).not.toHaveBeenCalled();
		expect(scenario.worker.setResponse).not.toHaveBeenCalled();
		expect(scenario.advance).not.toHaveBeenCalled();
	});

	it("settles a response without TIME_CONFIRM before recording and forwarding it", async () => {
		const scenario = await makeScenario(180_000);
		await jest.advanceTimersByTimeAsync(55_000);
		await scenario.state.handleResponse(scenario.message, scenario.room, scenario.player);
		expect(scenario.core.timerStateAccessor.graceMs[0]).toBe(150_000);
		// 25 seconds charged, followed by the existing one-second action bonus.
		expect(scenario.core.timerLeftMs[0]).toBe(156_000);
		expect(scenario.responses).toEqual([Buffer.from(scenario.message.data)]);
		expect(scenario.worker.setResponse).toHaveBeenCalledTimes(1);
		expect(scenario.advance).toHaveBeenCalledTimes(1);
		expect(scenario.room.emitRoomEvent).not.toHaveBeenCalled();
	});
});
