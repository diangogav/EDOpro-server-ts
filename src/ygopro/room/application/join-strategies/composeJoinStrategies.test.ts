import { composeJoinStrategies } from "./composeJoinStrategies";
import { AIJoinTokenStrategy } from "./AIJoinTokenStrategy";
import { WindBotJoinStrategy } from "./WindBotJoinStrategy";
import { WatchJoinStrategy } from "./WatchJoinStrategy";
import { TicketJoinStrategy } from "./TicketJoinStrategy";
import { DefaultJoinStrategy } from "./DefaultJoinStrategy";
import { JoinStrategyRegistry } from "./JoinStrategyRegistry";
import { JoinContext } from "./JoinStrategy";
import { WindbotModule } from "../../../windbot/application/WindbotModule";
import { WindbotTokenStore } from "../../../windbot/domain/WindbotTokenStore";

const makeModule = (): WindbotModule =>
	WindbotModule.createForTests({
		enabled: true,
		repo: {
			findAll: jest.fn(),
			findByName: jest.fn(),
			pickRandom: jest.fn(),
		} as never,
		tokenStore: WindbotTokenStore.createForTests(),
		provider: { requestJoin: jest.fn() } as never,
	});

describe("composeJoinStrategies", () => {
	it("returns the base chain [Watch, Ticket, Default] when windbot is absent", () => {
		const strategies = composeJoinStrategies();

		expect(strategies).toHaveLength(3);
		expect(strategies[0]).toBeInstanceOf(WatchJoinStrategy);
		expect(strategies[1]).toBeInstanceOf(TicketJoinStrategy);
		expect(strategies[2]).toBeInstanceOf(DefaultJoinStrategy);
	});

	it("prepends [AIJoinToken, WindBot] before the base chain when windbot is present", () => {
		const strategies = composeJoinStrategies(makeModule());

		expect(strategies).toHaveLength(5);
		expect(strategies[0]).toBeInstanceOf(AIJoinTokenStrategy);
		expect(strategies[1]).toBeInstanceOf(WindBotJoinStrategy);
		expect(strategies[2]).toBeInstanceOf(WatchJoinStrategy);
		expect(strategies[3]).toBeInstanceOf(TicketJoinStrategy);
		expect(strategies[4]).toBeInstanceOf(DefaultJoinStrategy);
	});
});

describe("composeJoinStrategies — resolution order", () => {
	const makeCtx = (overrides: Partial<JoinContext>): JoinContext =>
		({
			rawPass: "TESTROOM",
			command: "TESTROOM",
			password: "",
			socket: { id: "sock-1" },
			...overrides,
		}) as unknown as JoinContext;

	// TicketJoinStrategy matches on socket auth, not command shape: if it
	// preceded WatchJoinStrategy, a ticketed socket sending "w,1234" would
	// fall into findOrCreateRoom and mint a junk room literally named
	// "w,1234" instead of watching room 1234.
	it("resolves a ticketed socket sending a watch command to WatchJoinStrategy, not TicketJoinStrategy", () => {
		const registry = JoinStrategyRegistry.createForTests(composeJoinStrategies(makeModule()));
		const ctx = makeCtx({
			rawPass: "w,1234",
			command: "w,1234",
			socket: { id: "sock-1", resolvedUserId: "user-abc" } as never,
		});

		expect(registry.resolve(ctx)).toBeInstanceOf(WatchJoinStrategy);
	});

	it("still resolves a ticketed non-watch join to TicketJoinStrategy (normal joins unaffected)", () => {
		const registry = JoinStrategyRegistry.createForTests(composeJoinStrategies(makeModule()));
		const ctx = makeCtx({
			socket: { id: "sock-1", resolvedUserId: "user-abc" } as never,
		});

		expect(registry.resolve(ctx)).toBeInstanceOf(TicketJoinStrategy);
	});

	it("still resolves an anonymous pairing-style join to DefaultJoinStrategy (normal joins unaffected)", () => {
		const registry = JoinStrategyRegistry.createForTests(composeJoinStrategies(makeModule()));
		const ctx = makeCtx({ rawPass: "tcg", command: "tcg" });

		expect(registry.resolve(ctx)).toBeInstanceOf(DefaultJoinStrategy);
	});

	it("still resolves a name#password join to DefaultJoinStrategy (normal joins unaffected)", () => {
		const registry = JoinStrategyRegistry.createForTests(composeJoinStrategies(makeModule()));
		const ctx = makeCtx({ rawPass: "MYROOM#secret", command: "MYROOM", password: "secret" });

		expect(registry.resolve(ctx)).toBeInstanceOf(DefaultJoinStrategy);
	});
});
