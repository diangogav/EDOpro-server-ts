import { Reservation } from "./Reservation";
import { ReservedDuelRecorder, ReservedDuelSession } from "./ReservedDuelSession";

const makeReservation = (overrides: Partial<Reservation> = {}): Reservation => ({
	id: "Ab3dEf6hIj9kLm2n",
	format: "edison",
	mode: "single",
	participants: [
		{ seat: 0, kind: "user", userId: "user-1", requiredDeck: { main: [1], extra: [], side: [] } },
		{ seat: 1, kind: "user", userId: "user-2", requiredDeck: null },
	],
	options: {
		spectators: false,
		listed: false,
		reconnect: false,
		deckLock: "exact",
		lobbyTimeoutSeconds: 120,
	},
	...overrides,
});

const makeRecorder = (): jest.Mocked<ReservedDuelRecorder> => ({
	started: jest.fn(),
	abandoned: jest.fn(),
	release: jest.fn(),
});

describe("ReservedDuelSession", () => {
	it("records an abandon and releases the reservation when the room closes without a game over", () => {
		const recorder = makeRecorder();
		const session = new ReservedDuelSession(makeReservation(), recorder);

		session.close({ seat: 0, reason: "disconnect" });

		expect(recorder.abandoned).toHaveBeenCalledWith("Ab3dEf6hIj9kLm2n", {
			seat: 0,
			reason: "disconnect",
		});
		expect(recorder.release).toHaveBeenCalledWith("Ab3dEf6hIj9kLm2n");
	});

	it("leaves the outcome to the game-over subscriber once a game over was dispatched", () => {
		const recorder = makeRecorder();
		const session = new ReservedDuelSession(makeReservation(), recorder);

		session.markGameOver();
		session.close({ seat: 1, reason: "disconnect" });

		expect(recorder.abandoned).not.toHaveBeenCalled();
		expect(recorder.release).toHaveBeenCalledTimes(1);
	});

	it("closes once", () => {
		const recorder = makeRecorder();
		const session = new ReservedDuelSession(makeReservation(), recorder);

		session.close({ seat: null, reason: "room_closed" });
		session.close({ seat: 0, reason: "disconnect" });

		expect(recorder.abandoned).toHaveBeenCalledTimes(1);
		expect(recorder.release).toHaveBeenCalledTimes(1);
	});

	it("records an abandon after the start as a started duel, so a quick quit is a loss", () => {
		const recorder = makeRecorder();
		const session = new ReservedDuelSession(makeReservation(), recorder);

		session.markStarted("match-1");
		session.close({ seat: 0, reason: "disconnect" });

		expect(recorder.abandoned).toHaveBeenCalledWith("Ab3dEf6hIj9kLm2n", {
			seat: 0,
			reason: "disconnect",
			started: true,
		});
	});

	it("marks the first duel start only once", () => {
		const recorder = makeRecorder();
		const session = new ReservedDuelSession(makeReservation(), recorder);

		session.markStarted("match-1");
		session.markStarted("match-1");

		expect(session.hasStarted).toBe(true);
		expect(recorder.started).toHaveBeenCalledTimes(1);
		expect(recorder.started).toHaveBeenCalledWith("Ab3dEf6hIj9kLm2n", "match-1");
	});

	it("checks decks only for seats with a required deck", () => {
		const session = new ReservedDuelSession(makeReservation(), makeRecorder());

		expect(session.acceptsDeck(0, { main: [1], extra: [], side: [] })).toBe(true);
		expect(session.acceptsDeck(0, { main: [2], extra: [], side: [] })).toBe(false);
		expect(session.acceptsDeck(1, { main: [2], extra: [], side: [] })).toBe(true);
	});

	it("blames the first absent human seat, then the first unready one, else nobody", () => {
		const session = new ReservedDuelSession(makeReservation(), makeRecorder());

		expect(session.noShowSeat([0], [0])).toBe(1);
		expect(session.noShowSeat([0, 1], [1])).toBe(0);
		expect(session.noShowSeat([0, 1], [0, 1])).toBeNull();
	});

	it("maps users to their seats", () => {
		const session = new ReservedDuelSession(makeReservation(), makeRecorder());

		expect(session.seatOfUser("user-2")).toBe(1);
		expect(session.seatOfUser("stranger")).toBeNull();
		expect(session.userIds).toEqual(["user-1", "user-2"]);
		expect(session.botSeat()).toBeNull();
	});
});
