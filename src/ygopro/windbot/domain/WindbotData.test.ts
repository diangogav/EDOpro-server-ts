import { WindbotData } from "./WindbotData";

describe("WindbotData", () => {
	it("accepts a minimal valid bot (name + deck only)", () => {
		const bot: WindbotData = {
			name: "Anna",
			deck: "Anna.ydk",
		};
		expect(bot.name).toBe("Anna");
		expect(bot.deck).toBe("Anna.ydk");
	});

	it("accepts all optional fields", () => {
		const bot: WindbotData = {
			name: "Gear",
			deck: "Gear.ydk",
			dialog: "gear_dialog",
			hidden: true,
			deckcode: "abc123",
		};
		expect(bot.dialog).toBe("gear_dialog");
		expect(bot.hidden).toBe(true);
		expect(bot.deckcode).toBe("abc123");
	});

	it("optional fields are absent when not provided (no undefined bleed)", () => {
		const bot: WindbotData = { name: "Anna", deck: "Anna.ydk" };
		expect(bot.hidden).toBeUndefined();
		expect(bot.dialog).toBeUndefined();
		expect(bot.deckcode).toBeUndefined();
	});
});
