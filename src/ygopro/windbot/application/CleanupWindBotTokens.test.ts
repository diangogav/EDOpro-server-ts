import { CleanupWindBotTokens } from "./CleanupWindBotTokens";
import { WindbotTokenStore } from "../domain/WindbotTokenStore";

describe("CleanupWindBotTokens", () => {
	let tokenStore: WindbotTokenStore;
	let useCase: CleanupWindBotTokens;

	beforeEach(() => {
		tokenStore = WindbotTokenStore.createForTests();
		useCase = new CleanupWindBotTokens(tokenStore);
	});

	it("delegates to tokenStore.clearByRoom and returns the count", () => {
		tokenStore.register(10, "Anna", "Anna.ydk");
		tokenStore.register(10, "Gear", "Gear.ydk");

		const count = useCase.execute(10);

		expect(count).toBe(2);
	});

	it("returns 0 when no tokens exist for the given roomId", () => {
		const count = useCase.execute(999);

		expect(count).toBe(0);
	});

	it("does not clear tokens for other rooms", () => {
		const otherToken = tokenStore.register(20, "Bob", "Bob.ydk");
		tokenStore.register(10, "Anna", "Anna.ydk");

		useCase.execute(10);

		// otherToken still consumable
		const payload = tokenStore.consume(otherToken);
		expect(payload.botName).toBe("Bob");
	});
});
