/**
 * Exercises the real YGOProDuelingState duel-event publishers — the private
 * helpers its ocgcore middleware handlers call to hand decoded duel facts to
 * the dispatcher. Invoked on a prototype instance with only the fields they
 * read injected (room, ocgCore, duelEvents), skipping the OCGCore-heavy
 * constructor — same technique as YGOProDuelingStateEvrp.test.ts.
 */
import { DuelEventDispatcher } from "@shared/room/domain/duel-events/DuelEventDispatcher";

import { YGOProDuelingState } from "./YGOProDuelingState";

type TestableDuelingState = {
	publishLpEvent(
		kind: "duel.damage" | "duel.recover" | "duel.lp-cost",
		player: number,
		amount: number,
	): void;
	publishTurnStart(player: number): void;
};

function buildState(overrides: Record<string, unknown> = {}): {
	state: TestableDuelingState;
	dispatch: jest.Mock;
	room: object;
} {
	const dispatch = jest.fn();
	const room = { id: 7, turn: 3, isTag: false, ...overrides };
	const state = Object.create(YGOProDuelingState.prototype) as Record<string, unknown>;
	state.room = room;
	// Non-tag team resolution goes through the core's side mapping.
	state.ocgCore = { getSideTeam: (side: number) => side ^ 1 };
	state.duelEvents = { dispatch } as unknown as DuelEventDispatcher;

	return { state: state as unknown as TestableDuelingState, dispatch, room };
}

describe("YGOProDuelingState duel-event publishers", () => {
	it("publishes an LP event with the core-resolved team and current turn", () => {
		const { state, dispatch, room } = buildState();

		state.publishLpEvent("duel.damage", 1, 1000);

		expect(dispatch).toHaveBeenCalledWith(
			"duel.damage",
			{ roomId: 7, team: 0, amount: 1000, turn: 3 },
			room,
		);
	});

	it("resolves the team as the raw side in tag rooms", () => {
		const { state, dispatch } = buildState({ isTag: true });

		state.publishLpEvent("duel.lp-cost", 1, 800);

		expect(dispatch).toHaveBeenCalledWith(
			"duel.lp-cost",
			expect.objectContaining({ team: 1, amount: 800 }),
			expect.anything(),
		);
	});

	// On this pipeline the room counter has already incremented when the state's
	// NEW_TURN middleware runs, so the current value IS the started turn —
	// matching the EDOPro pipeline's room.turn + 1.
	it("publishes turn-start with the started turn number and raw player", () => {
		const { state, dispatch, room } = buildState();

		state.publishTurnStart(1);

		expect(dispatch).toHaveBeenCalledWith(
			"duel.turn-start",
			{ roomId: 7, player: 1, turn: 3 },
			room,
		);
	});
});
