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
});

const BotlistSchema = z.array(WindbotDataSchema);

export class FileBotlistRepository implements WindbotBotlistRepository {
	private readonly bots: WindbotData[];

	constructor(filePath: string) {
		const raw = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		const result = BotlistSchema.safeParse(parsed);
		if (!result.success) {
			throw new Error(
				`Invalid botlist at ${filePath}: ${result.error.message}`
			);
		}
		this.bots = result.data;
	}

	findAll(): WindbotData[] {
		return this.bots;
	}

	findByName(name: string): WindbotData | null {
		const lower = name.toLowerCase();
		return this.bots.find((b) => b.name.toLowerCase() === lower) ?? null;
	}

	pickRandom(): WindbotData | null {
		const visible = this.bots.filter((b) => b.hidden !== true);
		if (visible.length === 0) {
			return null;
		}
		return visible[Math.floor(Math.random() * visible.length)];
	}
}
