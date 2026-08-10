import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { Seat } from "@shared/room/admission/domain/Seat";
import { ISocket } from "@shared/socket/domain/ISocket";

import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { MessageRepositoryMock } from "@test-support/mocks/MessageRepositoryMock";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

import { YGOProRoom } from "../domain/YGOProRoom";
import YGOProRoomList from "./YGOProRoomList";

jest.mock("@ygopro/SimpleRoomMessageEmitter");

const makeSocket = (): ISocket =>
	({
		id: `s-${Math.random()}`,
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
		onMessage: jest.fn(),
		removeAllListeners: jest.fn(),
		remoteAddress: "127.0.0.1",
		closed: false,
	}) as unknown as ISocket;

const playerInfo = (name: string): PlayerInfoMessage => ({ name, password: null }) as never;

async function fillRoom(room: ReturnType<typeof YGOProRoomMother.create>): Promise<void> {
	// SINGLE mode has team0=1/team1=1 → two seats total. Seat both so
	// calculatePlaceUnsafe() (and therefore hasFreeSeat()) returns null/false.
	const target = room.admissionTarget(makeSocket(), playerInfo("P1"));
	await target.seatPlayer({ kind: "guest", name: "P1" }, new Seat(0, 0));
	const target2 = room.admissionTarget(makeSocket(), playerInfo("P2"));
	await target2.seatPlayer({ kind: "guest", name: "P2" }, new Seat(1, 1));
}

/**
 * Characterization tests for YGOProRoomList, including the
 * findJoinableByName() query used by the pairing feature.
 */
describe("YGOProRoomList", () => {
	afterEach(() => {
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
	});

	describe("findByName", () => {
		it("returns the FIRST of two same-named rooms, ignoring state", () => {
			const first = YGOProRoomMother.create({ command: "DUPLICATE" });
			const second = YGOProRoomMother.create({ command: "DUPLICATE" });
			// Put the SECOND room in a non-waiting state — findByName must still
			// return the first regardless of either room's state.
			second.rps();

			YGOProRoomList.addRoom(first);
			YGOProRoomList.addRoom(second);

			expect(YGOProRoomList.findByName("DUPLICATE")).toBe(first);
		});
	});

	describe("findByNameAndPassword", () => {
		it("returns null when no room with that name exists", () => {
			expect(YGOProRoomList.findByNameAndPassword("NOTHING", "")).toBeNull();
		});

		it("returns the room whose name and password both match", () => {
			const room = YGOProRoomMother.create({ command: "TESTROOM#secret" });
			YGOProRoomList.addRoom(room);

			expect(YGOProRoomList.findByNameAndPassword("TESTROOM", "secret")).toBe(room);
		});

		it("returns null when the name matches but the password does not", () => {
			const room = YGOProRoomMother.create({ command: "TESTROOM#secret" });
			YGOProRoomList.addRoom(room);

			expect(YGOProRoomList.findByNameAndPassword("TESTROOM", "wrong")).toBeNull();
		});

		it("ignores room state, unlike findJoinableByName", () => {
			const room = YGOProRoomMother.create({ command: "TESTROOM#secret" });
			room.rps(); // lightweight non-waiting transition, no OCGCore needed
			YGOProRoomList.addRoom(room);

			expect(YGOProRoomList.findByNameAndPassword("TESTROOM", "secret")).toBe(room);
		});

		it("returns the FIRST of two rooms sharing the same (name, password) pair", () => {
			const first = YGOProRoomMother.create({ command: "TESTROOM#secret" });
			const second = YGOProRoomMother.create({ command: "TESTROOM#secret" });
			YGOProRoomList.addRoom(first);
			YGOProRoomList.addRoom(second);

			expect(YGOProRoomList.findByNameAndPassword("TESTROOM", "secret")).toBe(first);
		});

		it("distinguishes two same-named rooms by password", () => {
			const withPasswordA = YGOProRoomMother.create({ command: "TESTROOM#alpha" });
			const withPasswordB = YGOProRoomMother.create({ command: "TESTROOM#beta" });
			YGOProRoomList.addRoom(withPasswordA);
			YGOProRoomList.addRoom(withPasswordB);

			expect(YGOProRoomList.findByNameAndPassword("TESTROOM", "alpha")).toBe(withPasswordA);
			expect(YGOProRoomList.findByNameAndPassword("TESTROOM", "beta")).toBe(withPasswordB);
		});
	});

	describe("deleteRoom", () => {
		it("is a no-op when the room is not in the list", () => {
			const room = YGOProRoomMother.create({ command: "NEVERADDED" });
			expect(() => YGOProRoomList.deleteRoom(room)).not.toThrow();
			expect(YGOProRoomList.getRooms()).toHaveLength(0);
		});

		it("matches by id, not by object identity", () => {
			const room = YGOProRoomMother.create({ id: 555, command: "BYID" });
			YGOProRoomList.addRoom(room);

			// A different object reference that merely shares the same id.
			const staleReference = { id: 555 } as unknown as ReturnType<typeof YGOProRoomMother.create>;
			YGOProRoomList.deleteRoom(staleReference);

			expect(YGOProRoomList.findById(555)).toBeNull();
		});
	});

	describe("findJoinableByName", () => {
		it("returns null when no room with that name exists", () => {
			expect(YGOProRoomList.findJoinableByName("NOTHING")).toBeNull();
		});

		it("skips a dueling room and returns the waiting one, regardless of list order", async () => {
			const dueling = YGOProRoomMother.create({ command: "TCG" });
			dueling.rps(); // lightweight non-waiting transition, no OCGCore needed

			const waiting = YGOProRoomMother.create({ command: "TCG" });
			waiting.waiting();

			// Dueling-like room added FIRST so a naive first-match scan would pick it.
			YGOProRoomList.addRoom(dueling);
			YGOProRoomList.addRoom(waiting);

			expect(YGOProRoomList.findJoinableByName("TCG")).toBe(waiting);
		});

		it("skips a full waiting room and returns a waiting room with a free seat, regardless of list order", async () => {
			const full = YGOProRoomMother.create({ command: "TCG" });
			full.waiting();
			await fillRoom(full);

			const joinable = YGOProRoomMother.create({ command: "TCG" });
			joinable.waiting();

			// Full room added FIRST so a naive first-match scan would pick it.
			YGOProRoomList.addRoom(full);
			YGOProRoomList.addRoom(joinable);

			expect(YGOProRoomList.findJoinableByName("TCG")).toBe(joinable);
		});

		it("returns null when every same-named room is dueling or full", async () => {
			const dueling = YGOProRoomMother.create({ command: "TCG" });
			dueling.rps();

			const full = YGOProRoomMother.create({ command: "TCG" });
			full.waiting();
			await fillRoom(full);

			YGOProRoomList.addRoom(dueling);
			YGOProRoomList.addRoom(full);

			expect(YGOProRoomList.findJoinableByName("TCG")).toBeNull();
		});

		it("does NOT match a different room name", () => {
			const waiting = YGOProRoomMother.create({ command: "TCG" });
			waiting.waiting();
			YGOProRoomList.addRoom(waiting);

			expect(YGOProRoomList.findJoinableByName("tcg")).toBeNull(); // case-sensitive
		});

		// requireEmptyPassword must be evaluated as part of the scan predicate,
		// not as a post-check on whatever findJoinableByName returns first —
		// otherwise one passworded waiting room with the same name would
		// permanently shadow every later passwordless one, since the scan would
		// keep returning the passworded room (which then fails the post-check)
		// instead of continuing to look.
		describe("requireEmptyPassword option", () => {
			it("skips a passworded waiting room and returns a passwordless waiting room with the same name", () => {
				const passworded = YGOProRoomMother.create({ command: "TCG#secret" });
				passworded.waiting();

				const passwordless = YGOProRoomMother.create({ command: "TCG" });
				passwordless.waiting();

				// Passworded room added FIRST — a naive first-match scan (or a
				// post-check bolted onto one) would pick it and stop there.
				YGOProRoomList.addRoom(passworded);
				YGOProRoomList.addRoom(passwordless);

				expect(YGOProRoomList.findJoinableByName("TCG", { requireEmptyPassword: true })).toBe(
					passwordless,
				);
			});

			it("returns null when every same-named waiting room is passworded", () => {
				const passworded = YGOProRoomMother.create({ command: "TCG#secret" });
				passworded.waiting();
				YGOProRoomList.addRoom(passworded);

				expect(YGOProRoomList.findJoinableByName("TCG", { requireEmptyPassword: true })).toBeNull();
			});

			it("without the option (default), a passworded waiting room is still returned — existing callers unaffected", () => {
				const passworded = YGOProRoomMother.create({ command: "TCG#secret" });
				passworded.waiting();
				YGOProRoomList.addRoom(passworded);

				expect(YGOProRoomList.findJoinableByName("TCG")).toBe(passworded);
			});
		});

		// The pairing scan must account for room.league — otherwise a `tcg`
		// room created by a PIN/ticket-authenticated (ranked) player would
		// capture every guest's pairing join, and RoomAdmission would then
		// hard-reject a guest joining a ranked room (JOINERROR + close), with
		// no fallback.
		describe("excludeRankedForGuest option", () => {
			const makeRankedRoom = (): YGOProRoom =>
				YGOProRoom.create(
					randomId(),
					"TCG",
					new LoggerMock(),
					new EventEmitter(),
					{ name: "Host", password: "1234", previousMessage: Buffer.alloc(0) } as never,
					"sock-host",
					new MessageRepositoryMock(),
				);

			it("skips a ranked (external) room and returns null when it's the only candidate", () => {
				const ranked = makeRankedRoom();
				expect(ranked.league.type).toBe("external");
				YGOProRoomList.addRoom(ranked);

				expect(
					YGOProRoomList.findJoinableByName("TCG", { excludeRankedForGuest: true }),
				).toBeNull();
			});

			it("without the option (default), the same ranked room is still returned", () => {
				const ranked = makeRankedRoom();
				YGOProRoomList.addRoom(ranked);

				expect(YGOProRoomList.findJoinableByName("TCG")).toBe(ranked);
			});
		});
	});

	describe("findPairingReconnectTarget", () => {
		it("returns null when no room with that name exists", () => {
			expect(YGOProRoomList.findPairingReconnectTarget("NOTHING", () => true)).toBeNull();
		});

		it("skips a WAITING room even when the predicate would match", () => {
			const waiting = YGOProRoomMother.create({ command: "TCG" });
			waiting.waiting();
			YGOProRoomList.addRoom(waiting);

			expect(YGOProRoomList.findPairingReconnectTarget("TCG", () => true)).toBeNull();
		});

		it("skips a passworded room even when it is non-WAITING and the predicate would match", () => {
			const passworded = YGOProRoomMother.create({ command: "TCG#secret" });
			passworded.rps(); // lightweight non-waiting transition, no OCGCore needed
			YGOProRoomList.addRoom(passworded);

			expect(YGOProRoomList.findPairingReconnectTarget("TCG", () => true)).toBeNull();
		});

		it("does NOT match a different room name", () => {
			const room = YGOProRoomMother.create({ command: "TCG" });
			room.rps(); // lightweight non-waiting transition, no OCGCore needed
			YGOProRoomList.addRoom(room);

			expect(YGOProRoomList.findPairingReconnectTarget("tcg", () => true)).toBeNull(); // case-sensitive
		});

		it("returns null when the predicate rejects every matching candidate", () => {
			const room = YGOProRoomMother.create({ command: "TCG" });
			room.rps(); // lightweight non-waiting transition, no OCGCore needed
			YGOProRoomList.addRoom(room);

			expect(YGOProRoomList.findPairingReconnectTarget("TCG", () => false)).toBeNull();
		});

		it("returns the same-name, passwordless, non-WAITING room the predicate accepts", () => {
			const room = YGOProRoomMother.create({ command: "TCG" });
			room.rps(); // lightweight non-waiting transition, no OCGCore needed
			YGOProRoomList.addRoom(room);

			expect(
				YGOProRoomList.findPairingReconnectTarget("TCG", (candidate) => candidate === room),
			).toBe(room);
		});
	});
});

let idCounter = 90000;
function randomId(): number {
	idCounter += 1;
	return idCounter;
}
