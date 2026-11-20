import { composeJoinStrategies } from "./composeJoinStrategies";
import { AIJoinTokenStrategy } from "./AIJoinTokenStrategy";
import { WindBotJoinStrategy } from "./WindBotJoinStrategy";
import { InviteJoinStrategy } from "./InviteJoinStrategy";
import { WatchJoinStrategy } from "./WatchJoinStrategy";
import { TicketJoinStrategy } from "./TicketJoinStrategy";
import { DefaultJoinStrategy } from "./DefaultJoinStrategy";
import { ReservedDuelJoinStrategy } from "./ReservedDuelJoinStrategy";
import { EdoproRoomJoinStrategy } from "./EdoproRoomJoinStrategy";
import { SpeedDuelJoinStrategy } from "./SpeedDuelJoinStrategy";
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
	it("returns the base chain [SpeedDuel, ReservedDuel, Invite, Watch, Ticket, Default] when windbot is absent", () => {
		const strategies = composeJoinStrategies();

		expect(strategies).toHaveLength(6);
		expect(strategies[0]).toBeInstanceOf(SpeedDuelJoinStrategy);
		expect(strategies[1]).toBeInstanceOf(ReservedDuelJoinStrategy);
		expect(strategies[2]).toBeInstanceOf(InviteJoinStrategy);
		expect(strategies[3]).toBeInstanceOf(WatchJoinStrategy);
		expect(strategies[4]).toBeInstanceOf(TicketJoinStrategy);
		expect(strategies[5]).toBeInstanceOf(DefaultJoinStrategy);
	});

	it("puts [SpeedDuel, AIJoinToken, WindBot] before the rest of the chain when windbot is present", () => {
		const strategies = composeJoinStrategies(makeModule());

		expect(strategies).toHaveLength(8);
		expect(strategies[0]).toBeInstanceOf(SpeedDuelJoinStrategy);
		expect(strategies[1]).toBeInstanceOf(AIJoinTokenStrategy);
		expect(strategies[2]).toBeInstanceOf(WindBotJoinStrategy);
		expect(strategies[3]).toBeInstanceOf(ReservedDuelJoinStrategy);
		expect(strategies[4]).toBeInstanceOf(InviteJoinStrategy);
		expect(strategies[5]).toBeInstanceOf(WatchJoinStrategy);
		expect(strategies[6]).toBeInstanceOf(TicketJoinStrategy);
		expect(strategies[7]).toBeInstanceOf(DefaultJoinStrategy);
	});

	it("adds the EDOPro room join before Ticket when the EDOPro flow is wired", () => {
		const strategies = composeJoinStrategies(undefined, {
			rooms: { enter: jest.fn() },
			speedDuelRooms: { enter: jest.fn() },
		});

		expect(strategies).toHaveLength(7);
		expect(strategies[4]).toBeInstanceOf(EdoproRoomJoinStrategy);
		expect(strategies[5]).toBeInstanceOf(TicketJoinStrategy);
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

	it.each([
		"speed",
		"m,speed,casual",
		"speed,ai",
	])("resolves a ticketed socket sending %p to SpeedDuelJoinStrategy, with or without the EDOPro flow and windbot", (command) => {
		const ctx = makeCtx({
			rawPass: command,
			command,
			socket: { id: "sock-1", resolvedUserId: "user-abc" } as never,
		});
		const edopro = { rooms: { enter: jest.fn() }, speedDuelRooms: { enter: jest.fn() } };

		for (const strategies of [
			composeJoinStrategies(),
			composeJoinStrategies(makeModule()),
			composeJoinStrategies(makeModule(), edopro),
		]) {
			expect(JoinStrategyRegistry.createForTests(strategies).resolve(ctx)).toBeInstanceOf(
				SpeedDuelJoinStrategy,
			);
		}
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

	it("resolves a ticketed rv#<id> join to ReservedDuelJoinStrategy, with or without windbot", () => {
		const ctx = makeCtx({
			rawPass: "rv#Ab3dEf6hIj9kLm2n",
			command: "rv",
			password: "Ab3dEf6hIj9kLm2n",
			socket: { id: "sock-1", resolvedUserId: "user-abc" } as never,
		});

		for (const strategies of [composeJoinStrategies(), composeJoinStrategies(makeModule())]) {
			expect(JoinStrategyRegistry.createForTests(strategies).resolve(ctx)).toBeInstanceOf(
				ReservedDuelJoinStrategy,
			);
		}
	});

	it("still resolves windbot ai# joins and AIJOIN# tokens to their strategies (shared chain)", () => {
		const registry = JoinStrategyRegistry.createForTests(composeJoinStrategies(makeModule()));

		expect(
			registry.resolve(
				makeCtx({ rawPass: "ed,ai#Haunted", command: "ed,ai", password: "Haunted" }),
			),
		).toBeInstanceOf(WindBotJoinStrategy);
		expect(
			registry.resolve(makeCtx({ rawPass: "AIJOIN#token", command: "AIJOIN", password: "token" })),
		).toBeInstanceOf(AIJoinTokenStrategy);
	});
});
