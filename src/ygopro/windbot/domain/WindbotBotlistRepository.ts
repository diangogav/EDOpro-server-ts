import { WindbotData } from "./WindbotData";

export interface WindbotBotlistRepository {
	findAll(): WindbotData[];
	findByName(name: string): WindbotData | null;
	pickRandom(): WindbotData | null;
}
