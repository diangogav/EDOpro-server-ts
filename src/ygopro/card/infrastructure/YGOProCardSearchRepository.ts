import { searchYGOProResource } from "koishipro-core.js";

import {
	CdbCardSearchRepository,
	CdbFile,
} from "@shared/card/infrastructure/cdb/CdbCardSearchRepository";
import { config } from "src/config";

export class YGOProCardSearchRepository extends CdbCardSearchRepository {
	protected async *cdbFiles(): AsyncIterable<CdbFile> {
		const folders = [...config.resources.ygopro.folders, ...config.resources.ygopro.extraFolders];

		for await (const file of searchYGOProResource(...folders)) {
			yield { path: file.path, read: () => file.read() };
		}
	}
}
