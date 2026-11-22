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
import { ChallengeJoinStrategy } from "./ChallengeJoinStrategy";
import { ChallengeRoomBook } from "@shared/challenge/application/ChallengeRoomBook";
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
	it("returns the base chain [Challenge, SpeedDuel, ReservedDuel, Invite, Watch, Ticket, Default] when windbot is absent", () => {
		const strategies = composeJoinStrategies();

		expect(strategies).toHaveLength(7);
		expect(strategies[0]).toBeInstanceOf(ChallengeJoinStrategy);
		expect(strategies[1]).toBeInstanceOf(SpeedDuelJoinStrategy);
		expect(strategies[2]).toBeInstanceOf(ReservedDuelJoinStrategy);
		expect(strategies[3]).toBeInstanceOf(InviteJoinStrategy);
		expect(strategies[4]).toBeInstanceOf(WatchJoinStrategy);
		expect(strategies[5]).toBeInstanceOf(TicketJoinStrategy);
		expect(strategies[6]).toBeInstanceOf(DefaultJoinStrategy);
	});

	it("puts [Challenge, SpeedDuel, AIJoinToken, WindBot] before the rest of the chain when windbot is present", () => {
		const strategies = composeJoinStrategies(makeModule());

		expect(strategies).toHaveLength(9);
		expect(strategies[0]).toBeInstanceOf(ChallengeJoinStrategy);
		expect(strategies[1]).toBeInstanceOf(SpeedDuelJoinStrategy);
		expect(strategies[2]).toBeInstanceOf(AIJoinTokenStrategy);
		expect(strategies[3]).toBeInstanceOf(WindBotJoinStrategy);
		expect(strategies[4]).toBeInstanceOf(ReservedDuelJoinStrategy);
		expect(strategies[5]).toBeInstanceOf(InviteJoinStrategy);
		expect(strategies[6]).toBeInstanceOf(WatchJoinStrategy);
		expect(strategies[7]).toBeInstanceOf(TicketJoinStrategy);
		expect(strategies[8]).toBeInstanceOf(DefaultJoinStrategy);
	});

	it("adds the EDOPro room join before Ticket when the EDOPro flow is wired", () => {
		const strategies = composeJoinStrategies(undefined, {
			rooms: { enter: jest.fn() },
			speedDuelRooms: { enter: jest.fn() },
		});

		expect(strategies).toHaveLength(8);
		expect(strategies[5]).toBeInstanceOf(EdoproRoomJoinStrategy);
		expect(strategies[6]).toBeInstanceOf(TicketJoinStrategy);
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

	it("resolves a ch#<code> join to ChallengeJoinStrategy, even from a ticketed socket", () => {
		const ctx = makeCtx({
			rawPass: "ch#abcdefgh01234567",
			command: "ch",
			password: "abcdefgh01234567",
			socket: { id: "sock-1", resolvedUserId: "user-abc" } as never,
		});

		for (const strategies of [composeJoinStrategies(), composeJoinStrategies(makeModule())]) {
			expect(JoinStrategyRegistry.createForTests(strategies).resolve(ctx)).toBeInstanceOf(
				ChallengeJoinStrategy,
			);
		}
	});

	it("hands a resolved challenge join to the strategy the stored room command selects", async () => {
		const challenges = new ChallengeRoomBook();
		const room = challenges.issue({ format: "speed", ranked: false, userIds: [] });
		const strategies = composeJoinStrategies(undefined, undefined, challenges);
		const speedDuel = strategies.find(
			(strategy) => strategy instanceof SpeedDuelJoinStrategy,
		) as SpeedDuelJoinStrategy;
		const handle = jest.spyOn(speedDuel, "handle").mockResolvedValue(undefined);
		const ctx = makeCtx({ rawPass: `ch#${room.code}`, command: "ch", password: room.code });

		await JoinStrategyRegistry.createForTests(strategies).resolve(ctx).handle(ctx);

		expect(handle).toHaveBeenCalledWith(
			expect.objectContaining({
				command: "speed,casual",
				password: room.password,
				rawPass: `speed,casual#${room.password}`,
			}),
		);
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
