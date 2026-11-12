import { TimerState } from "@ygopro/room/domain/TimerState";

describe("TimerState bounded readiness grace", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(1000);
	});
	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	const makeState = (bankMs = 180_000) => {
		const state = new TimerState();
		state.reset(180_000);
		state.leftMs[0] = bankMs;
		return state;
	};

	it("preserves a one-second remaining bank across a twelve-second cut-in", () => {
		const state = makeState(1000);
		const expired = jest.fn();
		state.schedule(0, state.leftMs[0], true, expired);
		jest.advanceTimersByTime(12_000);
		state.clear(true);
		expect(expired).not.toHaveBeenCalled();
		expect(state.leftMs).toEqual([1000, 180_000]);
		expect(state.graceMs).toEqual([168_000, 180_000]);
		expect(jest.getTimerCount()).toBe(0);
	});

	it("charges readiness beyond the per-prompt allowance on an implicit confirmation", () => {
		const state = makeState();
		state.schedule(0, state.leftMs[0], true, jest.fn());
		jest.advanceTimersByTime(55_000);
		state.clear(true);
		expect(state.leftMs).toEqual([155_000, 180_000]);
		expect(state.graceMs).toEqual([150_000, 180_000]);
	});

	it("charges the full readiness delay once the per-duel allowance is exhausted", () => {
		const state = makeState();
		for (let prompt = 0; prompt < 6; prompt++) {
			state.schedule(0, state.leftMs[0], true, jest.fn());
			jest.advanceTimersByTime(30_000);
			state.clear(true);
		}
		expect(state.graceMs[0]).toBe(0);
		expect(state.leftMs[0]).toBe(180_000);
		state.schedule(0, state.leftMs[0], true, jest.fn());
		jest.advanceTimersByTime(12_000);
		state.clear(true);
		expect(state.leftMs[0]).toBe(168_000);
	});

	it("uses only the remaining grace budget for the last partially covered prompt", () => {
		const state = makeState();
		state.graceMs[0] = 5000;
		state.schedule(0, state.leftMs[0], true, jest.fn());
		jest.advanceTimersByTime(12_000);
		state.settleReadiness();
		expect(state.graceMs[0]).toBe(0);
		expect(state.leftMs[0]).toBe(173_000);
		jest.advanceTimersByTime(2000);
		state.clear(true);
		expect(state.leftMs[0]).toBe(171_000);
	});

	it("expires an unanswered prompt at its bank plus available grace", () => {
		const state = makeState(1000);
		const expired = jest.fn();
		state.schedule(0, state.leftMs[0], true, expired);
		jest.advanceTimersByTime(30_999);
		expect(expired).not.toHaveBeenCalled();
		jest.advanceTimersByTime(1);
		expect(expired).toHaveBeenCalledTimes(1);
	});

	it("does not create a thirty-second allowance for a one-second configured limit", () => {
		const state = new TimerState();
		state.reset(1000);
		const expired = jest.fn();
		state.schedule(0, 1000, true, expired);
		jest.advanceTimersByTime(2000);
		expect(expired).toHaveBeenCalledTimes(1);
	});

	it("charges only the responding side after confirmation", () => {
		const state = makeState();
		state.schedule(1, state.leftMs[1], false, jest.fn());
		jest.advanceTimersByTime(2500);
		state.clear(true);
		expect(state.leftMs).toEqual([180_000, 177_500]);
		expect(state.graceMs).toEqual([180_000, 180_000]);
	});

	it("expires an exhausted deadline synchronously and resets the allowance for a new duel", () => {
		const state = new TimerState();
		const expired = jest.fn();
		state.reset(0);
		state.schedule(0, 0, true, expired);
		expect(expired).toHaveBeenCalledTimes(1);
		state.reset(180_000);
		expect(jest.getTimerCount()).toBe(0);
		expect(state.runningPos).toBeUndefined();
		expect(state.graceMs).toEqual([180_000, 180_000]);
	});

	it("counts elapsed time when a prompt starts at the epoch", () => {
		jest.setSystemTime(0);
		const state = makeState();
		state.schedule(0, state.leftMs[0], false, jest.fn());
		jest.advanceTimersByTime(1000);
		state.clear(true);
		expect(state.leftMs[0]).toBe(179_000);
	});
});
