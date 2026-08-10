import fs from "fs";
import { z } from "zod";
import { WindbotBotlistRepository } from "../domain/WindbotBotlistRepository";
import { WindbotData } from "../domain/WindbotData";

const WindbotDataSchema = z.object({
	name: z.string(),
	deck: z.string(),
	dialog: z.string().optional(),
	hidden: z.boolean().optional(),
	deckcode: z.string().optional(),
	format: z.string().optional(),
});

const BotlistSchema = z.array(WindbotDataSchema);

// Every AI join command rides "<token>,ai#<name>" through the CTOS_JOIN_GAME
// utf16[20] "pass" field (see RuleMappings.ts). Reserve 4 chars for
// "<token>," (covers up to 3-char format tokens like "jtp") + 3 chars for the
// literal "ai#", leaving name.length <= 20 - 4 - 3 = 13 for the bot name.
const MAX_BOT_NAME_LENGTH = 13;

export class FileBotlistRepository implements WindbotBotlistRepository {
	private readonly bots: WindbotData[];

	constructor(filePath: string) {
		const raw = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		const result = BotlistSchema.safeParse(parsed);
		if (!result.success) {
			throw new Error(`Invalid botlist at ${filePath}: ${result.error.message}`);
		}
		this.bots = result.data;

		for (const bot of this.bots) {
			if (bot.name.length > MAX_BOT_NAME_LENGTH) {
				throw new Error(
					`Invalid botlist at ${filePath}: bot name "${bot.name}" exceeds ${MAX_BOT_NAME_LENGTH} chars — for tokens up to 3 chars (e.g. "jtp"), it cannot fit the CTOS_JOIN_GAME utf16[20] pass field as "<token>,ai#${bot.name}"`,
				);
			}
		}
	}

	findAll(): WindbotData[] {
		return this.bots;
	}

	findByName(name: string): WindbotData | null {
		const lower = name.toLowerCase();
		return this.bots.find((b) => b.name.toLowerCase() === lower) ?? null;
	}

	pickRandom(format?: string): WindbotData | null {
		const pool =
			format !== undefined
				? this.bots.filter((b) => b.format === format)
				: this.bots.filter((b) => b.hidden !== true);
		if (pool.length === 0) {
			return null;
		}
		return pool[Math.floor(Math.random() * pool.length)];
	}
}
