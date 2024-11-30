import { readdir } from "fs/promises";
import { join } from "path";
import { DataSource } from "typeorm";

import { Database } from "../../../../evolution-types/src/Database";
import { dataSource, mercuryDataSource } from "./data-source";

export class SQLiteTypeORM implements Database {
	private readonly dataSource: DataSource;
	private readonly mercuryDataSource: DataSource;
	private readonly directoryPath = "./databases/evolution";
	private readonly mercuryDirectoryPath = "./databases/mercury";

	constructor() {
		this.dataSource = dataSource;
		this.mercuryDataSource = mercuryDataSource;
	}

	async connect(): Promise<void> {
		await this.dataSource.initialize();
		await this.mercuryDataSource.initialize();
	}

	async initialize(): Promise<void> {
		const files = await readdir(this.directoryPath);
		const mercuryFiles = await readdir(this.mercuryDirectoryPath);
		const cdbFiles = files.filter((file) => file.endsWith(".cdb"));
		const cdbMercuryFiles = mercuryFiles.filter((file) => file.endsWith(".cdb"));
		await this.load(cdbFiles);
		await this.loadMercury(cdbMercuryFiles);
	}

	async load(cdbFiles: string[]): Promise<void> {
		for (const file of cdbFiles) {
			const filePath = join(this.directoryPath, file);
			// eslint-disable-next-line no-await-in-loop
			await this.merge(filePath);
		}
	}

	async loadMercury(cdbMercuryFiles: string[]): Promise<void> {
		for (const file of cdbMercuryFiles) {
			const mercuryFilePath = join(this.mercuryDirectoryPath, file);
			// eslint-disable-next-line no-await-in-loop
			await this.mergeMercury(mercuryFilePath);
		}
	}

	private async merge(path: string): Promise<void> {
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

	private async mergeMercury(path: string): Promise<void> {
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
