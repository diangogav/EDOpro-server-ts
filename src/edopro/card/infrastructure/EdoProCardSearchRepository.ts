import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	CdbCardSearchRepository,
	CdbFile,
} from "@shared/card/infrastructure/cdb/CdbCardSearchRepository";
import { config } from "src/config";

export class EdoProCardSearchRepository extends CdbCardSearchRepository {
	constructor(
		private readonly directoryPaths: string[] = [`${config.resources.dir}/edopro/databases`],
	) {
		super({ lastSourceWins: true });
	}

	protected async *cdbFiles(): AsyncIterable<CdbFile> {
		for (const directoryPath of this.directoryPaths) {
			let files: string[];
			try {
				files = await readdir(directoryPath);
			} catch {
				continue;
			}

			for (const file of files) {
				if (!file.endsWith(".cdb")) {
					continue;
				}

				const path = join(directoryPath, file);
				yield { path, read: () => readFile(path) };
			}
		}
	}
}
