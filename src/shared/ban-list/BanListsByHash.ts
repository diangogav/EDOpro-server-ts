import { BanList } from "./BanList";

/**
 * The ban lists one flow has loaded, by the hash that flow announces. Lets
 * the other flow read the entries of a list it only knows by that hash.
 */
export interface BanListsByHash {
	findByHash(hash: number): BanList | null;
}
