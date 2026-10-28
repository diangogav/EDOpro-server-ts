import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { Reservation } from "@shared/reserved-duel/domain/Reservation";
import { ReservedDuelSession } from "@shared/reserved-duel/domain/ReservedDuelSession";
import { ISocket } from "@shared/socket/domain/ISocket";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

import { YGOProRoom } from "./YGOProRoom";

jest.mock("@ygopro/SimpleRoomMessageEmitter");

const makeReservation = (overrides: Partial<Reservation> = {}): Reservation => ({
	id: "Ab3dEf6hIj9kLm2n",
	format: "edison",
	mode: "single",
	participants: [
		{ seat: 0, kind: "windbot", botName: "Haunted" },
		{ seat: 1, kind: "user", userId: "user-1", requiredDeck: null },
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

const recorder = { started: jest.fn(), abandoned: jest.fn(), release: jest.fn() };

const makeRoom = (reservation = makeReservation(), command = "edison#secret"): YGOProRoom => {
	const room = YGOProRoomMother.create({ command });
	room.reservedDuel = new ReservedDuelSession(reservation, recorder);
	room.reservedUserIds = room.reservedDuel.userIds;
	return room;
};

const makeSocket = (overrides: Partial<ISocket> = {}): ISocket =>
	({
		id: `s-${Math.random()}`,
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
		onMessage: jest.fn(),
		removeAllListeners: jest.fn(),
		remoteAddress: "127.0.0.1",
		closed: false,
		...overrides,
	}) as unknown as ISocket;

const info = { name: "P", password: null } as unknown as PlayerInfoMessage;

const seatBoth = async (room: YGOProRoom): Promise<void> => {
	const user = room.admissionTarget(makeSocket({ resolvedUserId: "user-1" }), info);
	await user.seatPlayer({ kind: "verified", userId: "user-1" }, user.freeSeat()!);
	const bot = room.admissionTarget(makeSocket({ internalForRoomId: room.id }), {
		name: "Bot",
		password: null,
	} as unknown as PlayerInfoMessage);
	await bot.seatPlayer({ kind: "guest", name: "Bot" }, bot.freeSeat()!);
};

describe("YGOProRoom with a reserved duel", () => {
	it("is listed only when its reservation asks for it", () => {
		expect(makeRoom().isListed).toBe(false);
		expect(
			makeRoom(makeReservation({ options: { ...makeReservation().options, listed: true } }))
				.isListed,
		).toBe(true);
		expect(YGOProRoomMother.create({ command: "edison#open" }).isListed).toBe(true);
	});

	it("never moves a seated participant to another cell", async () => {
		const room = makeRoom();
		await seatBoth(room);
		const user = room.players.find((player) => player.team === 1) as Parameters<
			YGOProRoom["movePlayerToAnotherCellUnsafe"]
		>[0];

		room.movePlayerToAnotherCellUnsafe(user);

		expect(user.team).toBe(1);
		expect(user.position).toBe(1);
	});

	it("seats a user at the seat the reservation gives them, whoever arrives first", () => {
		const room = makeRoom();

		const seat = room.admissionTarget(makeSocket({ resolvedUserId: "user-1" }), info).freeSeat();

		expect(seat).toEqual({ position: 1, team: 1 });
	});

	it("seats the room's bot at the bot seat", () => {
		const room = makeRoom();

		const seat = room.admissionTarget(makeSocket({ internalForRoomId: room.id }), info).freeSeat();

		expect(seat).toEqual({ position: 0, team: 0 });
	});

	it("offers no seat once that seat is taken", async () => {
		const room = makeRoom();
		const socket = makeSocket({ resolvedUserId: "user-1" });
		const target = room.admissionTarget(socket, info);
		await target.seatPlayer({ kind: "verified", userId: "user-1" }, target.freeSeat()!);

		expect(
			room.admissionTarget(makeSocket({ resolvedUserId: "user-1" }), info).freeSeat(),
		).toBeNull();
	});

	it("turns watchers away unless the reservation allows spectators", () => {
		const closed = makeRoom();
		const open = makeRoom(
			makeReservation({ options: { ...makeReservation().options, spectators: true } }),
		);

		expect(closed.reservationAdmits(makeSocket({ watchForRoomId: closed.id }))).toBe(false);
		expect(open.reservationAdmits(makeSocket({ watchForRoomId: open.id }))).toBe(true);
	});

	it("always checks decks, even with the no-check token", () => {
		expect(makeRoom(makeReservation(), "edison,nc#secret").shouldValidateDeck()).toBe(true);
	});

	it("finishes a single reserved match on a drawn duel", async () => {
		const room = makeRoom();
		await seatBoth(room);
		room.createMatch();
		expect(room.isMatchFinished()).toBe(false);

		room.duelWinner(2);

		expect(room.isMatchFinished()).toBe(true);
	});

	it("keeps a drawn duel unfinished in an ordinary single room", () => {
		const room = YGOProRoomMother.create({ command: "edison#secret" });
		room.createMatch();

		room.duelWinner(2);

		expect(room.isMatchFinished()).toBe(false);
	});

	it("keeps a reserved best-of-3 going after a drawn duel", async () => {
		const room = makeRoom(makeReservation({ mode: "match" }), "edison,m#secret");
		await seatBoth(room);
		room.createMatch();

		room.duelWinner(2);

		expect(room.isMatchFinished()).toBe(false);
	});

	it("reports each game's win reason, and disconnect for awarded games", () => {
		const room = makeRoom();
		jest.spyOn(room, "duelIds", "get").mockReturnValue(["d1", "d2"]);
		(room as unknown as { _duelRecords: { winReason?: number }[] })._duelRecords = [
			{ winReason: 1 },
		];

		expect(room.duelWinReasons()).toEqual(["1", "disconnect"]);
	});
});
