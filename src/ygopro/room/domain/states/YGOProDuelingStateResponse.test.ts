/**
 * RESPONSE gating in the real YGOProDuelingState.handleResponse, invoked on a
 * prototype instance with a fake OCGCore that keeps the response-request state
 * the way OCGCore does: a routed request sets the request message, MSG_RETRY
 * sets the retry flag, and clearResponseRequestState clears both while the
 * response side stays set.
 */
import { YGOProDuelingState } from "./YGOProDuelingState";

type HandleResponse = (message: { data: Buffer }, room: unknown, player: unknown) => Promise<void>;

function buildState() {
	const awaited = { logger: { info: jest.fn(), error: jest.fn() } };
	const opponent = { logger: { info: jest.fn(), error: jest.fn() } };
	const core = {
		lastRequest: { id: "select-idle" } as object | null,
		retrying: false,
		currentResponseSide: 0 as number | null,
		responsePlayer: awaited,
		timeLimitEnabled: false,
		get currentLastResponseRequestMsg() {
			return this.lastRequest;
		},
		get isRetryingState() {
			return this.retrying;
		},
		hasOcgcore: () => true,
		getSideTeam: (side: number) => side,
		clearResponseRequestState() {
			this.lastRequest = null;
			this.retrying = false;
		},
		setResponse: jest.fn().mockResolvedValue(undefined),
		advance: jest.fn().mockResolvedValue(undefined),
	};
	const room = { currentDuelRecord: { responses: [] as Buffer[] }, setDuelFinished: jest.fn() };
	const state = Object.create(YGOProDuelingState.prototype) as Record<string, unknown>;
	state.ocgCore = core;
	const handleResponse = (state.handleResponse as HandleResponse).bind(state);

	return { handleResponse, core, room, awaited, opponent };
}

const response = (value: number) => ({ data: Buffer.from([value, 0, 0, 0]) });

describe("YGOProDuelingState RESPONSE gating", () => {
	it("applies one response per prompt when the awaited duelist pipelines two", async () => {
		const { handleResponse, core, room, awaited } = buildState();

		await Promise.all([
			handleResponse(response(7), room, awaited),
			handleResponse(response(7), room, awaited),
		]);

		expect(core.setResponse).toHaveBeenCalledTimes(1);
		expect(core.advance).toHaveBeenCalledTimes(1);
		expect(room.currentDuelRecord.responses).toHaveLength(1);
	});

	it("drops a response when no prompt is open even though the response side is still set", async () => {
		const { handleResponse, core, room, awaited } = buildState();
		core.lastRequest = null;

		await handleResponse(response(7), room, awaited);

		expect(core.setResponse).not.toHaveBeenCalled();
		expect(room.currentDuelRecord.responses).toHaveLength(0);
	});

	it("accepts the awaited duelist's answer after the core asks again with MSG_RETRY", async () => {
		const { handleResponse, core, room, awaited } = buildState();
		await handleResponse(response(99), room, awaited);
		core.retrying = true;

		await handleResponse(response(7), room, awaited);

		expect(core.setResponse).toHaveBeenCalledTimes(2);
		expect(core.advance).toHaveBeenCalledTimes(2);
	});

	it("drops a response from a duelist the core is not waiting on", async () => {
		const { handleResponse, core, room, opponent } = buildState();

		await handleResponse(response(7), room, opponent);

		expect(core.setResponse).not.toHaveBeenCalled();
	});
});
