import { Reservation } from "@shared/reserved-duel/domain/Reservation";

import { reservedRoomCommand } from "./reservedRoomCommand";

const makeReservation = (
	overrides: Partial<Pick<Reservation, "format" | "mode">> & {
		options?: Partial<Reservation["options"]>;
	} = {},
): Pick<Reservation, "format" | "mode" | "options"> => ({
	format: "edison",
	mode: "single",
	...overrides,
	options: {
		spectators: false,
		listed: false,
		reconnect: false,
		deckLock: "exact",
		lobbyTimeoutSeconds: 120,
		...overrides.options,
	},
});

describe("reservedRoomCommand", () => {
	it("builds the format token behind a random password", () => {
		expect(reservedRoomCommand(makeReservation())).toMatch(/^edison#[0-9a-f]{16}$/);
	});

	it("adds the match token for best-of-3", () => {
		expect(reservedRoomCommand(makeReservation({ mode: "match" }))).toMatch(
			/^edison,m#[0-9a-f]{16}$/,
		);
	});

	it("emits a turn time in seconds as the tm token", () => {
		expect(reservedRoomCommand(makeReservation({ options: { turnTimeSeconds: 90 } }))).toMatch(
			/^edison,tm90#[0-9a-f]{16}$/,
		);
	});

	it("emits whole minutes as the tm token's minute form", () => {
		expect(reservedRoomCommand(makeReservation({ options: { turnTimeSeconds: 120 } }))).toMatch(
			/^edison,tm2#[0-9a-f]{16}$/,
		);
	});

	it("orders the tokens format, match, turn time", () => {
		expect(
			reservedRoomCommand(makeReservation({ mode: "match", options: { turnTimeSeconds: 60 } })),
		).toMatch(/^edison,m,tm1#[0-9a-f]{16}$/);
	});

	it("refuses a format the rule parser does not know", () => {
		expect(reservedRoomCommand(makeReservation({ format: "chess" }))).toBeNull();
	});
});
