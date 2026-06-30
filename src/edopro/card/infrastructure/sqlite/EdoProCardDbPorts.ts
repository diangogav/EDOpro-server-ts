import { readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { DataSource } from "typeorm";

import { CardDbReloaderPorts } from "@shared/db/sqlite/infrastructure/CardDbReloader";
import { CARD_DB_FILE, swapCardDataSource } from "@shared/db/sqlite/infrastructure/data-source";
import { Logger } from "@shared/logger/domain/Logger";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";

import type { EdoProSQLiteTypeORM } from "./EdoProSQLiteTypeORM";

const DISPOSE_GRACE_MS = 60 * 1000;
const TEMP_DB_FILE = `${CARD_DB_FILE}.tmp`;

// CardDbReloader ports for the EDOPro card DB. The C++ core (CardSqliteRepository)
// opens the fixed path CARD_DB_FILE fresh per duel, so the reload must keep that
// file as the single canonical artifact: build into a temp, then atomically rename
// it onto CARD_DB_FILE. A running duel keeps its already-open inode (untouched); a
// new duel opens the replaced file. The file is never a sidecar the core can't see
// and is never deleted.
export class EdoProCardDbPorts implements CardDbReloaderPorts {
	private readonly logger: Logger = LoggerFactory.getLogger();

	constructor(
		private readonly orm: EdoProSQLiteTypeORM,
		private readonly directory: string,
		private readonly graceMs: number = DISPOSE_GRACE_MS,
	) {}

	// Fingerprint from each file's size + mtime instead of hashing contents, so the
	// periodic check never reads/hashes hundreds of MB on the shared event loop.
	async fingerprint(): Promise<string> {
		const files = (await readdir(this.directory)).filter((file) => file.endsWith(".cdb")).sort();
		const parts: string[] = [];
		for (const file of files) {
			try {
				const { size, mtimeMs } = await stat(join(this.directory, file));
				parts.push(`${file}:${size}:${mtimeMs}`);
			} catch {
				// file vanished between readdir and stat — skip it
			}
		}

		return parts.join("|");
	}

	async build(): Promise<DataSource> {
		// Drop any temp left by a crashed earlier build so we merge from a clean slate.
		await rm(TEMP_DB_FILE, { force: true }).catch(() => undefined);
		const dataSource = await this.orm.build(TEMP_DB_FILE);
		try {
			// Atomic on the same filesystem: the just-built datasource's open fd follows
			// the inode, so it becomes CARD_DB_FILE; the previous file's inode lives on
			// (held by the old datasource) until it is disposed.
			await rename(TEMP_DB_FILE, CARD_DB_FILE);

			return dataSource;
		} catch (error) {
			await dataSource.destroy().catch(() => undefined);
			await rm(TEMP_DB_FILE, { force: true }).catch(() => undefined);
			throw error;
		}
	}

	swap(next: DataSource): DataSource {
		return swapCardDataSource(next);
	}

	// Defer the close so in-flight findByCode calls on the old datasource finish.
	// Only the connection is closed — CARD_DB_FILE is never removed (build() already
	// replaced it in place, and the C++ core opens that path).
	destroy(previous: DataSource): Promise<void> {
		setTimeout(() => void this.retire(previous), this.graceMs).unref();

		return Promise.resolve();
	}

	private async retire(previous: DataSource): Promise<void> {
		try {
			await previous.destroy();
		} catch (error) {
			this.logger.error("Failed disposing the previous EDOPro card datasource");
			this.logger.error(error);
		}
	}
}
