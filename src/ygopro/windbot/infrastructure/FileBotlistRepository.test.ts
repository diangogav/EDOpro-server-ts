import fs from "fs";
import os from "os";
import path from "path";
import { FileBotlistRepository } from "./FileBotlistRepository";

const writeTempFile = (content: string): string => {
	const tmpFile = path.join(
		os.tmpdir(),
		`botlist-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
	);
	fs.writeFileSync(tmpFile, content, "utf-8");
	return tmpFile;
};

describe("FileBotlistRepository", () => {
	describe("construction and findAll", () => {
		it("loads a valid JSON array and returns all bots via findAll", () => {
			const filePath = writeTempFile(
				JSON.stringify([
					{ name: "Anna", deck: "Anna.ydk" },
					{ name: "Gear", deck: "Gear.ydk" },
				]),
			);

			const repo = new FileBotlistRepository(filePath);

			expect(repo.findAll()).toHaveLength(2);
			expect(repo.findAll()[0].name).toBe("Anna");
		});

		it("accepts optional fields (dialog, hidden, deckcode, format)", () => {
			const filePath = writeTempFile(
				JSON.stringify([
					{
						name: "Anna",
						deck: "Anna.ydk",
						dialog: "anna_dlg",
						hidden: false,
						deckcode: "abc",
						format: "tcg",
					},
				]),
			);

			const repo = new FileBotlistRepository(filePath);
			const bots = repo.findAll();

			expect(bots[0].dialog).toBe("anna_dlg");
			expect(bots[0].hidden).toBe(false);
			expect(bots[0].deckcode).toBe("abc");
			expect(bots[0].format).toBe("tcg");
		});

		it("throws on invalid JSON (malformed)", () => {
			const filePath = writeTempFile("{ not valid json ]]]");

			expect(() => new FileBotlistRepository(filePath)).toThrow();
		});

		it("throws when an entry is missing the 'name' field", () => {
			const filePath = writeTempFile(JSON.stringify([{ deck: "Anna.ydk" }]));

			expect(() => new FileBotlistRepository(filePath)).toThrow();
		});

		it("throws when an entry is missing the 'deck' field", () => {
			const filePath = writeTempFile(JSON.stringify([{ name: "Anna" }]));

			expect(() => new FileBotlistRepository(filePath)).toThrow();
		});

		it("throws when the root is not an array", () => {
			const filePath = writeTempFile(JSON.stringify({ name: "Anna", deck: "Anna.ydk" }));

			expect(() => new FileBotlistRepository(filePath)).toThrow();
		});
	});

	describe("boot-time name length validation", () => {
		// Every join command rides "<token>,ai#<name>" through the
		// CTOS_JOIN_GAME utf16[20] pass field. Reserving 4 chars for "<token>,"
		// (covers up to 3-char tokens like "jtp") and 3 chars for "ai#" leaves
		// name.length <= 13 as the safe boot-time ceiling.
		it("accepts a bot name at the 13-char ceiling", () => {
			const filePath = writeTempFile(JSON.stringify([{ name: "A".repeat(13), deck: "Deck.ydk" }]));

			expect(() => new FileBotlistRepository(filePath)).not.toThrow();
		});

		it("throws with the offending bot name when a name exceeds the 13-char ceiling", () => {
			const filePath = writeTempFile(JSON.stringify([{ name: "A".repeat(14), deck: "Deck.ydk" }]));

			expect(() => new FileBotlistRepository(filePath)).toThrow(/AAAAAAAAAAAAAA/);
		});

		it("scopes the thrown message's guarantee to tokens up to 3 chars, not unconditionally", () => {
			const filePath = writeTempFile(JSON.stringify([{ name: "A".repeat(14), deck: "Deck.ydk" }]));

			expect(() => new FileBotlistRepository(filePath)).toThrow(/tokens up to 3 chars/);
		});
	});

	describe("findByName", () => {
		it("returns the matching bot for an exact case-sensitive name", () => {
			const filePath = writeTempFile(
				JSON.stringify([
					{ name: "Anna", deck: "Anna.ydk" },
					{ name: "Gear", deck: "Gear.ydk" },
				]),
			);

			const repo = new FileBotlistRepository(filePath);

			expect(repo.findByName("Anna")).not.toBeNull();
			expect(repo.findByName("Anna")?.name).toBe("Anna");
		});

		it("returns null when the name does not exist", () => {
			const filePath = writeTempFile(JSON.stringify([{ name: "Anna", deck: "Anna.ydk" }]));

			const repo = new FileBotlistRepository(filePath);

			expect(repo.findByName("nope")).toBeNull();
		});

		it("is case-insensitive: 'anna' matches 'Anna'", () => {
			const filePath = writeTempFile(JSON.stringify([{ name: "Anna", deck: "Anna.ydk" }]));

			const repo = new FileBotlistRepository(filePath);

			expect(repo.findByName("anna")).not.toBeNull();
			expect(repo.findByName("anna")?.name).toBe("Anna");
		});

		it("is case-insensitive: 'JOEY' matches a bot registered as 'Joey'", () => {
			const filePath = writeTempFile(JSON.stringify([{ name: "Joey", deck: "Joey.ydk" }]));

			const repo = new FileBotlistRepository(filePath);

			expect(repo.findByName("JOEY")).not.toBeNull();
			expect(repo.findByName("JOEY")?.name).toBe("Joey");
		});

		it("is case-insensitive: 'joey' matches a bot registered as 'Joey'", () => {
			const filePath = writeTempFile(JSON.stringify([{ name: "Joey", deck: "Joey.ydk" }]));

			const repo = new FileBotlistRepository(filePath);

			expect(repo.findByName("joey")).not.toBeNull();
			expect(repo.findByName("joey")?.name).toBe("Joey");
		});
	});

	describe("pickRandom", () => {
		it("returns a bot from the visible (non-hidden) list", () => {
			const filePath = writeTempFile(
				JSON.stringify([
					{ name: "Anna", deck: "Anna.ydk" },
					{ name: "Hidden", deck: "Hidden.ydk", hidden: true },
				]),
			);

			const repo = new FileBotlistRepository(filePath);
			const results = new Set<string>();

			for (let i = 0; i < 30; i++) {
				const bot = repo.pickRandom();
				if (bot) results.add(bot.name);
			}

			expect(results.has("Hidden")).toBe(false);
			expect(results.has("Anna")).toBe(true);
		});

		it("returns null when all bots are hidden", () => {
			const filePath = writeTempFile(
				JSON.stringify([
					{ name: "Hidden1", deck: "h1.ydk", hidden: true },
					{ name: "Hidden2", deck: "h2.ydk", hidden: true },
				]),
			);

			const repo = new FileBotlistRepository(filePath);

			expect(repo.pickRandom()).toBeNull();
		});

		it("returns null when the list is empty", () => {
			const filePath = writeTempFile(JSON.stringify([]));

			const repo = new FileBotlistRepository(filePath);

			expect(repo.pickRandom()).toBeNull();
		});

		it("can return any visible bot across random calls", () => {
			const filePath = writeTempFile(
				JSON.stringify([
					{ name: "Anna", deck: "Anna.ydk" },
					{ name: "Gear", deck: "Gear.ydk" },
				]),
			);

			const repo = new FileBotlistRepository(filePath);
			const results = new Set<string>();

			for (let i = 0; i < 50; i++) {
				const bot = repo.pickRandom();
				if (bot) results.add(bot.name);
			}

			expect(results.has("Anna")).toBe(true);
			expect(results.has("Gear")).toBe(true);
		});

		describe("format-scoped random (pickRandom(format))", () => {
			it("restricts the pool to bots whose format matches, INCLUDING hidden ones", () => {
				const filePath = writeTempFile(
					JSON.stringify([
						{ name: "Anna", deck: "Anna.ydk", format: "tcg" },
						{ name: "Hidden", deck: "Hidden.ydk", format: "tcg", hidden: true },
						{ name: "Other", deck: "Other.ydk", format: "jtp" },
					]),
				);

				const repo = new FileBotlistRepository(filePath);
				const results = new Set<string>();

				for (let i = 0; i < 40; i++) {
					const bot = repo.pickRandom("tcg");
					if (bot) results.add(bot.name);
				}

				expect(results.has("Anna")).toBe(true);
				expect(results.has("Hidden")).toBe(true);
				expect(results.has("Other")).toBe(false);
			});

			it("returns null when no bot matches the requested format", () => {
				const filePath = writeTempFile(
					JSON.stringify([{ name: "Anna", deck: "Anna.ydk", format: "tcg" }]),
				);

				const repo = new FileBotlistRepository(filePath);

				expect(repo.pickRandom("edison")).toBeNull();
			});

			it("treats an empty-string format as an empty pool, NOT the generic pool", () => {
				const filePath = writeTempFile(
					JSON.stringify([{ name: "Anna", deck: "Anna.ydk", format: "tcg" }]),
				);

				const repo = new FileBotlistRepository(filePath);

				expect(repo.pickRandom("")).toBeNull();
			});

			it("does not change the no-argument (generic pool) behavior", () => {
				const filePath = writeTempFile(
					JSON.stringify([
						{ name: "Anna", deck: "Anna.ydk", format: "tcg" },
						{ name: "Hidden", deck: "Hidden.ydk", format: "tcg", hidden: true },
					]),
				);

				const repo = new FileBotlistRepository(filePath);
				const results = new Set<string>();

				for (let i = 0; i < 30; i++) {
					const bot = repo.pickRandom();
					if (bot) results.add(bot.name);
				}

				expect(results.has("Hidden")).toBe(false);
				expect(results.has("Anna")).toBe(true);
			});
		});
	});
});
