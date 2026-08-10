import { Seat } from "@shared/room/admission/domain/Seat";
import { DuelState } from "@shared/room/domain/YgoRoom";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

import { YGOProDuelingState } from "./states/YGOProDuelingState";
import { YGOProWaitingState } from "./states/YGOProWaitingState";

/**
 * YGOProRoom carries two notions of "what state is this room in": `_state`
 * (the DuelState enum read by toRoomListDTO / DisconnectHandler) and
 * `_roomState` (the actual state OBJECT whose handleJoin() decides
 * player-vs-spectator). Both must move together: `waiting()` must set
 * `_state` to WAITING whenever it swaps `_roomState`, and `setDuelFinished()`
 * (called from YGOProDuelingState when ocgcore errors out mid-response) must
 * swap `_roomState` whenever it sets `_state` back to WAITING — otherwise a
 * room could look "waiting" (joinable) in toRoomListDTO while its live JOIN
 * handler is still the stale dueling state, spectating every new joiner
 * unconditionally.
 *
 * rps()/choosingOrder() are used here (not dueling()) because they are
 * lightweight state transitions with no OCGCore dependency, which is exactly
 * what's needed to stand the room up in a "non-waiting" state for this test.
 */
describe("YGOProRoom — _state / _roomState coherence", () => {
	it("waiting() also sets the DuelState label (_state) to WAITING, not just _roomState", () => {
		const room = YGOProRoomMother.create();
		room.rps();
		expect(room.duelState).toBe(DuelState.RPS);

		room.waiting();

		expect(room.duelState).toBe(DuelState.WAITING);
	});

	it("setDuelFinished() swaps the ACTUAL room state (not just the label) so the JOIN handler stops being stale", () => {
		const room = YGOProRoomMother.create();
		room.rps();
		const staleRoomState = (room as unknown as { _roomState: unknown })._roomState;

		room.setDuelFinished();

		const newRoomState = (room as unknown as { _roomState: unknown })._roomState;
		expect(newRoomState).not.toBe(staleRoomState);
		expect(newRoomState).toBeInstanceOf(YGOProWaitingState);
		expect(room.duelState).toBe(DuelState.WAITING);
	});

	it("setDuelFinished() delegates to waiting() so both notions can never drift apart again", () => {
		const room = YGOProRoomMother.create();
		const waitingSpy = jest.spyOn(room, "waiting");

		room.setDuelFinished();

		expect(waitingSpy).toHaveBeenCalledTimes(1);
		waitingSpy.mockRestore();
	});

	// The ocgcore-error path (YGOProDuelingState.handleResponse's catch) calls
	// room.setDuelFinished() when OCGCore.setResponse() throws mid-duel.
	// setDuelFinished() must swap _roomState AND unwind two things left behind
	// by the aborted duel:
	//   - the aborted dueling state's OCGCore must be disposed (every other
	//     exit from dueling disposes first — see
	//     YGOProDuelingState.finalizeWithReplays/transitionToSideDecking).
	//   - isStart and both players' isReady flags must be reset, or a bare
	//     TRY_START could silently re-arm a new duel without anyone
	//     re-readying.
	//
	// Constructing a REAL YGOProDuelingState here would spin up the native
	// OCGCore worker (via room.dueling()), which is exactly what the rest of
	// this file's own comment says to avoid. Instead, this stands in a
	// dueling-shaped state object (real prototype, so `instanceof
	// YGOProDuelingState` still holds) with disposeCore/removeAllListener
	// spied — the same "reach into privates" style already used above for
	// _roomState.
	describe("setDuelFinished() unwinds a real dueling state", () => {
		function seatGuest(room: ReturnType<typeof YGOProRoomMother.create>, name: string, seat: Seat) {
			const socket = {
				id: `s-${name}`,
				send: jest.fn(),
				close: jest.fn(),
				destroy: jest.fn(),
				onMessage: jest.fn(),
				removeAllListeners: jest.fn(),
			};
			return room
				.admissionTarget(socket as never, { name, password: "" } as never)
				.seatPlayer({ kind: "guest", name }, seat);
		}

		it("disposes the dueling state's OCGCore exactly once", async () => {
			const room = YGOProRoomMother.create();
			const disposeCore = jest.fn();
			const fakeDuelingState = Object.create(YGOProDuelingState.prototype) as YGOProDuelingState;
			Object.assign(fakeDuelingState, { disposeCore, removeAllListener: jest.fn() });
			(room as unknown as { _roomState: unknown })._roomState = fakeDuelingState;

			room.setDuelFinished();

			expect(disposeCore).toHaveBeenCalledTimes(1);
			const newRoomState = (room as unknown as { _roomState: unknown })._roomState;
			expect(newRoomState).toBeInstanceOf(YGOProWaitingState);
		});

		it("does NOT try to dispose a core when the current state is not a dueling state (no-op guard)", () => {
			const room = YGOProRoomMother.create();
			room.rps(); // lightweight non-dueling transition — no ocgCore to dispose

			expect(() => room.setDuelFinished()).not.toThrow();
			expect((room as unknown as { _roomState: unknown })._roomState).toBeInstanceOf(
				YGOProWaitingState,
			);
		});

		it("resets the pre-duel isStart flag and clears every seated player's ready flag", async () => {
			const room = YGOProRoomMother.create();
			await seatGuest(room, "P1", new Seat(0, 0));
			await seatGuest(room, "P2", new Seat(1, 1));
			room.players.forEach((player) => player.ready());
			(room as unknown as { isStart: string }).isStart = "start";

			const fakeDuelingState = Object.create(YGOProDuelingState.prototype) as YGOProDuelingState;
			Object.assign(fakeDuelingState, { disposeCore: jest.fn(), removeAllListener: jest.fn() });
			(room as unknown as { _roomState: unknown })._roomState = fakeDuelingState;

			room.setDuelFinished();

			expect((room as unknown as { isStart: string }).isStart).toBe("waiting");
			expect(room.players.every((player) => !player.isReady)).toBe(true);
		});

		it("waiting() at fresh room creation is a no-op for isStart/ready (no players seated yet)", () => {
			const room = YGOProRoomMother.create();

			expect((room as unknown as { isStart: string }).isStart).toBe("waiting");
			expect(room.players).toHaveLength(0);
		});
	});
});
