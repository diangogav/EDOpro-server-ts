import { searchYGOProResource } from "koishipro-core.js";

import {
	CdbCardSearchRepository,
	CdbFile,
} from "@shared/card/infrastructure/cdb/CdbCardSearchRepository";
import { config } from "src/config";
import { resolvePools } from "src/ygopro/ygopro/ResourcePoolResolver";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

export class YGOProCardSearchRepository extends CdbCardSearchRepository {
	protected async *cdbFiles(): AsyncIterable<CdbFile> {
		const { extended } = resolvePools({
			manifestPath: config.resources.manifestPath,
			resourcesDir: config.resources.dir,
			env: process.env,
			logger: LoggerFactory.getLogger(),
		});

		for await (const file of searchYGOProResource(...extended)) {
			yield { path: file.path, read: () => file.read() };
		}
	}
}
