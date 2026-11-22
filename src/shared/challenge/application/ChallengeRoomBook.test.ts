import { CHALLENGE_ROOM_TTL_MS, ChallengeRoomBook } from "./ChallengeRoomBook";

const makeBook = () => {
	let now = 0;
	let tokens = 0;
	const book = new ChallengeRoomBook({
		now: () => now,
		randomToken: () => `token${String(++tokens).padStart(11, "0")}`,
	});

	return {
		book,
		advance: (ms: number) => {
			now += ms;
		},
	};
};

describe("ChallengeRoomBook", () => {
	it("issues a room with a code, an internal password, the full command and its players", () => {
		const { book } = makeBook();

		const room = book.issue({ format: "jtp-adv-2007-03", ranked: false, userIds: [] });

		expect(room).toEqual({
			code: "token00000000001",
			password: "token00000000002",
			command: "jtp-2007-03,casual",
			format: "jtp-adv-2007-03",
			ranked: false,
			userIds: [],
			expiresAt: CHALLENGE_ROOM_TTL_MS,
		});
		expect(book.resolve("token00000000001")).toEqual(room);
	});

	it("keeps the two accounts of a ranked room", () => {
		const { book } = makeBook();

		const room = book.issue({ format: "goat", ranked: true, userIds: ["user-1", "user-2"] });

		expect(room.command).toBe("goat");
		expect(book.resolve(room.code)?.userIds).toEqual(["user-1", "user-2"]);
	});

	it("forgets a room once its time to live has passed", () => {
		const { book, advance } = makeBook();
		const room = book.issue({ format: "edison", ranked: false, userIds: [] });

		advance(CHALLENGE_ROOM_TTL_MS - 1);
		expect(book.resolve(room.code)).not.toBeNull();
		advance(1);
		expect(book.resolve(room.code)).toBeNull();
	});

	it("resolves an unknown code to null", () => {
		const { book } = makeBook();

		expect(book.resolve("nothing0issued00")).toBeNull();
	});

	it("refuses a format it cannot build a room for", () => {
		const { book } = makeBook();

		expect(() => book.issue({ format: "tengu", ranked: false, userIds: [] })).toThrow(
			"Unknown challenge format: tengu",
		);
	});

	it("draws codes and passwords of 16 base36 characters by default", () => {
		const room = new ChallengeRoomBook().issue({ format: "tcg", ranked: false, userIds: [] });

		expect(room.code).toMatch(/^[0-9a-z]{16}$/);
		expect(room.password).toMatch(/^[0-9a-z]{16}$/);
		expect(room.password).not.toBe(room.code);
	});
});
