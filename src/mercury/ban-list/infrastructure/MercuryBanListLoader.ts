import fs, { createReadStream } from "fs";
import { readdir } from "fs/promises";

import MercuryBanListMemoryRepository from "./MercuryBanListMemoryRepository";
import { MercuryBanList } from "../domain/MercuryBanList";
import { join } from "path";
import { createHash } from "crypto";

async function sha256File(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);

		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
		stream.on("error", reject);
	});
}
export class MercuryBanListLoader {
	private readonly seenBanLists = new Set<string>(); // key = name|hash

	async loadDirectory(path: string): Promise<void> {
		const directoryPath = path;
		const files = await readdir(directoryPath, { recursive: true });
		const lflistFiles = files.filter((file) => file.endsWith("lflist.conf"));

		const seen = new Map<string, string>(); // hash -> first path

		for (const file of lflistFiles) {
			const filePath = join(directoryPath, file);
			const hash = await sha256File(filePath);

			if (seen.has(hash)) continue;

			seen.set(hash, filePath);
			await this.load(filePath);
		}

	}
	async load(path: string): Promise<void> {
		const lines = fs.readFileSync(path, "utf8").split("\n");
		let banList: MercuryBanList = new MercuryBanList();

		for (const line of lines) {
			if (line.startsWith("!")) {
				this.flush(banList);

				banList = new MercuryBanList();
				banList.setName(line.substring(1));
				banList.setTCG(line.includes("TCG"));

				const dateMatch = line.match(/!([\d.]+)/);
				if (dateMatch) banList.setDate(dateMatch[1]);

				continue;
			}

			if (line.startsWith("$whitelist")) banList.whileListed();
			if (line.startsWith("#")) continue;
			if (!line.includes(" ")) continue;
			if (banList.name === null) continue;

			const [cardId, quantity] = line.split(" ");
			banList.add(Number(cardId), Number(quantity));
		}

		// ✅ flush final
		this.flush(banList);
	}

	private flush(banList: MercuryBanList): void {
		if (!banList.name) return;

		const h = (banList.hash >>> 0).toString(16);
		const key = `${banList.name.toLowerCase()}|${h}`;

		if (this.seenBanLists.has(key)) return;
		this.seenBanLists.add(key);

		MercuryBanListMemoryRepository.add(banList);
	}
}
