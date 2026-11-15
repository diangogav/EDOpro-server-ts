/**
 * Live harness against a running server. A seat that speaks the EDOPro wire
 * hosts a room on the EDOPro WebSocket, as the friend's desktop client would;
 * a seat that speaks plain YGOPro joins it through the YGOPro WebSocket with
 * `edo,<roomId>` and reads every frame with the library's own decoder, as any
 * YGOPro client does.
 *
 * Skipped unless EDOPRO_WS_URL and YGOPRO_WS_URL are set; ROOMS_URL adds the
 * checks that need the HTTP API. With EDOPRO_FRIEND=1 only the manual seat
 * runs: it hosts a room, prints its id and plays whoever joins.
 * EDOPRO_FRIEND_RULE picks the Master Rule (1 to 5) and EDOPRO_FRIEND_BANLIST
 * an EDOPro banlist by name.
 */
import {
	DUEL_MODE_BY_MASTER_RULE,
	DUEL_MODE_MR5,
	EdoproRoomOptions,
	buildCtosCreateGame,
	edoproBanlistHash,
} from "./edoproClientFrames.testing";
import {
	BATTLE_OX_ATTACK,
	BATTLE_OX_DECK,
	CTOS_HS_READY,
	CTOS_HS_START,
	CTOS_UPDATE_DECK,
	EDISON_VANILLA_DECK,
	LOCATION_MZONE,
	RECONNECT_COMMAND,
	SUMMON_ZONE,
	Seat,
	deckBody,
	openSeat,
	playerInfoFrame,
	ygoproJoinFrame,
} from "./seat.testing";

const EDOPRO_WS_URL = process.env.EDOPRO_WS_URL ?? "";
const YGOPRO_WS_URL = process.env.YGOPRO_WS_URL ?? "";
/** The YGOPro WebSocket as a client that declared itself ready for EDOPro rooms. */
const READY_CLIENT_URL = `${YGOPRO_WS_URL}?client=evoduel`;
const ROOMS_URL = process.env.ROOMS_URL ?? "";
const FRIEND = process.env.EDOPRO_FRIEND === "1";
const EDISON = "2010.03 Edison";
const GUEST_SEAT = 1;
const JOIN_ERROR = 1;
const DECK_ERROR = 2;
const UNKNOWN_CARD = 4;

const live = EDOPRO_WS_URL && YGOPRO_WS_URL && !FRIEND ? describe : describe.skip;
const liveWithApi =
	EDOPRO_WS_URL && YGOPRO_WS_URL && ROOMS_URL && !FRIEND ? describe : describe.skip;
const manual = EDOPRO_WS_URL && FRIEND ? describe : describe.skip;

const ROOM: EdoproRoomOptions = {
	banlistHash: 0,
	rule: 4,
	mode: 0,
	noCheckDeck: true,
	noShuffleDeck: false,
	startLp: 8000,
	startHand: 5,
	drawCount: 1,
	timeLimit: 180,
	duelFlagsLow: DUEL_MODE_MR5,
	duelFlagsHigh: 1,
	bestOf: 1,
	name: "live",
	password: "",
};

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(`no ${what} within ${ms}ms`)), ms),
		),
	]);
}

/** Hosts a room as an EDOPro client; it readies up and starts once the guest is ready. */
async function hostRoom(
	options: Partial<EdoproRoomOptions>,
	deck: readonly number[],
	name = "LiveHost",
): Promise<{ host: Seat; roomId: number; won: Promise<void> }> {
	let created: (roomId: number) => void = () => undefined;
	const roomId = new Promise<number>((resolve) => {
		created = resolve;
	});
	let finished: () => void = () => undefined;
	const won = new Promise<void>((resolve) => {
		finished = resolve;
	});
	const host = await openSeat({
		url: EDOPRO_WS_URL,
		name,
		wire: "edopro",
		rpsHand: 1,
		onEvent: (seat, event, value) => {
			if (event === "room-created" && value !== undefined) created(value);
			if (event === "player-ready" && value === GUEST_SEAT) {
				seat.send(CTOS_UPDATE_DECK, deckBody(deck));
				seat.send(CTOS_HS_READY);
				setTimeout(() => seat.send(CTOS_HS_START), 300);
			}
			if (event === "win") finished();
		},
	});
	host.socket.on("close", () => finished());
	host.socket.send(playerInfoFrame(name));
	host.socket.send(buildCtosCreateGame({ ...ROOM, ...options }));

	return { host, roomId: await within(roomId, 5_000, "room id"), won };
}

/** Joins as a client on the YGOPro server and readies up with `deck`. */
async function joinRoom(
	roomId: number,
	deck: readonly number[],
): Promise<{ guest: Seat; outcome: Promise<string>; won: Promise<void> }> {
	let settle: (outcome: string) => void = () => undefined;
	const outcome = new Promise<string>((resolve) => {
		settle = resolve;
	});
	let finished: () => void = () => undefined;
	const won = new Promise<void>((resolve) => {
		finished = resolve;
	});
	const guest = await openSeat({
		url: READY_CLIENT_URL,
		name: "LiveGuest",
		wire: "ygopro",
		rpsHand: 2,
		onEvent: (seat, event, value) => {
			if (event === "joined") {
				seat.send(CTOS_UPDATE_DECK, deckBody(deck));
				seat.send(CTOS_HS_READY);
			}
			if (event === "player-ready" && value === GUEST_SEAT) settle("ready");
			if (event === "error" && value !== undefined) {
				settle(`error kind ${value >>> 28}, card ${value & 0x0fff_ffff}`);
			}
			if (event === "win") finished();
		},
	});
	guest.socket.send(playerInfoFrame(guest.name));
	guest.socket.send(ygoproJoinFrame(roomId));

	return { guest, outcome, won };
}

const gameMessages = (seat: Seat): string[] =>
	seat.unsupported.filter((label) => label.startsWith("msg"));

live("EDOPro room joined from the YGOPro server (live server)", () => {
	it("plays a duel to MSG_WIN that a YGOPro client decodes frame by frame", async () => {
		const { host, roomId, won } = await hostRoom({ startLp: 1000 }, BATTLE_OX_DECK);
		const { guest, won: guestWon } = await joinRoom(roomId, BATTLE_OX_DECK);

		try {
			await within(Promise.all([won, guestWon]), 20_000, "MSG_WIN on both seats");
		} finally {
			host.socket.close();
			guest.socket.close();
		}

		const summoned = host.summoned;
		expect(summoned).not.toBeNull();
		expect(guest.unsupported).toEqual([]);
		expect(gameMessages(host)).toEqual([]);
		expect(guest.win?.player).toBe(host.win?.player);

		const field = guest.updates
			.filter((update) => update.location === LOCATION_MZONE)
			.filter((update) => update.cards.some((card) => card.empty !== true))
			.at(-1);
		expect(field?.cards[SUMMON_ZONE]).toMatchObject({
			code: summoned?.code,
			attack: BATTLE_OX_ATTACK,
			position: 0x1,
		});
		expect(guest.moves[0]).toMatchObject({
			code: summoned?.code,
			current: { location: LOCATION_MZONE, sequence: SUMMON_ZONE },
		});
		expect(guest.attacks[0]).toMatchObject({
			attacker: { location: LOCATION_MZONE, sequence: SUMMON_ZONE },
			defender: { location: 0 },
		});
		expect(guest.damages[0]).toMatchObject({ value: BATTLE_OX_ATTACK });
	}, 30_000);

	it("lets the guest come back to its duel with the reconnection token", async () => {
		const { host, roomId, won } = await hostRoom({ startLp: 1000 }, BATTLE_OX_DECK);
		let dropped: () => void = () => undefined;
		const guestDropped = new Promise<void>((resolve) => {
			dropped = resolve;
		});
		// The guest goes first: it leaves on its first prompt, mid-duel, without answering.
		const first = await openSeat({
			url: READY_CLIENT_URL,
			name: "LiveGuest",
			wire: "ygopro",
			rpsHand: 2,
			onEvent: (seat, event) => {
				if (event === "joined") {
					seat.send(CTOS_UPDATE_DECK, deckBody(BATTLE_OX_DECK));
					seat.send(CTOS_HS_READY);
				}
			},
			holdPrompt: (seat) => {
				seat.socket.close();
				dropped();

				return true;
			},
		});
		first.socket.send(playerInfoFrame(first.name));
		first.socket.send(ygoproJoinFrame(roomId));
		await within(guestDropped, 15_000, "first prompt of the guest");
		expect(first.reconnectToken).not.toBeNull();

		let acknowledged: (status: number) => void = () => undefined;
		const ack = new Promise<number>((resolve) => {
			acknowledged = resolve;
		});
		let finished: () => void = () => undefined;
		const guestWon = new Promise<void>((resolve) => {
			finished = resolve;
		});
		const back = await openSeat({
			url: READY_CLIENT_URL,
			name: "LiveGuest",
			wire: "ygopro",
			rpsHand: 2,
			onEvent: (_seat, event, value) => {
				if (event === "reconnect-ack" && value !== undefined) acknowledged(value);
				if (event === "win") finished();
			},
		});
		back.send(RECONNECT_COMMAND, Buffer.from(first.reconnectToken ?? "", "utf8"));

		try {
			expect(await within(ack, 10_000, "answer to the token")).toBe(0);
			await within(Promise.all([won, guestWon]), 20_000, "MSG_WIN on both seats");
		} finally {
			host.socket.close();
			back.socket.close();
		}

		expect(back.unsupported).toEqual([]);
		expect(back.idleCmds.length).toBeGreaterThan(0);
		expect(back.win?.player).toBe(host.win?.player);
	}, 60_000);

	it("turns away a client that did not declare itself ready for EDOPro rooms", async () => {
		const { host, roomId } = await hostRoom({}, BATTLE_OX_DECK);
		let refused: (code: number) => void = () => undefined;
		const joinError = new Promise<number>((resolve) => {
			refused = resolve;
		});
		const stranger = await openSeat({
			url: YGOPRO_WS_URL,
			name: "LiveStranger",
			wire: "ygopro",
			rpsHand: 2,
			onEvent: (seat, event) => {
				if (event === "error") refused(seat.errors[0].msg);
			},
		});
		stranger.socket.send(playerInfoFrame(stranger.name));
		stranger.socket.send(ygoproJoinFrame(roomId));

		try {
			expect(await within(joinError, 10_000, "answer to the join")).toBe(JOIN_ERROR);
		} finally {
			host.socket.close();
			stranger.socket.close();
		}
	}, 20_000);

	it("answers a deck with a card the EDOPro pool lacks with an error naming it", async () => {
		const unknownCode = 99999999;
		const { host, roomId } = await hostRoom({}, BATTLE_OX_DECK);
		const { guest, outcome } = await joinRoom(roomId, [unknownCode, ...BATTLE_OX_DECK.slice(1)]);

		try {
			expect(await within(outcome, 10_000, "answer to the deck")).toBe(
				`error kind ${UNKNOWN_CARD}, card ${unknownCode}`,
			);
			expect(guest.errors[0].msg).toBe(DECK_ERROR);
		} finally {
			host.socket.close();
			guest.socket.close();
		}
	}, 20_000);
});

liveWithApi("EDOPro room in the HTTP API (live server)", () => {
	it("lists the hosted room, only for a caller that asks for EDOPro rooms, with its join command", async () => {
		const { host, roomId } = await hostRoom({}, BATTLE_OX_DECK);

		try {
			const list = async (query: string): Promise<Array<{ id: number }>> =>
				(
					(await (await fetch(`${ROOMS_URL}/api/rooms${query}`)).json()) as {
						rooms: Array<{ id: number }>;
					}
				).rooms;

			// A caller that does not ask for EDOPro rooms keeps the list it always got.
			expect((await list("")).some((room) => room.id === roomId)).toBe(false);
			expect(
				(await list("?engines=ygopro,edopro")).find((room) => room.id === roomId),
			).toMatchObject({
				engine: "edopro",
				command: `edo,${roomId}`,
				canPlay: true,
			});
		} finally {
			host.socket.close();
		}
	}, 20_000);

	it("frees the seat when the guest disconnects in the lobby, and plays the next one who joins", async () => {
		const { host, roomId, won } = await hostRoom({ startLp: 1000 }, BATTLE_OX_DECK);
		const first = await joinRoom(roomId, BATTLE_OX_DECK);
		await within(first.outcome, 10_000, "first guest ready");
		const seatFreed = async (): Promise<boolean> => {
			const listing = (await (await fetch(`${ROOMS_URL}/api/rooms?engines=edopro`)).json()) as {
				rooms: Array<{ id: number; players: unknown[]; canPlay: boolean }>;
			};
			const room = listing.rooms.find((candidate) => candidate.id === roomId);

			return room !== undefined && room.players.length === 1 && room.canPlay;
		};

		first.guest.socket.close();
		let freed = false;
		for (let waited = 0; !freed && waited < 5_000; waited += 250) {
			await new Promise((resolve) => setTimeout(resolve, 250));
			freed = await seatFreed();
		}
		expect(freed).toBe(true);

		const second = await joinRoom(roomId, BATTLE_OX_DECK);
		try {
			await within(Promise.all([won, second.won]), 20_000, "MSG_WIN on both seats");
		} finally {
			host.socket.close();
			second.guest.socket.close();
		}

		expect(second.guest.win?.player).toBe(host.win?.player);
	}, 45_000);

	it("accepts an Edison deck with every pre-errata card the two Edison lists name differently", async () => {
		// As a YGOPro client has them in its deck: two of this project's own
		// copies (Necrovalley, Red-Eyes Darkness Metal Dragon), the pre-errata
		// copies both pools share, and one card EDOPro lists only as a copy.
		const preErrata = [
			910003011, 910003012, 511002993, 511002994, 511002992, 511002631, 511002995, 511002997,
			511003007, 511003028, 511000228, 25862681,
		];
		const { host, roomId } = await hostRoom(
			{
				banlistHash: await edoproBanlistHash(ROOMS_URL, EDISON),
				noCheckDeck: false,
				duelFlagsLow: DUEL_MODE_BY_MASTER_RULE[1],
			},
			EDISON_VANILLA_DECK,
		);
		const { guest, outcome } = await joinRoom(roomId, [
			...preErrata,
			...EDISON_VANILLA_DECK.slice(0, 31),
		]);

		try {
			expect(await within(outcome, 10_000, "answer to the deck")).toBe("ready");
		} finally {
			host.socket.close();
			guest.socket.close();
		}
	}, 20_000);
});

manual("EDOPro friend (manual)", () => {
	const waitMs = Number(process.env.EDOPRO_FRIEND_WAIT_MS ?? 15 * 60_000);
	const masterRule = Number(process.env.EDOPRO_FRIEND_RULE ?? 5);
	const banlist = process.env.EDOPRO_FRIEND_BANLIST ?? "";
	const name = process.env.EDOPRO_FRIEND_NAME ?? "EdoFriend";

	it(
		"hosts a room and plays whoever joins",
		async () => {
			const hash = banlist && ROOMS_URL ? await edoproBanlistHash(ROOMS_URL, banlist) : 0;
			const { host, roomId, won } = await hostRoom(
				{
					banlistHash: hash,
					noCheckDeck: hash === 0,
					startLp: Number(process.env.EDOPRO_FRIEND_LP ?? 8000),
					duelFlagsLow: DUEL_MODE_BY_MASTER_RULE[masterRule] ?? DUEL_MODE_MR5,
				},
				hash === 0 ? BATTLE_OX_DECK : EDISON_VANILLA_DECK,
				name,
			);
			process.stdout.write(`[${name}] room ${roomId} is waiting (Master Rule ${masterRule})\n`);

			await Promise.race([won, new Promise((resolve) => setTimeout(resolve, waitMs))]);
			process.stdout.write(
				`[${name}] unsupported: ${[...new Set(host.unsupported)].join(", ") || "-"}\n`,
			);
			host.socket.close();
		},
		waitMs + 5_000,
	);
});
