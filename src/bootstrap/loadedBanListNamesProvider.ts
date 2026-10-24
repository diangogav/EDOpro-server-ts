import { EdoproLoadedBanListNamesSource } from "@edopro/ban-list/infrastructure/EdoproLoadedBanListNamesSource";
import { CompositeLoadedBanListNamesProvider } from "@shared/rank/application/CompositeLoadedBanListNamesProvider";
import { LoadedBanListNamesProvider } from "@shared/rank/domain/LoadedBanListNamesProvider";
import { YGOProLoadedBanListNamesSource } from "@ygopro/ban-list/infrastructure/YGOProLoadedBanListNamesSource";

/** Loaded banlist names of each server protocol, EDOPro first. */
export function createLoadedBanListNamesProvider(): LoadedBanListNamesProvider {
	return new CompositeLoadedBanListNamesProvider([
		new EdoproLoadedBanListNamesSource(),
		new YGOProLoadedBanListNamesSource(),
	]);
}
