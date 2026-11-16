import { useForeignPrintings } from "@edopro/deck/domain/ForeignPrintings";
import { YGOProForeignPrintings } from "@ygopro/card/infrastructure/YGOProForeignPrintings";

/**
 * Lets an EDOPro room resolve the printings of the YGOPro pool: a client that
 * joined it from the YGOPro server builds its deck against that pool.
 */
export function registerForeignPrintings(): void {
	useForeignPrintings(new YGOProForeignPrintings());
}
