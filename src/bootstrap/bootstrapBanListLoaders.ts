// Re-callable pure builders for edopro and ygopro ban lists (REQ-302).
//
// These functions parse ban lists into a local temporary array and do NOT touch
// the live BanListMemoryRepository or YGOProBanListMemoryRepository. The caller
// (bootstrapBanListReloader) is responsible for atomically swapping the repo via
// replaceAll() once both arrays are successfully built.
//
// Ordering invariant (REQ-303): callers MUST always call loadEdoproBanLists() and
// await its result BEFORE calling loadYgoproBanLists(). YGOProRoom resolves
// _edoBanListHash from BanListMemoryRepository by name at room construction time,
// so edopro banlists must be present in the repo before ygopro banlists are loaded.
// The reloader in bootstrapBanListReloader.ts enforces this order explicitly.

import { EdoProBanListLoader } from "@edopro/ban-list/infrastructure/BanListLoader";
import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import { YGOProBanListLoader } from "@ygopro/ban-list/infrastructure/YGOProBanListLoader";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";
import { config } from "src/config";

/**
 * Loads edopro ban lists into a fresh temporary array.
 * Does NOT write to BanListMemoryRepository.
 * Throws on parse error — callers are responsible for error handling.
 */
export async function loadEdoproBanLists(): Promise<EdoproBanList[]> {
	const tmp: EdoproBanList[] = [];
	const loader = new EdoProBanListLoader(tmp);
	await loader.loadDirectory(`${config.resources.dir}/edopro/evolution-lflists`);
	await loader.loadDirectory(`${config.resources.dir}/edopro/lflists`);
	return loader.getLoaded();
}

/**
 * Loads ygopro ban lists into a fresh temporary array.
 * Does NOT write to YGOProBanListMemoryRepository.
 * Throws on parse error — callers are responsible for error handling.
 *
 * Precondition (REQ-303): edopro ban lists must already be present in
 * BanListMemoryRepository before this is called (YGOProRoom cross-references them).
 */
export async function loadYgoproBanLists(): Promise<YGOProBanList[]> {
	const tmp: YGOProBanList[] = [];
	const loader = new YGOProBanListLoader(tmp);
	await loader.load();
	return loader.getLoaded();
}
