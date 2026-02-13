import { UnrankedDuel } from "./UnrankedDuel";
import { UnrankedMatch } from "./UnrankedMatch";

export interface UnrankedMatchRepository {
    saveMatch(unrankedMatch: UnrankedMatch): Promise<void>;
    saveDuel(unrankedDuel: UnrankedDuel): Promise<void>;
}
