import { basename } from "node:path";

import initSqlJs from "sql.js";

import { CardCatalog, CardPage, CardSource } from "@shared/card/domain/CardCatalog";
import { CardSearchRepository, CardSearchResult } from "@shared/card/domain/CardSearchRepository";
import { Logger } from "@shared/logger/domain/Logger";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";

export interface CdbFile {
	path: string;
	read(): Promise<Uint8Array>;
}

interface IndexedCard {
	name: string;
	source: string;
}

const SELECT_NAMES = "SELECT id, name FROM texts WHERE name IS NOT NULL AND name <> ''";
const DEFAULT_INDEX_TTL_MS = 10 * 60 * 1000;

export abstract class CdbCardSearchRepository implements CardSearchRepository, CardCatalog {
	private readonly lastSourceWins: boolean;
	private readonly ttlMs: number;
	private readonly now: () => number;
	private readonly logger: Logger = LoggerFactory.getLogger();
	private index: Map<number, IndexedCard> | null = null;
	private building: Promise<Map<number, IndexedCard>> | null = null;
	private builtAt = 0;

	constructor(options: { lastSourceWins?: boolean; ttlMs?: number; now?: () => number } = {}) {
		this.lastSourceWins = options.lastSourceWins ?? false;
		this.ttlMs = options.ttlMs ?? DEFAULT_INDEX_TTL_MS;
		this.now = options.now ?? Date.now;
	}

	protected abstract cdbFiles(): AsyncIterable<CdbFile>;

	async searchByName(query: string, limit: number): Promise<CardSearchResult[]> {
		const index = await this.getIndex();
		const needle = query.toLowerCase();
		const results: CardSearchResult[] = [];

		for (const [id, card] of index) {
			if (card.name.toLowerCase().includes(needle)) {
				results.push({ id, name: card.name, source: card.source });
				if (results.length >= limit) {
					break;
				}
			}
		}

		return results;
	}

	async findById(id: number): Promise<CardSearchResult | null> {
		const index = await this.getIndex();
		const card = index.get(id);

		return card ? { id, name: card.name, source: card.source } : null;
	}

	async listSources(): Promise<CardSource[]> {
		const index = await this.getIndex();
		const counts = new Map<string, number>();

		for (const { source } of index.values()) {
			counts.set(source, (counts.get(source) ?? 0) + 1);
		}

		return [...counts.entries()]
			.map(([source, count]) => ({ source, count }))
			.sort((a, b) => a.source.localeCompare(b.source));
	}

	async findBySource(source: string, limit: number, offset: number): Promise<CardPage> {
		const index = await this.getIndex();
		const matches: CardSearchResult[] = [];

		for (const [id, card] of index) {
			if (card.source === source) {
				matches.push({ id, name: card.name, source: card.source });
			}
		}

		matches.sort((a, b) => a.name.localeCompare(b.name));

		return { total: matches.length, cards: matches.slice(offset, offset + limit) };
	}

	async resolveNames(ids: number[]): Promise<Map<number, string>> {
		const index = await this.getIndex();
		const names = new Map<number, string>();

		for (const id of ids) {
			const card = index.get(id);
			if (card) {
				names.set(id, card.name);
			}
		}

		return names;
	}

	// Cache the index but rebuild it once the TTL lapses, so the inspection page
	// reflects hot-reloaded .cdb files instead of serving a process-lifetime cache.
	private async getIndex(): Promise<Map<number, IndexedCard>> {
		if (this.index !== null && this.now() - this.builtAt < this.ttlMs) {
			return this.index;
		}

		if (!this.building) {
			this.building = this.buildIndex()
				.then((index) => {
					this.index = index;
					this.builtAt = this.now();

					return index;
				})
				.finally(() => {
					this.building = null;
				});
		}

		return this.building;
	}

	private async buildIndex(): Promise<Map<number, IndexedCard>> {
		const SQL = await initSqlJs();
		const index = new Map<number, IndexedCard>();

		for await (const file of this.cdbFiles()) {
			if (!file.path.endsWith(".cdb")) {
				continue;
			}

			const source = basename(file.path);
			try {
				const body = await file.read();
				const db = new SQL.Database(body);
				try {
					for (const { values } of db.exec(SELECT_NAMES)) {
						for (const [id, name] of values) {
							if (typeof id !== "number" || typeof name !== "string") {
								continue;
							}
							if (this.lastSourceWins || !index.has(id)) {
								index.set(id, { name, source });
							}
						}
					}
				} finally {
					db.close();
				}
			} catch (error) {
				this.logger.error(`Failed to read card database ${file.path}: ${error}`);
				continue;
			}
		}

		return index;
	}
}
