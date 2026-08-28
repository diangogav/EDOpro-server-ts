import { EventEmitter } from "stream";

import * as uniqueIdModule from "src/utils/generateUniqueId";

import { MessageRepositoryMock } from "@test-support/mocks/MessageRepositoryMock";

import { JoinContext } from "./JoinStrategy";
import { findOrCreateRoom } from "./findOrCreateRoom";
import { YGOProRoom } from "../../domain/YGOProRoom";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

// ---- helpers ----

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
});

const makeCtx = (overrides: Partial<JoinContext> = {}): JoinContext =>
	({
		rawPass: "TESTROOM",
		command: "TESTROOM",
		password: "",
		playerInfo: { name: "TestPlayer", password: "", previousMessage: Buffer.alloc(0) },
		socket: { id: "sock-1", destroy: jest.fn(), close: jest.fn(), send: jest.fn() },
		socketId: "sock-1",
		eventEmitter: new EventEmitter(),
		messageRepository: makeMessageRepository(),
		logger: makeLogger(),
		message: { data: Buffer.alloc(0), previousMessage: Buffer.alloc(0) },
		...overrides,
	}) as unknown as JoinContext;

async function seatGuest(room: YGOProRoom, name: string): Promise<void> {
	const socket = {
		id: `s-${name}`,
		send: jest.fn(),
		close: jest.fn(),
		destroy: jest.fn(),
		onMessage: jest.fn(),
		removeAllListeners: jest.fn(),
	};
	const target = room.admissionTarget(socket as never, { name, password: "" } as never);
	const seat = target.freeSeat();
	if (!seat) throw new Error(`seatGuest: no free seat for ${name}`);
	await target.seatPlayer({ kind: "guest", name }, seat);
}

// ---- tests ----

/**
 * findOrCreateRoom is the shared find-or-create logic used by
 * DefaultJoinStrategy and TicketJoinStrategy, parameterized by
 * { rankedOverride }. This is a pure characterization of that shared
 * behavior; DefaultJoinStrategy.test.ts and TicketJoinStrategy.test.ts
 * continue to cover the strategies' own contracts end-to-end.
 */
describe("findOrCreateRoom", () => {
	let waitingSpy: jest.SpyInstance;

	beforeEach(() => {
		waitingSpy = jest.spyOn(YGOProRoom.prototype, "waiting").mockImplementation(() => undefined);
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
	});

	afterEach(() => {
		waitingSpy.mockRestore();
	});

	it("returns the existing room when both its name and password match the joiner's", () => {
		const room = YGOProRoom.create(
			1,
			"TESTROOM#secret",
			makeLogger() as never,
			new EventEmitter(),
			{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock-orig",
			makeMessageRepository() as never,
		);
		YGOProRoomList.addRoom(room);

		const result = findOrCreateRoom(makeCtx({ command: "TESTROOM", password: "secret" }), {
			rankedOverride: undefined,
		});

		expect(result).toBe(room);
	});

	it("returns the same room mid-duel when the (name, password) pair matches — state-blind, spectating decided downstream", () => {
		const room = YGOProRoom.create(
			1,
			"TESTROOM#secret",
			makeLogger() as never,
			new EventEmitter(),
			{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock-orig",
			makeMessageRepository() as never,
		);
		YGOProRoomList.addRoom(room);
		room.rps(); // lightweight non-waiting transition, no OCGCore needed

		const result = findOrCreateRoom(makeCtx({ command: "TESTROOM", password: "secret" }), {
			rankedOverride: undefined,
		});

		expect(result).toBe(room);
	});

	it("creates a new room with the joiner's own password when no room matches the (name, password) pair, leaving the mismatched room untouched", () => {
		const room = YGOProRoom.create(
			1,
			"TESTROOM#secret",
			makeLogger() as never,
			new EventEmitter(),
			{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock-orig",
			makeMessageRepository() as never,
		);
		YGOProRoomList.addRoom(room);

		const result = findOrCreateRoom(
			makeCtx({ rawPass: "TESTROOM#wrong", command: "TESTROOM", password: "wrong" }),
			{ rankedOverride: undefined },
		);

		expect(result).not.toBe(room);
		expect(result.name).toBe("TESTROOM");
		expect(result.password).toBe("wrong");
		expect(YGOProRoomList.getRooms()).toHaveLength(2);
	});

	// A bare-token pairing room (password "") sharing a name with a joiner's
	// passworded command must not block the passworded room from being
	// created — the two are distinguished by the full (name, password) pair.
	it("a passwordless room with the same name does not block a passworded join from creating its own room", () => {
		const passwordless = YGOProRoom.create(
			1,
			"edison",
			makeLogger() as never,
			new EventEmitter(),
			{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock-orig",
			makeMessageRepository() as never,
		);
		YGOProRoomList.addRoom(passwordless);

		const result = findOrCreateRoom(
			makeCtx({ rawPass: "edison#123", command: "edison", password: "123" }),
			{ rankedOverride: undefined },
		);

		expect(result).not.toBe(passwordless);
		expect(result.name).toBe("edison");
		expect(result.password).toBe("123");
	});

	it("two joins with the same name but different passwords land in two distinct rooms", () => {
		const first = findOrCreateRoom(
			makeCtx({ rawPass: "edison#123", command: "edison", password: "123" }),
			{ rankedOverride: undefined },
		);
		const second = findOrCreateRoom(
			makeCtx({ rawPass: "edison#456", command: "edison", password: "456" }),
			{ rankedOverride: undefined },
		);

		expect(second).not.toBe(first);
		expect(first.password).toBe("123");
		expect(second.password).toBe("456");
	});

	it("a second join with the same (name, password) pair lands in the first joiner's room and can seat as its second player", async () => {
		const first = findOrCreateRoom(
			makeCtx({
				rawPass: "edison#123",
				command: "edison",
				password: "123",
				messageRepository: new MessageRepositoryMock() as never,
			}),
			{ rankedOverride: undefined },
		);
		await seatGuest(first, "P1");

		const second = findOrCreateRoom(
			makeCtx({
				rawPass: "edison#123",
				command: "edison",
				password: "123",
				messageRepository: new MessageRepositoryMock() as never,
			}),
			{ rankedOverride: undefined },
		);

		expect(second).toBe(first);

		await seatGuest(second, "P2");

		expect(second.playersCount).toBe(2);
	});

	it("resolves a matchmaking-shaped join string by the exact (name, password) pair", () => {
		const room = YGOProRoom.create(
			1,
			"tt,mmabc12#xyz1234",
			makeLogger() as never,
			new EventEmitter(),
			{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock-orig",
			makeMessageRepository() as never,
		);
		YGOProRoomList.addRoom(room);

		const result = findOrCreateRoom(
			makeCtx({
				rawPass: "tt,mmabc12#xyz1234",
				command: "tt,mmabc12",
				password: "xyz1234",
			}),
			{ rankedOverride: undefined },
		);

		expect(result).toBe(room);
	});

	// Matchmaking passwords are machine-generated (randomBase36) and never
	// typed by a human, so this mismatch is not reachable in practice — it is
	// pinned here only to document that the (name, password) model applies
	// uniformly, with no special case for matchmaking-shaped commands.
	it("creates a throwaway room when a matchmaking-shaped password does not match", () => {
		const room = YGOProRoom.create(
			1,
			"tt,mmabc12#xyz1234",
			makeLogger() as never,
			new EventEmitter(),
			{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock-orig",
			makeMessageRepository() as never,
		);
		YGOProRoomList.addRoom(room);

		const result = findOrCreateRoom(
			makeCtx({
				rawPass: "tt,mmabc12#wrongpass",
				command: "tt,mmabc12",
				password: "wrongpass",
			}),
			{ rankedOverride: undefined },
		);

		expect(result).not.toBe(room);
		expect(result.name).toBe("tt,mmabc12");
	});

	it("creates a new ranked room with the joiner's password when no room matches the (name, password) pair (TicketJoinStrategy's contract)", () => {
		const room = YGOProRoom.create(
			1,
			"edison",
			makeLogger() as never,
			new EventEmitter(),
			{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock-orig",
			makeMessageRepository() as never,
		);
		YGOProRoomList.addRoom(room);

		const result = findOrCreateRoom(
			makeCtx({ rawPass: "edison#123", command: "edison", password: "123" }),
			{ rankedOverride: true },
		);

		expect(result).not.toBe(room);
		expect(result.password).toBe("123");
		expect(result.ranked).toBe(true);
	});

	it("creates and registers a new room, calling waiting(), when none exists", () => {
		const result = findOrCreateRoom(
			makeCtx({ rawPass: "NEWROOM", command: "NEWROOM", password: "" }),
			{ rankedOverride: undefined },
		);

		expect(result).not.toBeNull();
		expect(YGOProRoomList.findByName("NEWROOM")).toBe(result);
		expect(waitingSpy).toHaveBeenCalledTimes(1);
	});

	it("logs a single info line naming the room and the non-pairing path when creating a room for a non-pairing join", () => {
		const logger = makeLogger();

		findOrCreateRoom(
			makeCtx({ rawPass: "LOGGEDROOM#secret", command: "LOGGEDROOM", password: "secret", logger }),
			{ rankedOverride: undefined },
		);

		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("LOGGEDROOM"));
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("non-pairing"));
	});

	it("logs a single info line naming the room and the pairing path when creating a room for a pairing join", () => {
		const logger = makeLogger();

		findOrCreateRoom(
			makeCtx({
				rawPass: "TCG",
				command: "TCG",
				password: "",
				logger,
				messageRepository: new MessageRepositoryMock() as never,
			}),
			{ rankedOverride: undefined },
		);

		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("TCG"));
		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("pairing"));
	});

	it("does not log when a non-pairing join reuses an existing room", () => {
		const existing = YGOProRoom.create(
			1,
			"REUSEDROOM",
			makeLogger() as never,
			new EventEmitter(),
			{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock-orig",
			makeMessageRepository() as never,
		);
		YGOProRoomList.addRoom(existing);
		const logger = makeLogger();

		findOrCreateRoom(
			makeCtx({ rawPass: "REUSEDROOM", command: "REUSEDROOM", password: "", logger }),
			{
				rankedOverride: undefined,
			},
		);

		expect(logger.info).not.toHaveBeenCalled();
	});

	it("creates a ranked room when rankedOverride is true (TicketJoinStrategy's contract)", () => {
		const result = findOrCreateRoom(
			makeCtx({ rawPass: "RANKEDROOM", command: "RANKEDROOM", password: "" }),
			{ rankedOverride: true },
		);

		expect(result?.ranked).toBe(true);
	});

	it("creates an unranked room when rankedOverride is undefined and no pin was supplied (DefaultJoinStrategy's contract)", () => {
		const result = findOrCreateRoom(
			makeCtx({ rawPass: "PLAINROOM", command: "PLAINROOM", password: "" }),
			{ rankedOverride: undefined },
		);

		expect(result?.ranked).toBe(false);
	});

	// Pairing joins. A join is a PAIRING JOIN when the password is empty and
	// every comma-separated token is recognized (or "casual"). For a pairing
	// join, findOrCreateRoom routes via findJoinableByName (state- and
	// seat-aware) instead of findByNameAndPassword (first-match on the exact
	// pair, state-blind) — so a pairing join can NEVER land in a dueling or
	// full room. Non-pairing joins use the findByNameAndPassword behavior
	// tested above.
	describe("pairing joins", () => {
		// Uses the full MessageRepositoryMock (not the local ad-hoc stub) because
		// scenario 8 seats real players, which exercises joinGameMessage /
		// typeChangeMessage / playerEnterMessage / playerChangeMessage too.
		const pairCtx = (command: string) =>
			makeCtx({
				rawPass: command,
				command,
				password: "",
				messageRepository: new MessageRepositoryMock() as never,
			});

		it("scenario 1 — a second joiner with the same recognized command joins the first's waiting room", () => {
			const first = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined });
			const second = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined });

			expect(second).toBe(first);
		});

		it("scenario 2 — a third sender while the room duels gets a NEW room, never the dueling one", () => {
			const first = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined })!;
			first.rps(); // lightweight non-waiting transition, no OCGCore needed

			const third = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined });

			expect(third).not.toBe(first);
			expect(third?.duelState).toBe("waiting");
		});

		it("scenario 3 — a fourth sender pairs with the third's waiting room, not the dueling one", () => {
			const first = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined })!;
			first.rps();
			const third = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined })!;
			// Sanity: the third sender must have landed in a NEW room, not the
			// dueling one — otherwise "fourth pairs with third" would be trivially
			// true even without real pairing behavior.
			expect(third).not.toBe(first);

			const fourth = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined });

			expect(fourth).toBe(third);
			expect(fourth).not.toBe(first);
		});

		it("scenario 4 — a passworded command (edison#torneo) resolves by the (name, password) pair, unchanged when it matches", () => {
			const room = findOrCreateRoom(
				makeCtx({ rawPass: "edison#torneo", command: "edison", password: "torneo" }),
				{ rankedOverride: undefined },
			);
			room.rps(); // dueling-like — findByNameAndPassword must NOT skip it (state-blind)

			const second = findOrCreateRoom(
				makeCtx({ rawPass: "edison#torneo", command: "edison", password: "torneo" }),
				{ rankedOverride: undefined },
			);

			expect(second).toBe(room);
		});

		it("scenario 5 — an unrecognized command (salaDeJuan) still resolves by the (name, password) pair, unchanged", () => {
			const room = findOrCreateRoom(pairCtx("salaDeJuan"), { rankedOverride: undefined });
			room.rps();

			const second = findOrCreateRoom(pairCtx("salaDeJuan"), { rankedOverride: undefined });

			expect(second).toBe(room);
		});

		it("scenario 6 — TCG and tcg remain distinct pairing pools (case-sensitive room identity)", () => {
			const upper = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined });
			const lower = findOrCreateRoom(pairCtx("tcg"), { rankedOverride: undefined });

			expect(upper).not.toBe(lower);
		});

		it('scenario 7 — "edison,ns,tm" is NOT a pairing join ("tm" has no digits, unrecognized) — findByNameAndPassword applies', () => {
			const command = "edison,ns,tm";
			const room = findOrCreateRoom(pairCtx(command), { rankedOverride: undefined });
			room.rps(); // dueling-like

			const second = findOrCreateRoom(pairCtx(command), { rankedOverride: undefined });

			// If this were (wrongly) treated as a pairing join, the dueling room
			// would be skipped and a NEW room created instead.
			expect(second).toBe(room);
		});

		it("scenario 8 — a tag room (t,edison) pairs joiners until all 4 seats fill, then creates a new room", async () => {
			const command = "t,edison";
			const room = findOrCreateRoom(pairCtx(command), { rankedOverride: undefined })!;

			// TAG mode: team0=2, team1=2 → 4 total seats.
			await seatGuest(room, "P1");
			expect(findOrCreateRoom(pairCtx(command), { rankedOverride: undefined })).toBe(room);

			await seatGuest(room, "P2");
			await seatGuest(room, "P3");
			await seatGuest(room, "P4");

			// Room is now full (4/4) — the next pairing joiner must get a NEW room.
			const fifth = findOrCreateRoom(pairCtx(command), { rankedOverride: undefined });
			expect(fifth).not.toBe(room);
		});

		it("a passworded edison#123 room created by a non-pairing join does not block a later bare edison pairing join from creating its own passwordless room", () => {
			const passworded = findOrCreateRoom(
				makeCtx({ rawPass: "edison#123", command: "edison", password: "123" }),
				{ rankedOverride: undefined },
			);
			expect(passworded.password).toBe("123");

			const firstPairing = findOrCreateRoom(pairCtx("edison"), { rankedOverride: undefined });
			expect(firstPairing).not.toBe(passworded);
			expect(firstPairing?.password).toBe("");

			const secondPairing = findOrCreateRoom(pairCtx("edison"), { rankedOverride: undefined });
			expect(secondPairing).toBe(firstPairing);
		});

		// The pairing scan must evaluate password === "" per candidate, not as a
		// post-check on whatever findJoinableByName returns first — otherwise
		// one passworded `tcg#secret` room in WAITING would permanently shadow
		// every later passwordless `tcg` room, and no pairing joiner would ever
		// pair.
		describe("password does not permanently disable pairing", () => {
			it("a passworded waiting room does not block pairing — a later passwordless waiting room pairs instead", () => {
				const passworded = YGOProRoom.create(
					1,
					"TCG#secret",
					makeLogger() as never,
					new EventEmitter(),
					{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
					"sock-orig",
					makeMessageRepository() as never,
				);
				YGOProRoomList.addRoom(passworded);

				const passwordless = YGOProRoom.create(
					2,
					"TCG",
					makeLogger() as never,
					new EventEmitter(),
					{ name: "Q", password: "", previousMessage: Buffer.alloc(0) } as never,
					"sock-orig-2",
					makeMessageRepository() as never,
				);
				YGOProRoomList.addRoom(passwordless);

				const joiner = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined });

				expect(joiner).toBe(passwordless);
			});

			it("when only a passworded same-named room exists, pairing creates a new room, and a second pairing joiner pairs with THAT one (not another new room)", () => {
				const passworded = YGOProRoom.create(
					1,
					"TCG#secret",
					makeLogger() as never,
					new EventEmitter(),
					{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
					"sock-orig",
					makeMessageRepository() as never,
				);
				YGOProRoomList.addRoom(passworded);

				const created = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined });
				expect(created).not.toBe(passworded);
				expect(created?.password).toBe("");

				const pairedWithCreated = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined });
				expect(pairedWithCreated).toBe(created);
			});
		});

		// The pairing scan must account for room.league — otherwise a `tcg`
		// room created by a PIN/authenticated (External/ranked) player would
		// capture guest pairing joins, and RoomAdmission would then hard-REJECT
		// the guest (JOINERROR + close) instead of falling back to a new room.
		describe("legacy by-name reconnect routing", () => {
			function makeSocket(overrides: { remoteAddress?: string; closed?: boolean } = {}) {
				return {
					id: `sock-${Math.random()}`,
					send: jest.fn(),
					close: jest.fn(),
					destroy: jest.fn(),
					onMessage: jest.fn(),
					removeAllListeners: jest.fn(),
					remoteAddress: overrides.remoteAddress ?? "1.2.3.4",
					closed: overrides.closed ?? false,
				} as unknown as JoinContext["socket"];
			}

			async function seatPlayer(
				room: YGOProRoom,
				name: string,
				socket: JoinContext["socket"],
			): Promise<void> {
				const target = room.admissionTarget(socket, {
					name,
					password: "",
					previousMessage: Buffer.alloc(0),
				} as never);
				const seat = target.freeSeat();
				if (!seat) throw new Error(`seatPlayer: no free seat for ${name}`);
				await target.seatPlayer({ kind: "guest", name }, seat);
			}

			function makeDuelingRoom(name: string): YGOProRoom {
				const room = YGOProRoom.create(
					1,
					name,
					makeLogger() as never,
					new EventEmitter(),
					{ name: "Host", password: "", previousMessage: Buffer.alloc(0) } as never,
					"sock-orig",
					new MessageRepositoryMock() as never,
				);
				YGOProRoomList.addRoom(room);
				return room;
			}

			const reconnectCtx = (
				name: string,
				playerName: string,
				socket: JoinContext["socket"],
			): JoinContext =>
				makeCtx({
					rawPass: name,
					command: name,
					password: "",
					playerInfo: {
						name: playerName,
						password: "",
						previousMessage: Buffer.alloc(0),
					} as never,
					socket,
					messageRepository: new MessageRepositoryMock() as never,
				});

			it("scenario 1 - a disconnected player re-sending their bare command is routed back to their own dueling room", async () => {
				const room = makeDuelingRoom("TCG");
				const originalSocket = makeSocket({ remoteAddress: "1.2.3.4", closed: false });
				await seatPlayer(room, "Player1", originalSocket);
				room.rps(); // lightweight non-waiting transition, no OCGCore needed
				originalSocket.closed = true;

				const result = findOrCreateRoom(
					reconnectCtx("TCG", "Player1", makeSocket({ remoteAddress: "1.2.3.4" })),
					{ rankedOverride: undefined },
				);

				expect(result).toBe(room);
				expect(result.id).toBe(room.id);
			});

			it("scenario 2 - a stranger sharing the nickname from a different remote address gets a new room, not the dueling one", async () => {
				const room = makeDuelingRoom("TCG");
				const originalSocket = makeSocket({ remoteAddress: "1.2.3.4", closed: true });
				await seatPlayer(room, "Player1", originalSocket);
				room.rps(); // lightweight non-waiting transition, no OCGCore needed

				const result = findOrCreateRoom(
					reconnectCtx("TCG", "Player1", makeSocket({ remoteAddress: "9.9.9.9" })),
					{ rankedOverride: undefined },
				);

				expect(result).not.toBe(room);
				expect(result.duelState).toBe("waiting");
			});

			it("scenario 3 - the original socket still open blocks the reconnect route (ghosting guard) and yields a new room", async () => {
				const room = makeDuelingRoom("TCG");
				const originalSocket = makeSocket({ remoteAddress: "1.2.3.4", closed: false });
				await seatPlayer(room, "Player1", originalSocket);
				room.rps(); // lightweight non-waiting transition, no OCGCore needed
				// originalSocket is left open (closed stays false).

				const result = findOrCreateRoom(
					reconnectCtx("TCG", "Player1", makeSocket({ remoteAddress: "1.2.3.4" })),
					{ rankedOverride: undefined },
				);

				expect(result).not.toBe(room);
				expect(result.duelState).toBe("waiting");
			});

			it("scenario 4 - with no dueling room for the name, ordinary pairing behavior is unaffected", () => {
				const first = findOrCreateRoom(pairCtx("TCG-RECONNECT-REGRESSION"), {
					rankedOverride: undefined,
				});
				const second = findOrCreateRoom(pairCtx("TCG-RECONNECT-REGRESSION"), {
					rankedOverride: undefined,
				});

				expect(second).toBe(first);
			});
		});

		describe("league-compatible pairing for guests", () => {
			const authedCtx = (name: string, pin: string) =>
				makeCtx({
					rawPass: "TCG",
					command: "TCG",
					password: "",
					playerInfo: { name, password: pin, previousMessage: Buffer.alloc(0) } as never,
					messageRepository: new MessageRepositoryMock() as never,
				});

			it("a guest pairing join skips an External (PIN-hosted) same-named room and gets a NEW room instead of being rejected", () => {
				const authedRoom = findOrCreateRoom(authedCtx("Host", "1234"), {
					rankedOverride: undefined,
				})!;
				expect(authedRoom.league.type).toBe("external");

				const guestJoin = findOrCreateRoom(pairCtx("TCG"), { rankedOverride: undefined });

				expect(guestJoin).not.toBeNull();
				expect(guestJoin).not.toBe(authedRoom);
			});

			it("an authenticated (PIN-carrying) pairing joiner still pairs into the same External room", () => {
				const authedRoom = findOrCreateRoom(authedCtx("Host", "1234"), {
					rankedOverride: undefined,
				})!;

				const secondAuthed = findOrCreateRoom(authedCtx("Guest2", "5678"), {
					rankedOverride: undefined,
				});

				expect(secondAuthed).toBe(authedRoom);
			});
		});
	});
});

describe("findOrCreateRoom — room id uniqueness", () => {
	let waitingSpy: jest.SpyInstance;

	beforeEach(() => {
		waitingSpy = jest.spyOn(YGOProRoom.prototype, "waiting").mockImplementation(() => undefined);
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
	});

	afterEach(() => {
		waitingSpy.mockRestore();
		jest.restoreAllMocks();
	});

	// findById is first-match: a created room reusing a live room's id would be
	// unreachable by every id-addressed path (watch joins, AIJOIN return trip).
	it("skips an id already used by a live room when creating", () => {
		const occupied = YGOProRoom.create(
			1234,
			"OCCUPIED",
			makeLogger() as never,
			new EventEmitter(),
			{ name: "P", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock-orig",
			makeMessageRepository() as never,
		);
		YGOProRoomList.addRoom(occupied);

		jest
			.spyOn(uniqueIdModule, "generateUniqueId")
			.mockReturnValueOnce(1234)
			.mockReturnValueOnce(5678);

		const result = findOrCreateRoom(makeCtx({ rawPass: "NEWROOM", command: "NEWROOM" }), {
			rankedOverride: undefined,
		});

		expect(result.id).toBe(5678);
		expect(YGOProRoomList.findById(1234)).toBe(occupied);
	});
});
