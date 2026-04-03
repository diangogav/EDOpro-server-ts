import { Card } from "./Card";

export interface CardRepository {
	findByCode(code: string): Promise<Card | null>;
}
