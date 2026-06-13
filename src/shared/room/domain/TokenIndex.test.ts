import { TokenIndex } from "./TokenIndex";
import { YgoClient } from "../../client/domain/YgoClient";

// Characterization test: pins the current behavior of the global reconnection
// token index BEFORE the shared reconnect layer is extracted. TokenIndex is an
// in-memory singleton (tokens are lost on process restart — accepted caveat).
describe("TokenIndex", () => {
	const fakeClient = (name: string): YgoClient =>
		({ name } as unknown as YgoClient);

	beforeEach(() => {
		TokenIndex.getInstance().clear();
	});

	it("is a singleton (same instance every call)", () => {
		expect(TokenIndex.getInstance()).toBe(TokenIndex.getInstance());
	});

	it("registers and finds a token entry by token", () => {
		const client = fakeClient("Alice");
		TokenIndex.getInstance().register("token-a", client, 7);

		const entry = TokenIndex.getInstance().find("token-a");

		expect(entry).toEqual({ client, roomId: 7 });
	});

	it("returns undefined for an unknown token", () => {
		expect(TokenIndex.getInstance().find("nope")).toBeUndefined();
	});

	it("ignores registration with an empty token", () => {
		TokenIndex.getInstance().register("", fakeClient("Bob"), 1);

		expect(TokenIndex.getInstance().find("")).toBeUndefined();
	});

	it("unregisters a token so it can no longer be found", () => {
		const client = fakeClient("Carol");
		TokenIndex.getInstance().register("token-c", client, 3);

		TokenIndex.getInstance().unregister("token-c");

		expect(TokenIndex.getInstance().find("token-c")).toBeUndefined();
	});

	it("supports rotation semantics: old token gone, new token resolves", () => {
		const client = fakeClient("Dave");
		TokenIndex.getInstance().register("old", client, 5);

		TokenIndex.getInstance().unregister("old");
		TokenIndex.getInstance().register("new", client, 5);

		expect(TokenIndex.getInstance().find("old")).toBeUndefined();
		expect(TokenIndex.getInstance().find("new")).toEqual({ client, roomId: 5 });
	});

	it("clear() removes every registered token", () => {
		TokenIndex.getInstance().register("t1", fakeClient("E"), 1);
		TokenIndex.getInstance().register("t2", fakeClient("F"), 2);

		TokenIndex.getInstance().clear();

		expect(TokenIndex.getInstance().find("t1")).toBeUndefined();
		expect(TokenIndex.getInstance().find("t2")).toBeUndefined();
	});
});
