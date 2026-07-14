import { Request, Response } from "express";

import EdoProBanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { EdoProCardDbHotReload } from "@edopro/card/infrastructure/sqlite/EdoProCardDbHotReload";
import YGOProBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";
import { YGOProResourceLoader } from "@ygopro/ygopro/YGOProResourceLoader";
import { BanList } from "src/shared/ban-list/BanList";
import { getBanListReloadedAt } from "src/bootstrap/bootstrapBanListReloader";

// Reports the versions/hashes of the resources this server has actually loaded, so a
// client can compare them against what it downloaded and detect drift. Every field is
// nullable: a freshly booted server may not have computed a given hash yet, and the
// endpoint must still answer 200 rather than fail.
export class GetResourceVersionController {
	run(_req: Request, response: Response): void {
		// get() would lazily construct a loader (with filesystem + timer side effects),
		// so only read it once something has actually initialized it.
		const loader = YGOProResourceLoader.isInitialized ? YGOProResourceLoader.get() : null;
		const cardDb = EdoProCardDbHotReload.getShared();

		response.status(200).json({
			schemaVersion: 1,
			ygopro: {
				standardSha512: loader?.standardSha512Hex ?? null,
				extendedSha512: loader?.extendedSha512Hex ?? null,
			},
			edopro: {
				cardDbFingerprint: cardDb?.fingerprint ?? null,
			},
			banlists: {
				edopro: toBanListVersions(EdoProBanListMemoryRepository.get()),
				ygopro: toBanListVersions(YGOProBanListMemoryRepository.get()),
				reloadedAt: getBanListReloadedAt(),
			},
		});
	}
}

function toBanListVersions(banLists: BanList[]): Array<{ name: string; hash: number }> {
	return banLists
		.filter((banList) => banList.name !== null)
		.map((banList) => ({ name: banList.name as string, hash: banList.hash }));
}
