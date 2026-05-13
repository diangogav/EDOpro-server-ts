import { TokenIndex } from "./TokenIndex";
import { YgoClient } from "../../client/domain/YgoClient";

// Minimal stub for YgoClient (abstract class) — no socket needed for pure domain tests
function makeClient(name = "player"): YgoClient {
	return {
		id: "1",
		name,
		position: 0,
		team: 0,
		host: false,
		isSpectator: false,
		isReady: false,
		isReconnecting: false,
		reconnectionToken: null,
	} as unknown as YgoClient;
}

describe("TokenIndex", () => {
	let index: TokenIndex;

	beforeEach(() => {
		// Create a fresh instance for each test — bypassing the singleton for isolation
		index = TokenIndex.createForTests();
	});

	describe("register / find (back-compat reconnect path)", () => {
		it("register without kind defaults to reconnect", () => {
			const client = makeClient();
			index.register("tok1", client, 10);
			const entry = index.find("tok1", "reconnect");
			expect(entry).toBeDefined();
			expect(entry?.kind).toBe("reconnect");
			expect(entry?.roomId).toBe(10);
		});

		it("register with explicit kind='reconnect' stores reconnect entry", () => {
			const client = makeClient();
			index.register("tok2", client, 20, "reconnect");
			const entry = index.find("tok2", "reconnect");
			expect(entry).toBeDefined();
			expect(entry?.kind).toBe("reconnect");
		});

		it("find without kind returns entry regardless of kind", () => {
			const client = makeClient();
			index.register("tok3", client, 30);
			const entry = index.find("tok3");
			expect(entry).toBeDefined();
		});

		it("find with wrong kind returns undefined", () => {
			const client = makeClient();
			index.register("tok4", client, 40);
			const entry = index.find("tok4", "windbot");
			expect(entry).toBeUndefined();
		});
	});

	describe("registerWindbot", () => {
		it("stores botInfo and kind=windbot", () => {
			index.registerWindbot("wtok1", 99, { name: "Anna", deck: "Anna.ydk" });
			const entry = index.find("wtok1", "windbot");
			expect(entry).toBeDefined();
			expect(entry?.kind).toBe("windbot");
			expect(entry?.roomId).toBe(99);
			// Cast after the kind assertion above confirms the discriminant
			const windBotEntry = entry as Extract<typeof entry, { kind: "windbot" }>;
			expect(windBotEntry?.botInfo).toEqual({ name: "Anna", deck: "Anna.ydk" });
			expect(windBotEntry?.client).toBeNull();
		});

		it("windbot token is NOT findable as reconnect", () => {
			index.registerWindbot("wtok2", 99, { name: "Anna", deck: "Anna.ydk" });
			const entry = index.find("wtok2", "reconnect");
			expect(entry).toBeUndefined();
		});

		it("reconnect token is NOT findable as windbot", () => {
			const client = makeClient();
			index.register("rtok1", client, 50);
			const entry = index.find("rtok1", "windbot");
			expect(entry).toBeUndefined();
		});
	});

	describe("consume (atomic find + delete)", () => {
		it("consume with correct kind returns entry and removes it", () => {
			index.registerWindbot("wtok3", 10, { name: "Bob", deck: "Bob.ydk" });
			const result = index.consume("wtok3", "windbot");
			expect(result).toBeDefined();
			expect(result?.kind).toBe("windbot");
			// Second consume must return undefined (one-shot)
			const again = index.consume("wtok3", "windbot");
			expect(again).toBeUndefined();
		});

		it("windbot token is not consumable as reconnect — entry remains", () => {
			index.registerWindbot("wtok4", 11, { name: "Bob", deck: "Bob.ydk" });
			const result = index.consume("wtok4", "reconnect");
			expect(result).toBeUndefined();
			// Entry still present
			const stillThere = index.find("wtok4", "windbot");
			expect(stillThere).toBeDefined();
		});

		it("reconnect token is not consumable as windbot — entry remains", () => {
			const client = makeClient();
			index.register("rtok2", client, 60);
			const result = index.consume("rtok2", "windbot");
			expect(result).toBeUndefined();
			// Entry still present
			const stillThere = index.find("rtok2", "reconnect");
			expect(stillThere).toBeDefined();
		});

		it("consume on missing token returns undefined", () => {
			const result = index.consume("nonexistent", "windbot");
			expect(result).toBeUndefined();
		});

		it("reconnect token consumed with correct kind is removed (one-shot)", () => {
			const client = makeClient();
			index.register("rtok3", client, 70);
			const result = index.consume("rtok3", "reconnect");
			expect(result).toBeDefined();
			expect(result?.kind).toBe("reconnect");
			const again = index.consume("rtok3", "reconnect");
			expect(again).toBeUndefined();
		});
	});

	describe("clearByRoom", () => {
		it("clears only windbot tokens for the given roomId", () => {
			const client = makeClient();
			index.register("rtok-room1", client, 1);
			index.registerWindbot("wtok-room1a", 1, { name: "A", deck: "a.ydk" });
			index.registerWindbot("wtok-room1b", 1, { name: "B", deck: "b.ydk" });
			index.registerWindbot("wtok-room2", 2, { name: "C", deck: "c.ydk" });

			const cleared = index.clearByRoom(1, "windbot");

			expect(cleared).toBe(2);
			// windbot tokens for room 1 gone
			expect(index.find("wtok-room1a")).toBeUndefined();
			expect(index.find("wtok-room1b")).toBeUndefined();
			// windbot token for room 2 still present
			expect(index.find("wtok-room2", "windbot")).toBeDefined();
			// reconnect token for room 1 NOT touched
			expect(index.find("rtok-room1", "reconnect")).toBeDefined();
		});

		it("clears only reconnect tokens for the given roomId when kind=reconnect", () => {
			const c1 = makeClient("p1");
			const c2 = makeClient("p2");
			index.register("rtokA", c1, 5);
			index.register("rtokB", c2, 5);
			index.registerWindbot("wtokA", 5, { name: "A", deck: "a.ydk" });

			const cleared = index.clearByRoom(5, "reconnect");

			expect(cleared).toBe(2);
			expect(index.find("rtokA")).toBeUndefined();
			expect(index.find("rtokB")).toBeUndefined();
			// windbot token untouched
			expect(index.find("wtokA", "windbot")).toBeDefined();
		});

		it("returns 0 when no tokens match roomId+kind", () => {
			index.registerWindbot("wtok-x", 99, { name: "X", deck: "x.ydk" });
			const cleared = index.clearByRoom(42, "windbot");
			expect(cleared).toBe(0);
		});
	});

	describe("unregister", () => {
		it("removes the token regardless of kind when no kind passed", () => {
			const client = makeClient();
			index.register("rtok-del", client, 1);
			index.unregister("rtok-del");
			expect(index.find("rtok-del")).toBeUndefined();
		});

		it("removes token when kind matches", () => {
			index.registerWindbot("wtok-del", 1, { name: "X", deck: "x.ydk" });
			index.unregister("wtok-del", "windbot");
			expect(index.find("wtok-del")).toBeUndefined();
		});

		it("does NOT remove token when kind does not match", () => {
			index.registerWindbot("wtok-nomatch", 1, { name: "X", deck: "x.ydk" });
			index.unregister("wtok-nomatch", "reconnect");
			expect(index.find("wtok-nomatch", "windbot")).toBeDefined();
		});
	});

	describe("clear", () => {
		it("removes all entries", () => {
			const client = makeClient();
			index.register("r1", client, 1);
			index.registerWindbot("w1", 1, { name: "X", deck: "x.ydk" });
			index.clear();
			expect(index.find("r1")).toBeUndefined();
			expect(index.find("w1")).toBeUndefined();
		});
	});
});
