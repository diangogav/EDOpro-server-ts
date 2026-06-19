import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { JoinStrategyRegistry } from "./JoinStrategyRegistry";
import { TicketJoinStrategy } from "./TicketJoinStrategy";
import { DefaultJoinStrategy } from "./DefaultJoinStrategy";

const makeCtx = (rawPass = ""): JoinContext =>
	({
		rawPass,
		command: rawPass.split("#")[0],
		password: rawPass.split("#")[1] ?? "",
	}) as unknown as JoinContext;

const makeStrategy = (
	matchResult: boolean,
	kind: "handled" | "rejected" | "fall-through" = "handled",
): JoinStrategy =>
	({
		matches: jest.fn().mockReturnValue(matchResult),
		handle: jest.fn().mockResolvedValue(undefined),
		_kind: kind, // marker for test inspection
	}) as unknown as JoinStrategy;

describe("JoinStrategyRegistry", () => {
	afterEach(() => {
		JoinStrategyRegistry.reset();
	});

	describe("createForTests()", () => {
		it("returns a registry with the injected strategies", () => {
			const s1 = makeStrategy(false);
			const s2 = makeStrategy(true);
			const registry = JoinStrategyRegistry.createForTests([s1, s2]);

			const ctx = makeCtx();
			const resolved = registry.resolve(ctx);
			expect(resolved).toBe(s2);
		});

		it("always returns the last strategy if all others do not match", () => {
			const terminal = makeStrategy(true);
			const registry = JoinStrategyRegistry.createForTests([makeStrategy(false), terminal]);

			const resolved = registry.resolve(makeCtx("someroom"));
			expect(resolved).toBe(terminal);
		});
	});

	describe("resolve()", () => {
		it("returns the first strategy whose matches() returns true", () => {
			const first = makeStrategy(true);
			const second = makeStrategy(true);
			const registry = JoinStrategyRegistry.createForTests([first, second]);

			const resolved = registry.resolve(makeCtx());
			expect(resolved).toBe(first);
		});

		it("skips non-matching strategies", () => {
			const skip = makeStrategy(false);
			const match = makeStrategy(true);
			const registry = JoinStrategyRegistry.createForTests([skip, match]);

			const resolved = registry.resolve(makeCtx());
			expect(resolved).toBe(match);
			expect(skip.matches).toHaveBeenCalled();
		});

		it("throws if no strategy matches (empty list)", () => {
			const registry = JoinStrategyRegistry.createForTests([]);
			expect(() => registry.resolve(makeCtx())).toThrow();
		});
	});

	describe("module-level singleton", () => {
		it("getInstance() returns the same instance on repeated calls", () => {
			const a = JoinStrategyRegistry.getInstance();
			const b = JoinStrategyRegistry.getInstance();
			expect(a).toBe(b);
		});

		it("after reset(), getInstance() still returns a valid registry", () => {
			JoinStrategyRegistry.reset();
			const instance = JoinStrategyRegistry.getInstance();
			expect(instance).toBeDefined();
		});
	});

	describe("bootstrap — base chain [TicketJoinStrategy, DefaultJoinStrategy]", () => {
		const makeCtxWithTicket = (rawPass = "ROOM"): JoinContext =>
			({
				rawPass,
				command: rawPass.split("#")[0],
				password: rawPass.split("#")[1] ?? "",
				socket: { resolvedUserId: "some-user-id" },
			}) as unknown as JoinContext;

		const makeCtxWithoutTicket = (rawPass = "ROOM"): JoinContext =>
			({
				rawPass,
				command: rawPass.split("#")[0],
				password: rawPass.split("#")[1] ?? "",
				socket: { resolvedUserId: undefined },
			}) as unknown as JoinContext;

		beforeEach(() => {
			// Simulate the always-on base chain (what index.ts sets up without windbot)
			JoinStrategyRegistry.setStrategies([new TicketJoinStrategy(), new DefaultJoinStrategy()]);
		});

		it("base chain contains TicketJoinStrategy and DefaultJoinStrategy", () => {
			const instance = JoinStrategyRegistry.getInstance();
			// Socket without resolvedUserId — TicketJoinStrategy should NOT match
			// so the registry falls through to DefaultJoinStrategy
			const ctx = makeCtxWithoutTicket();
			const resolved = instance.resolve(ctx);
			expect(resolved).toBeInstanceOf(DefaultJoinStrategy);
		});

		it("socket with resolvedUserId routes to TicketJoinStrategy", () => {
			const instance = JoinStrategyRegistry.getInstance();
			const ctx = makeCtxWithTicket();
			const resolved = instance.resolve(ctx);
			expect(resolved).toBeInstanceOf(TicketJoinStrategy);
		});

		it("socket without resolvedUserId routes to DefaultJoinStrategy", () => {
			const instance = JoinStrategyRegistry.getInstance();
			const ctx = makeCtxWithoutTicket();
			const resolved = instance.resolve(ctx);
			expect(resolved).toBeInstanceOf(DefaultJoinStrategy);
		});
	});
});
