import { readdir } from "fs/promises";
import { join } from "path";
import { DataSource } from "typeorm";

import { Database } from "../../../../evolution-types/src/Database";
import {
	buildCardDataSource,
	getCardDataSource,
} from "@shared/db/sqlite/infrastructure/data-source";
import { config } from "src/config";

export class EdoProSQLiteTypeORM implements Database {
	private readonly directoryPaths: string[];

	constructor(directoryPaths?: string[]) {
		this.directoryPaths = directoryPaths ?? [`${config.resources.dir}/edopro/databases`];
	}

	async connect(): Promise<void> {
		await getCardDataSource().initialize();
	}

	async initialize(): Promise<void> {
		await this.mergeAll(getCardDataSource());
	}

	// Build a fresh datasource backed by `databaseFile`, merge every .cdb into it,
	// and return it ready to be swapped in. Never touches the live datasource, so a
	// rebuild can run while the current one is still serving lookups.
	async build(databaseFile: string): Promise<DataSource> {
		const dataSource = buildCardDataSource(databaseFile);
		await dataSource.initialize();
		await this.mergeAll(dataSource);

		return dataSource;
	}

	private async mergeAll(dataSource: DataSource): Promise<void> {
		for (const directoryPath of this.directoryPaths) {
			const files = await readdir(directoryPath);
			const cdbFiles = files.filter((file) => file.endsWith(".cdb"));
			for (const file of cdbFiles) {
				await this.merge(dataSource, join(directoryPath, file));
			}
		}
	}

	private async merge(dataSource: DataSource, path: string): Promise<void> {
		const queryRunner = dataSource.createQueryRunner();
		await queryRunner.connect();
		await queryRunner.startTransaction();
		try {
			await queryRunner.query(`ATTACH DATABASE '${path}' AS toMerge`);
			await queryRunner.query("INSERT OR REPLACE INTO datas SELECT * FROM toMerge.datas");
			await queryRunner.query("INSERT OR REPLACE INTO texts SELECT * FROM toMerge.texts");
			await queryRunner.commitTransaction();
			await queryRunner.query("DETACH toMerge");
		} catch (error) {
			await queryRunner.rollbackTransaction();
			throw error;
		} finally {
			await queryRunner.release();
		}
	}
}
