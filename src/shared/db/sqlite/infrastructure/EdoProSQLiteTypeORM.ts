import { readdir } from "fs/promises";
import { join } from "path";
import { DataSource } from "typeorm";

import { Database } from "../../../../evolution-types/src/Database";
import { dataSource } from "./data-source";

export class EdoProSQLiteTypeORM implements Database {
	private readonly dataSource: DataSource;
	private readonly directoryPaths: string[];

	constructor(directoryPaths?: string[]) {
		this.dataSource = dataSource;
		this.directoryPaths = directoryPaths ?? ["./resources/edopro/databases"];
	}

	async connect(): Promise<void> {
		await this.dataSource.initialize();
	}

	async initialize(): Promise<void> {
		for (const dirPath of this.directoryPaths) {
			const files = await readdir(dirPath);
			const cdbFiles = files.filter((file) => file.endsWith(".cdb"));
			for (const file of cdbFiles) {
				await this.merge(join(dirPath, file));
			}
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
}
