import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DataSource } from "typeorm";

import { CardDbReloader } from "@shared/db/sqlite/infrastructure/CardDbReloader";
import { CARD_DB_FILE, swapCardDataSource } from "@shared/db/sqlite/infrastructure/data-source";
import { Logger } from "@shared/logger/domain/Logger";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
import { config } from "src/config";

import { EdoProSQLiteTypeORM } from "./EdoProSQLiteTypeORM";

const RELOAD_INTERVAL_MS = 10 * 60 * 1000;

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

	private async fingerprint(): Promise<string> {
		const hash = createHash("sha512");
		const files = (await readdir(this.directory)).filter((file) => file.endsWith(".cdb")).sort();
		for (const file of files) {
			hash.update(file);
			hash.update(await readFile(join(this.directory, file)));
		}

		return hash.digest("hex");
	}

	private async buildNext(): Promise<DataSource> {
		const nextFile = `evolution_cards.${Date.now()}.db`;
		const dataSource = await this.orm.build(nextFile);
		this.fileToDelete = this.currentFile;
		this.currentFile = nextFile;

		return dataSource;
	}

	private async dispose(previous: DataSource): Promise<void> {
		try {
			await previous.destroy();
		} catch (error) {
			this.logger.error("Failed disposing the previous EDOPro card datasource");
			this.logger.error(error);
		}

		const stale = this.fileToDelete;
		this.fileToDelete = undefined;
		if (stale) {
			await rm(stale, { force: true }).catch(() => undefined);
		}
	}
}
