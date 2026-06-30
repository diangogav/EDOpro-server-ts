import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { DataSource } from "typeorm";

import { CardDbReloader } from "@shared/db/sqlite/infrastructure/CardDbReloader";
import { CARD_DB_FILE, swapCardDataSource } from "@shared/db/sqlite/infrastructure/data-source";
import { Logger } from "@shared/logger/domain/Logger";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
import { config } from "src/config";

import { EdoProSQLiteTypeORM } from "./EdoProSQLiteTypeORM";

const RELOAD_INTERVAL_MS = 10 * 60 * 1000;
const DISPOSE_GRACE_MS = 60 * 1000;

// Wires the EDOPro card DB into the generic CardDbReloader: fingerprints the .cdb
// directory, rebuilds into a fresh file, swaps the datasource holder, and disposes
// the replaced datasource + its file. Mirrors the YGOPro reload timer.
export class EdoProCardDbHotReload {
	private readonly logger: Logger = LoggerFactory.getLogger();
	private readonly orm: EdoProSQLiteTypeORM;
	private readonly directory: string;
	private currentFile = CARD_DB_FILE;
	private fileToDelete?: string;
	private readonly reloader: CardDbReloader;

	constructor(directory: string = `${config.resources.dir}/edopro/databases`) {
		this.directory = directory;
		this.orm = new EdoProSQLiteTypeORM([directory]);
		this.reloader = new CardDbReloader({
			fingerprint: () => this.fingerprint(),
			build: () => this.buildNext(),
			swap: (next) => swapCardDataSource(next),
			destroy: (previous) => this.dispose(previous),
		});
	}

	// Record the boot fingerprint, then poll for changes. The boot datasource is
	// already built/merged by bootstrapPersistence, so we only prime here.
	async start(): Promise<void> {
		await this.reloader.prime();
		setInterval(() => {
			this.reloader.reloadIfChanged().catch((error) => {
				this.logger.error("Failed reloading EDOPro card DB");
				this.logger.error(error);
			});
		}, RELOAD_INTERVAL_MS);
	}

	// Fingerprint from each file's size + mtime instead of hashing contents, so the
	// periodic check never reads/hashes hundreds of MB on the shared event loop.
	private async fingerprint(): Promise<string> {
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

	private async buildNext(): Promise<DataSource> {
		const nextFile = `evolution_cards.${Date.now()}.db`;
		const dataSource = await this.orm.build(nextFile);
		this.fileToDelete = this.currentFile;
		this.currentFile = nextFile;

		return dataSource;
	}

	private dispose(previous: DataSource): Promise<void> {
		const stale = this.fileToDelete;
		this.fileToDelete = undefined;
		// Defer the close + file deletion so in-flight findByCode calls on the old
		// datasource can finish before its connection and file disappear.
		setTimeout(() => void this.retire(previous, stale), DISPOSE_GRACE_MS).unref();

		return Promise.resolve();
	}

	private async retire(previous: DataSource, stale?: string): Promise<void> {
		try {
			await previous.destroy();
		} catch (error) {
			this.logger.error("Failed disposing the previous EDOPro card datasource");
			this.logger.error(error);
		}

		if (stale) {
			try {
				await rm(stale, { force: true });
			} catch (error) {
				this.logger.error(`Failed deleting stale EDOPro card DB file ${stale}`);
				this.logger.error(error);
			}
		}
	}
}
