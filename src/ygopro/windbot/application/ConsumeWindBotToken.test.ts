import { ConsumeWindBotToken } from "./ConsumeWindBotToken";
import { WindbotTokenStore } from "../domain/WindbotTokenStore";

describe("ConsumeWindBotToken", () => {
	let tokenStore: WindbotTokenStore;
	let useCase: ConsumeWindBotToken;

	beforeEach(() => {
		tokenStore = WindbotTokenStore.createForTests();
		useCase = new ConsumeWindBotToken(tokenStore);
	});

	it("delegates to tokenStore.consume and returns the payload", () => {
		const token = tokenStore.register(42, "Anna", "Anna.ydk");

		const result = useCase.execute(token);

		expect(result).toEqual({ roomId: 42, botName: "Anna", deck: "Anna.ydk" });
	});

	it("re-throws the Error from the store when token is not found", () => {
		expect(() => useCase.execute("nonexistenttoken")).toThrow("Windbot token not found");
	});

	it("second consume of same token throws (one-shot behavior delegated to store)", () => {
		const token = tokenStore.register(1, "Gear", "Gear.ydk");
		useCase.execute(token);

		expect(() => useCase.execute(token)).toThrow("Windbot token not found");
	});
});
