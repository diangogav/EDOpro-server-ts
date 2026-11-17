import { useForeignCounterparts } from "@edopro/deck/domain/ForeignCounterparts";
import { useForeignPrintings } from "@edopro/deck/domain/ForeignPrintings";
import { PrereleaseIdsFile } from "@edopro/deck/infrastructure/PrereleaseIdsFile";
import { YGOProForeignPrintings } from "@ygopro/card/infrastructure/YGOProForeignPrintings";

/**
 * Lets an EDOPro room resolve the cards of the YGOPro pool: a client that
 * joined it from the YGOPro server builds its deck against that pool. Its
 * copies lead to their original, and its unreleased cards to the code EDOPro
 * gives them.
 */
export function registerForeignPrintings(): void {
	useForeignPrintings(new YGOProForeignPrintings());
	useForeignCounterparts(new PrereleaseIdsFile());
}
