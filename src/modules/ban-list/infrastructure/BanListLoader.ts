import fs from "fs";
import { readdir } from "fs/promises";
import { join } from "path";

import { BanList } from "../domain/BanList";
import BanListMemoryRepository from "./BanListMemoryRepository";

export class BanListLoader {
	async loadDirectory(path: string): Promise<void> {
		const directoryPath = path;
		const files = await readdir(directoryPath);
		const lflistFiles = files.filter((file) => file.endsWith(".lflist.conf"));
		for (const file of lflistFiles) {
			const filePath = join(directoryPath, file);
			this.load(filePath);
		}
	}

	private load(path: string): void {
		const banList = new BanList();

		const lines = fs.readFileSync(path, "utf-8").split("\n");
		for (const line of lines) {
			if (!line) {
				continue;
			}

			if (line.startsWith("#")) {
				continue;
			}

			if (line.startsWith("!")) {
				banList.setName(line);
			}

			if (!line.includes(" ")) {
				continue;
			}

			if (banList.name === null) {
				continue;
			}

			const [cardId, quantity] = line.split(" ");
			banList.add(Number(cardId), Number(quantity));
		}

		BanListMemoryRepository.add(banList);
	}
}
