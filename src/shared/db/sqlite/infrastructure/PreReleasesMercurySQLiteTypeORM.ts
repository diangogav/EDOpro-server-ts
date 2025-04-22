import { readdir } from "fs/promises";
import { join } from "path";
import { DataSource } from "typeorm";

import { Database } from "../../../../evolution-types/src/Database";
import { mercuryDataSource } from "./data-source";

export class PreReleasesMercurySQLiteTypeORM implements Database {
	private readonly dataSource: DataSource;
	private readonly mercuryPreReleasesDirectoryPath = "./databases/mercury-pre-releases";

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
			const filePath = join(this.mercuryPreReleasesDirectoryPath, file);
			// eslint-disable-next-line no-await-in-loop
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
