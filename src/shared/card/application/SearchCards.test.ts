import { CardSearchRepository, CardSearchResult } from "../domain/CardSearchRepository";
import { SearchCards } from "./SearchCards";

class FakeCardSearchRepository implements CardSearchRepository {
	searchByNameCalls: Array<{ query: string; limit: number }> = [];
	findByIdCalls: number[] = [];

	constructor(private readonly cards: CardSearchResult[]) {}

	async searchByName(query: string, limit: number): Promise<CardSearchResult[]> {
		this.searchByNameCalls.push({ query, limit });

		return this.cards
			.filter((card) => card.name.toLowerCase().includes(query.toLowerCase()))
			.slice(0, limit);
	}

	async findById(id: number): Promise<CardSearchResult | null> {
		this.findByIdCalls.push(id);

		return this.cards.find((card) => card.id === id) ?? null;
	}
}

const buildService = () => {
	const edopro = new FakeCardSearchRepository([
		{ id: 46986414, name: "Dark Magician", source: "cards.cdb" },
		{ id: 38033121, name: "Dark Magician Girl", source: "cards.cdb" },
	]);
	const ygopro = new FakeCardSearchRepository([
		{ id: 89631139, name: "Blue-Eyes White Dragon", source: "cards.cdb" },
	]);
	const service = new SearchCards({ edopro, ygopro });

	return { service, edopro, ygopro };
};

describe("SearchCards", () => {
	it("returns an empty array for a blank query without hitting repositories", async () => {
		const { service, edopro, ygopro } = buildService();

		expect(await service.run({ query: "   " })).toEqual([]);
		expect(edopro.searchByNameCalls).toHaveLength(0);
		expect(ygopro.findByIdCalls).toHaveLength(0);
	});

	it("searches by name across every engine when none is specified", async () => {
		const { service } = buildService();

		const results = await service.run({ query: "dark" });

		expect(results).toEqual([
			{ engine: "edopro", id: 46986414, name: "Dark Magician", source: "cards.cdb" },
			{ engine: "edopro", id: 38033121, name: "Dark Magician Girl", source: "cards.cdb" },
		]);
	});

	it("restricts the search to the requested engine", async () => {
		const { service, edopro } = buildService();

		const results = await service.run({ query: "blue", engine: "ygopro" });

		expect(results).toEqual([
			{ engine: "ygopro", id: 89631139, name: "Blue-Eyes White Dragon", source: "cards.cdb" },
		]);
		expect(edopro.searchByNameCalls).toHaveLength(0);
	});

	it("looks up by id when the query is numeric", async () => {
		const { service, edopro, ygopro } = buildService();

		const results = await service.run({ query: "46986414" });

		expect(results).toEqual([
			{ engine: "edopro", id: 46986414, name: "Dark Magician", source: "cards.cdb" },
		]);
		expect(edopro.findByIdCalls).toEqual([46986414]);
		expect(edopro.searchByNameCalls).toHaveLength(0);
		expect(ygopro.findByIdCalls).toEqual([46986414]);
	});

	it("clamps the limit to the maximum allowed", async () => {
		const { service, edopro } = buildService();

		await service.run({ query: "dark", engine: "edopro", limit: 9999 });

		expect(edopro.searchByNameCalls[0].limit).toBe(100);
	});

	it("falls back to the default limit when none is provided", async () => {
		const { service, edopro } = buildService();

		await service.run({ query: "dark", engine: "edopro" });

		expect(edopro.searchByNameCalls[0].limit).toBe(50);
	});
});
