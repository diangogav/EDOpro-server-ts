import { readdir } from "fs/promises";
import { join } from "path";
import { DataSource } from "typeorm";

import { Database } from "../../../../evolution-types/src/Database";
import { mercuryDataSource } from "./data-source";

export class PreReleasesYGOProSQLiteTypeORM implements Database {
	private readonly dataSource: DataSource;
	private readonly mercuryPreReleasesDirectoryPath = "./resources/ygopro/prereleases/databases";

	constructor() {
		this.dataSource = mercuryDataSource;
	}

	async connect(): Promise<void> {
		await this.dataSource.initialize();
	}

	async initialize(): Promise<void> {
		const files = await readdir(this.mercuryPreReleasesDirectoryPath);
		const cdbFiles = files.filter((file) => file.endsWith(".cdb"));
		await this.load(cdbFiles);
	}

	async load(cdbFiles: string[]): Promise<void> {
		for (const file of cdbFiles) {
			console.log("loading prerelease cdb file: ", file)
			const filePath = join(this.mercuryPreReleasesDirectoryPath, file);

			await this.merge(filePath);
		}
	}

	async disconnect(): Promise<void> {
		if (this.dataSource.isInitialized) {
			await this.dataSource.destroy();
		}
	}

	private async merge(path: string): Promise<void> {
		const queryRunner = mercuryDataSource.createQueryRunner();
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
