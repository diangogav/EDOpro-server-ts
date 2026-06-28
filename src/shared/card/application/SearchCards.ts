import { CardSearchRepository, CardSearchResult } from "../domain/CardSearchRepository";

export type CardEngine = "edopro" | "ygopro";

export interface CardSearchResultWithEngine extends CardSearchResult {
	engine: CardEngine;
}

export interface SearchCardsParams {
	query: string;
	engine?: CardEngine;
	limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export class SearchCards {
	constructor(private readonly repositories: Record<CardEngine, CardSearchRepository>) {}

	async run(params: SearchCardsParams): Promise<CardSearchResultWithEngine[]> {
		const query = params.query.trim();
		if (!query) {
			return [];
		}

		const limit = this.normalizeLimit(params.limit);
		const engines = params.engine
			? [params.engine]
			: (Object.keys(this.repositories) as CardEngine[]);

		const results: CardSearchResultWithEngine[] = [];
		for (const engine of engines) {
			const found = await this.searchOne(this.repositories[engine], query, limit);
			results.push(...found.map((card) => ({ ...card, engine })));
		}

		return results;
	}

	private async searchOne(
		repository: CardSearchRepository,
		query: string,
		limit: number,
	): Promise<CardSearchResult[]> {
		if (/^\d+$/.test(query)) {
			const card = await repository.findById(Number(query));

			return card ? [card] : [];
		}

		return repository.searchByName(query, limit);
	}

	private normalizeLimit(limit?: number): number {
		if (limit === undefined || Number.isNaN(limit) || limit < 1) {
			return DEFAULT_LIMIT;
		}

		return Math.min(Math.floor(limit), MAX_LIMIT);
	}
}
