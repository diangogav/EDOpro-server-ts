import fs from "fs";

import MercuryBanListMemoryRepository from "./MercuryBanListMemoryRepository";

export class MercuryBanListLoader {
	static async load(path: string): Promise<void> {
		const fileContent = await fs.promises.readFile(path, "utf8");
		const lines = fileContent.match(/!.*/g);
		if (!lines) {
			return;
		}

		for (const line of lines) {
			const dateMatch = line.match(/!([\d.]+)/);
			if (!dateMatch) {
				continue;
			}

			const date = dateMatch[1];

			const tcg = line.includes("TCG");

			// Agregar el objeto al array lflists
			MercuryBanListMemoryRepository.add({ date, tcg });
		}
	}
}
