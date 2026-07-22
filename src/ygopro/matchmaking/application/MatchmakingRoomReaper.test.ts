import { YGOProRoom } from "../../room/domain/YGOProRoom";
import {
	MATCHMAKING_ROOM_JOIN_GRACE_MS,
	MatchmakingRoomReaper,
	MatchmakingRoomReaperDeps,
} from "./MatchmakingRoomReaper";

// A minimal room stand-in — the reaper only reads `id` and `playersCount`.
const makeRoom = (id: number, playersCount = 0): YGOProRoom =>
	({ id, playersCount }) as unknown as YGOProRoom;

const makeReaper = (overrides: Partial<MatchmakingRoomReaperDeps> = {}) => {
	const clock = { t: 0 };
	const finalize = jest.fn();
	const reaper = new MatchmakingRoomReaper({
		now: () => clock.t,
		finalize,
		...overrides,
	});
	return { reaper, finalize, clock };
};

describe("MatchmakingRoomReaper", () => {
	it("finalizes a tracked room that is still empty after the grace window", () => {
		const { reaper, finalize, clock } = makeReaper();
		const room = makeRoom(1, 0);

		reaper.track(room);
		clock.t = MATCHMAKING_ROOM_JOIN_GRACE_MS + 1;
		reaper.sweep();

		expect(finalize).toHaveBeenCalledTimes(1);
		expect(finalize).toHaveBeenCalledWith(room);
		expect(reaper.size).toBe(0);
	});

	it("does NOT finalize a room that has been joined (playersCount > 0)", () => {
		const clock = { t: 0 };
		const finalize = jest.fn();
		const reaper = new MatchmakingRoomReaper({ now: () => clock.t, finalize });
		// Room object whose playersCount flips to 1 after a client joins.
		const room = { id: 2, playersCount: 0 } as unknown as YGOProRoom;

		reaper.track(room);
		(room as unknown as { playersCount: number }).playersCount = 1;
		clock.t = MATCHMAKING_ROOM_JOIN_GRACE_MS + 1;
		reaper.sweep();

		expect(finalize).not.toHaveBeenCalled();
		// Ownership handed back to the normal lifecycle: no longer tracked.
		expect(reaper.size).toBe(0);
	});

	it("does NOT finalize an empty room before the grace window elapses", () => {
		const { reaper, finalize, clock } = makeReaper();
		reaper.track(makeRoom(3, 0));

		clock.t = MATCHMAKING_ROOM_JOIN_GRACE_MS - 1;
		reaper.sweep();

		expect(finalize).not.toHaveBeenCalled();
		expect(reaper.size).toBe(1);
	});

	it("reaps only expired rooms and leaves younger ones tracked", () => {
		const { reaper, finalize, clock } = makeReaper();
		const older = makeRoom(10, 0);
		reaper.track(older);

		clock.t = 30_000;
		const younger = makeRoom(11, 0);
		reaper.track(younger);

		clock.t = MATCHMAKING_ROOM_JOIN_GRACE_MS + 1; // older expired, younger not
		reaper.sweep();

		expect(finalize).toHaveBeenCalledTimes(1);
		expect(finalize).toHaveBeenCalledWith(older);
		expect(reaper.size).toBe(1);
	});

	it("honours an injected grace window override", () => {
		const { reaper, finalize, clock } = makeReaper({ graceMs: 100 });
		reaper.track(makeRoom(4, 0));

		clock.t = 101;
		reaper.sweep();

		expect(finalize).toHaveBeenCalledTimes(1);
	});
});
