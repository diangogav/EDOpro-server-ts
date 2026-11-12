import { mock } from "jest-mock-extended";
import { YGOProMsgNewTurn, YGOProMsgSelectYesNo } from "ygopro-msg-encode";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import { OCGCore } from "@ygopro/ocgcore-worker/ocgcore";
import { TimerState } from "@ygopro/room/domain/TimerState";

jest.mock("@ygopro/ocgcore-worker/ocgcore-worker", () => ({}));
jest.mock("@ygopro/ygopro", () => ({}));
jest.mock("@ygopro/room/domain/DuelRecord", () => ({}));

type TimerSetup = {
	responseSide: number;
	setResponseTimer(team: number): Promise<void>;
};

describe("OCGCore readiness and authoritative timeout", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(1000);
	});
	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	const makeScenario = (bankMs: number) => {
		const players = [0, 1].map((team) => mock<YGOProClient>({ position: team, team }));
		const room = mock<YGOProRoom>();
		Object.assign(room, {
			players,
			isTag: false,
			isPositionSwapped: false,
			turn: 1,
			hostInfo: { time_limit: 180 },
			currentDuelRecord: { messages: [] },
		});
		room.getTeamPlayers.mockImplementation((team) => players.filter((p) => p.team === team));
		room.isFinished.mockReturnValue(false);
		const core = new OCGCore(room, new LoggerMock());
		core.resetResponseRequestState();
		Object.assign(core, {
			responseSide: 0,
			lastResponseRequestMsg: new YGOProMsgSelectYesNo().fromPartial({ player: 0, desc: 1 }),
		});
		core.timerStateAccessor.leftMs[0] = bankMs;
		return { core, room, players, setup: core as unknown as TimerSetup };
	};

	it.each([
		0, 1000,
	])("preserves a %i-ms bank during a long cut-in and then enforces it", async (bankMs) => {
		const { core, room, players, setup } = makeScenario(bankMs);
		await setup.setResponseTimer(0);
		await jest.advanceTimersByTimeAsync(12_000);
		expect(room.emitRoomEvent).not.toHaveBeenCalled();
		expect(core.timerLeftMs[0]).toBe(bankMs);
		await core.rescheduleTimerAfterConfirm(0);
		expect(core.timerStateAccessor.awaitingConfirm).toBe(false);
		expect(jest.getTimerCount()).toBe(bankMs === 0 ? 0 : 1);
		expect(
			players[0].sendMessageToClient.mock.calls.filter(([frame]) => frame[2] === 0x18),
		).toHaveLength(1);
		const frames = players[1].sendMessageToClient.mock.calls.map(([frame]) => frame);
		expect(
			frames.filter((frame) => frame[2] === 0x18).map((frame) => frame.readUInt16LE(5)),
		).toEqual([Math.ceil(bankMs / 1000)]);
		await jest.advanceTimersByTimeAsync(bankMs);
		expect(room.emitRoomEvent).toHaveBeenCalledWith(
			"FINISH_DUEL_BY_TIMEOUT",
			expect.objectContaining({ player: 1 }),
		);
	});

	it("ignores a confirmation for the wrong side and a repeated confirmation", async () => {
		const { core, room, setup } = makeScenario(5000);
		await setup.setResponseTimer(0);
		const started = core.timerStateAccessor.startedAtMs;
		await core.rescheduleTimerAfterConfirm(1);
		expect(core.timerStateAccessor.awaitingConfirm).toBe(true);
		expect(core.timerStateAccessor.startedAtMs).toBe(started);
		await jest.advanceTimersByTimeAsync(12_000);
		await core.rescheduleTimerAfterConfirm(0);
		await jest.advanceTimersByTimeAsync(2000);
		const confirmedAt = core.timerStateAccessor.startedAtMs;
		await core.rescheduleTimerAfterConfirm(0);
		expect(core.timerStateAccessor.startedAtMs).toBe(confirmedAt);
		await jest.advanceTimersByTimeAsync(3000);
		expect(room.emitRoomEvent).toHaveBeenCalledTimes(1);
	});

	it("forfeits a client that never acknowledges or responds at the bank plus grace deadline", async () => {
		const { room, setup } = makeScenario(180_000);
		await setup.setResponseTimer(0);
		await jest.advanceTimersByTimeAsync(180_000 + TimerState.MAX_PROMPT_GRACE_MS);
		expect(room.emitRoomEvent).toHaveBeenCalledTimes(1);
	});

	it.each([
		false,
		true,
	])("spends the bank across repeated late prompts with explicit confirmation=%s", async (confirm) => {
		const { core, room, setup } = makeScenario(180_000);
		for (let prompt = 0; prompt < 10; prompt++) {
			await setup.setResponseTimer(0);
			await jest.advanceTimersByTimeAsync(55_000);
			if (room.emitRoomEvent.mock.calls.length) break;
			if (confirm) await core.rescheduleTimerAfterConfirm(0);
			core.clearResponseTimerState(true);
		}
		expect(room.emitRoomEvent).toHaveBeenCalledWith(
			"FINISH_DUEL_BY_TIMEOUT",
			expect.objectContaining({ player: 1 }),
		);
		expect(core.timerLeftMs[0]).toBe(0);
		expect(core.timerStateAccessor.graceMs[0]).toBe(0);
	});

	it("rejects a response at an expired deadline before its timeout callback runs", async () => {
		const { core, room, setup } = makeScenario(1000);
		await setup.setResponseTimer(0);
		// Moving the clock without running callbacks models already queued socket input.
		jest.setSystemTime(32_000);
		expect(core.clearResponseTimerState(true)).toBe(false);
		expect(core.currentResponseSide).toBeNull();
		expect(room.emitRoomEvent).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it("settles and rejects an exhausted bank on a response without confirmation", async () => {
		const { core, room, setup } = makeScenario(0);
		await setup.setResponseTimer(0);
		await jest.advanceTimersByTimeAsync(12_000);
		expect(core.clearResponseTimerState(true)).toBe(false);
		expect(core.timerStateAccessor.graceMs[0]).toBe(168_000);
		expect(room.emitRoomEvent).toHaveBeenCalledTimes(1);
	});

	it("keeps grace spent after turn recovery and action-time bonuses", async () => {
		const { core, setup } = makeScenario(180_000);
		await setup.setResponseTimer(0);
		await jest.advanceTimersByTimeAsync(55_000);
		core.clearResponseTimerState(true);
		expect(core.timerStateAccessor.graceMs[0]).toBe(150_000);
		core.increaseResponseTime(0, 13);
		expect(core.timerLeftMs[0]).toBe(156_000);
		expect(core.timerStateAccessor.graceMs[0]).toBe(150_000);
		await core.messageMiddleware.process(new YGOProMsgNewTurn().fromPartial({ player: 1 }));
		expect(core.timerLeftMs[0]).toBe(180_000);
		expect(core.timerStateAccessor.graceMs[0]).toBe(150_000);
	});

	it("preserves the readiness deadline and charged excess through reconnect snapshots", async () => {
		const { core, room, players, setup } = makeScenario(10_000);
		await setup.setResponseTimer(0);
		const startedAt = core.timerStateAccessor.startedAtMs;
		await jest.advanceTimersByTimeAsync(35_000);
		players[0].sendMessageToClient.mockClear();
		await core.sendReconnectTimeLimitAndResponseState(players[0]);
		const snapshots = players[0].sendMessageToClient.mock.calls
			.map(([frame]) => frame)
			.filter((frame) => frame[2] === 0x18);
		expect(snapshots.at(-1)?.readUInt16LE(5)).toBe(5);
		expect(core.timerStateAccessor.startedAtMs).toBe(startedAt);
		expect(core.timerStateAccessor.graceMs[0]).toBe(180_000);
		await jest.advanceTimersByTimeAsync(4999);
		expect(room.emitRoomEvent).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(1);
		expect(room.emitRoomEvent).toHaveBeenCalledTimes(1);
	});
});
