import fs from "fs";
import { readdir } from "fs/promises";
import { join } from "path";

import { EdoproBanList } from "../domain/BanList";
import BanListMemoryRepository from "./BanListMemoryRepository";
import { BanListLoader } from "src/shared/ban-list/BanListLoader";
import { parseBanListEntry } from "src/shared/ban-list/parseBanListEntry";

export class EdoProBanListLoader extends BanListLoader {
	/**
	 * When a target array is provided, parsed banlists are pushed into it instead
	 * of the shared BanListMemoryRepository. This enables the re-callable pure-builder
	 * pattern used by loadEdoproBanLists() (bootstrapBanListLoaders.ts) for hot-reload.
	 */
	private readonly _target: EdoproBanList[] | null;
	private readonly _loaded: EdoproBanList[] = [];

	constructor(target?: EdoproBanList[]) {
		super();
		this._target = target ?? null;
	}

	async loadDirectory(path: string): Promise<void> {
		const directoryPath = path;
		const files = await readdir(directoryPath);
		const lflistFiles = files.filter((file) => file.endsWith(".lflist.conf"));
		for (const file of lflistFiles) {
			const filePath = join(directoryPath, file);
			this.load(filePath);
		}
	}

	/** Returns all banlists parsed by this loader instance. */
	getLoaded(): EdoproBanList[] {
		return this._loaded;
	}

	private load(path: string): void {
		const banList = new EdoproBanList();

		const lines = fs.readFileSync(path, "utf-8").split("\n");
		for (const line of lines) {
			if (!line) {
				continue;
			}

			if (line.startsWith("$whitelist")) {
				banList.whileListed();
			}

			if (line.startsWith("#")) {
				continue;
			}

			if (line.startsWith("!")) {
				banList.setName(line.substring(1));
			}

			if (banList.name === null) {
				continue;
			}

			const entry = parseBanListEntry(line);
			if (!entry) {
				continue;
			}

			banList.add(entry.code, entry.limit, entry.points);
		}

		this._loaded.push(banList);

		if (this._target !== null) {
			this._target.push(banList);
		} else {
			BanListMemoryRepository.add(banList);
		}
	}
}
