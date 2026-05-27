import { JoinContext, JoinStrategy } from "./JoinStrategy";
import { JoinStrategyRegistry } from "./JoinStrategyRegistry";

const makeCtx = (rawPass = ""): JoinContext =>
	({
		rawPass,
		command: rawPass.split("#")[0],
		password: rawPass.split("#")[1] ?? "",
	} as unknown as JoinContext);

const makeStrategy = (
	matchResult: boolean,
	kind: "handled" | "rejected" | "fall-through" = "handled"
): JoinStrategy => ({
	matches: jest.fn().mockReturnValue(matchResult),
	handle: jest.fn().mockResolvedValue(undefined),
	_kind: kind, // marker for test inspection
} as unknown as JoinStrategy);

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
});
