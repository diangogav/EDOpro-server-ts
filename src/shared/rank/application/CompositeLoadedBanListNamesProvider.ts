import { LoadedBanListNamesProvider } from "../domain/LoadedBanListNamesProvider";
import { LoadedBanListNamesSource } from "../domain/LoadedBanListNamesSource";

/**
 * One deduped name set per source, in source order. Reads the sources on every
 * call so banlist hot reloads are reflected immediately.
 */
export class CompositeLoadedBanListNamesProvider implements LoadedBanListNamesProvider {
	constructor(private readonly sources: LoadedBanListNamesSource[]) {}

	nameSets(): string[][] {
		return this.sources.map((source) => [...new Set(source.names())]);
	}
}
