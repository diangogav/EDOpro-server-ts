import { YgoClient } from "@shared/client/domain/YgoClient";
import { DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";

import { findSeatOfUser } from "./findSeatOfUser";

type Seat = {
	credential:
		| { kind: "verified" | "external"; userId: string }
		| { kind: "guest"; name: string }
		| null;
	token?: string | null;
	socketClosed?: boolean;
};

const seat = ({ credential, token = "tok", socketClosed = false }: Seat): YgoClient =>
	({
		credential,
		reconnectionToken: token,
		socket: { closed: socketClosed },
	}) as unknown as YgoClient;

const room = (
	id: number,
	players: YgoClient[],
	duelState: DuelState = DuelState.DUELING,
	spectators: YgoClient[] = [],
): YgoRoom => ({ id, players, spectators, duelState }) as unknown as YgoRoom;

const verified = (userId: string, extra: Partial<Seat> = {}) =>
	seat({ credential: { kind: "verified", userId }, ...extra });

describe("findSeatOfUser", () => {
	it("finds the verified seat of the account in a started match", () => {
		const mine = verified("user-1");
		const rooms = [room(1, [verified("user-2")]), room(2, [verified("user-3"), mine])];

		expect(findSeatOfUser(rooms, "user-1")).toEqual({ client: mine, room: rooms[1] });
	});

	it("finds the seat while the old socket is still open, and also when it is closed", () => {
		const open = verified("user-1");
		const closed = verified("user-2", { socketClosed: true });
		const rooms = [room(1, [open, closed])];

		expect(findSeatOfUser(rooms, "user-1")?.client).toBe(open);
		expect(findSeatOfUser(rooms, "user-2")?.client).toBe(closed);
	});

	it("finds seats in every phase of a started match", () => {
		for (const state of [DuelState.RPS, DuelState.CHOOSING_ORDER, DuelState.SIDE_DECKING]) {
			expect(findSeatOfUser([room(1, [verified("user-1")], state)], "user-1")).not.toBeNull();
		}
	});

	it("ignores a waiting room", () => {
		expect(findSeatOfUser([room(1, [verified("user-1")], DuelState.WAITING)], "user-1")).toBeNull();
	});

	it("ignores a PIN or guest seat, even with the same user id", () => {
		const rooms = [
			room(1, [seat({ credential: { kind: "external", userId: "user-1" } })]),
			room(2, [seat({ credential: { kind: "guest", name: "user-1" } })]),
		];

		expect(findSeatOfUser(rooms, "user-1")).toBeNull();
	});

	it("ignores a seat without a reconnection token, as in a room without reconnection", () => {
		expect(findSeatOfUser([room(1, [verified("user-1", { token: null })])], "user-1")).toBeNull();
	});

	it("ignores spectators", () => {
		expect(
			findSeatOfUser([room(1, [], DuelState.DUELING, [verified("user-1")])], "user-1"),
		).toBeNull();
	});

	it("ignores seats the caller does not take back", () => {
		const rooms = [room(1, [verified("user-1")])];

		expect(findSeatOfUser(rooms, "user-1", () => false)).toBeNull();
	});

	it("answers null for an account with no seat", () => {
		expect(findSeatOfUser([room(1, [verified("user-2")])], "user-1")).toBeNull();
	});
});
