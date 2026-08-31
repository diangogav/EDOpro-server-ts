import { LoadedBanListNamesProvider } from "../domain/LoadedBanListNamesProvider";
import { RankGroupsConfig } from "../domain/RankGroupConfig";
import { resolveAlias, resolveGroupsFor } from "../domain/RankGroupResolution";

/**
 * Match-time facade over the pure group-resolution domain: binds the boot
 * config, the live in-memory banlist names, and the clock, so writers resolve
 * aliases and group ranks with one call each.
 */
export class RankGroupResolver {
	constructor(
		private readonly configProvider: () => RankGroupsConfig,
		private readonly loadedBanListNames: LoadedBanListNamesProvider,
		private readonly now: () => Date = () => new Date(),
	) {}

	/** Canonical rank name for a played banlist header name. */
	resolveAlias(name: string): string {
		return resolveAlias(name, this.configProvider().aliases);
	}

	/**
	 * Group rank names the given (already alias-resolved) banlist name feeds
	 * right now. Loaded names are alias-resolved too, so a renamed header
	 * competes for currency under its canonical name.
	 */
	groupsFor(banListName: string): string[] {
		const { aliases, groups } = this.configProvider();
		const loadedNames = this.loadedBanListNames.names().map((name) => resolveAlias(name, aliases));

		return resolveGroupsFor(banListName, groups, loadedNames, this.now());
	}
}
