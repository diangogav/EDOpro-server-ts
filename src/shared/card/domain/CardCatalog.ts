import { CardSearchResult } from "./CardSearchRepository";

export interface CardSource {
	source: string;
	count: number;
}

export interface CardPage {
	total: number;
	cards: CardSearchResult[];
}

export interface CardCatalog {
	listSources(): Promise<CardSource[]>;
	findBySource(source: string, limit: number, offset: number): Promise<CardPage>;
	resolveNames(ids: number[]): Promise<Map<number, string>>;
}
