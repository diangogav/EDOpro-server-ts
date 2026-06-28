export interface CardSearchResult {
	id: number;
	name: string;
	source: string;
}

export interface CardSearchRepository {
	searchByName(query: string, limit: number): Promise<CardSearchResult[]>;
	findById(id: number): Promise<CardSearchResult | null>;
}
