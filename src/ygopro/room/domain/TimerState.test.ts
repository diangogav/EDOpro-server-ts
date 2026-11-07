import { TimerState } from "@ygopro/room/domain/TimerState";

describe("response timer presentation readiness", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(1000);
	});
	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	it("preserves a one-second bank across a twelve-second cut-in", () => {
		const state = new TimerState();
		const expired = jest.fn();
		state.reset(1000);
		state.schedule(0, state.leftMs[0], true, expired);
		jest.advanceTimersByTime(12_000);
		expect(expired).not.toHaveBeenCalled();
		state.clear(true);
		expect(state.leftMs).toEqual([1000, 1000]);
		expect(jest.getTimerCount()).toBe(0);
	});

	it("starts the response deadline only after confirmation", () => {
		const state = new TimerState();
		const expired = jest.fn();
		state.reset(1000);
		state.schedule(0, state.leftMs[0], true, expired);
		jest.advanceTimersByTime(12_000);
		state.clear();
		state.schedule(0, state.leftMs[0], false, expired);
		jest.advanceTimersByTime(999);
		expect(expired).not.toHaveBeenCalled();
		jest.advanceTimersByTime(1);
		expect(expired).toHaveBeenCalledTimes(1);
	});

	it("ends an unconfirmed prompt at a finite readiness deadline", () => {
		const state = new TimerState();
		const expired = jest.fn();
		state.reset(180_000);
		state.schedule(0, state.leftMs[0], true, expired);
		jest.advanceTimersByTime(TimerState.CONFIRM_TIMEOUT_MS - 1);
		expect(expired).not.toHaveBeenCalled();
		jest.advanceTimersByTime(1);
		expect(expired).toHaveBeenCalledTimes(1);
	});

	it("charges only the responding player after confirmation", () => {
		const state = new TimerState();
		state.reset(10_000);
		state.schedule(1, state.leftMs[1], false, jest.fn());
		jest.advanceTimersByTime(2500);
		state.clear(true);
		expect(state.leftMs).toEqual([10_000, 7500]);
	});

	it("accepts an automatic response before confirmation without spending presentation time", () => {
		const state = new TimerState();
		const expired = jest.fn();
		state.reset(1000);
		state.schedule(0, state.leftMs[0], true, expired);
		jest.advanceTimersByTime(12_000);
		state.clear(true);
		jest.advanceTimersByTime(TimerState.CONFIRM_TIMEOUT_MS);
		expect(state.leftMs[0]).toBe(1000);
		expect(expired).not.toHaveBeenCalled();
	});

	it("expires a zero bank after confirmation and cancels all timers on reset", () => {
		const state = new TimerState();
		const expired = jest.fn();
		state.reset(0);
		state.schedule(0, 0, true, expired);
		jest.advanceTimersByTime(12_000);
		expect(expired).not.toHaveBeenCalled();
		state.clear();
		state.schedule(0, 0, false, expired);
		// The callback runs before another queued response can settle the bank.
		expect(expired).toHaveBeenCalledTimes(1);
		state.reset(180_000);
		expect(jest.getTimerCount()).toBe(0);
		expect(state.runningPos).toBeUndefined();
	});
});
