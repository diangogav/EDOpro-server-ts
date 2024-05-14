import { readdir } from "fs/promises";
import { join } from "path";
import { DataSource } from "typeorm";

import { CardEntity } from "../../../../card/infrastructure/postgres/CardEntity";
import { CardTextEntity } from "../../../../card/infrastructure/postgres/CardTextEntity";
import { Database } from "../../domain/Database";
import { dataSource } from "./data-source";

export class SQLiteTypeORM implements Database {
	private readonly dataSource: DataSource;
	private readonly directoryPath = "./databases";

	constructor() {
		this.dataSource = dataSource;
	}

	async connect(): Promise<void> {
		await this.dataSource.initialize();
	}

	async initialize(): Promise<void> {
		const files = await readdir(this.directoryPath);
		const cdbFiles = files.filter((file) => file.endsWith(".cdb"));
		await this.load(cdbFiles);
	}

	async load(cdbFiles: string[]): Promise<void> {
		for (const file of cdbFiles) {
			const filePath = join(this.directoryPath, file);
			// eslint-disable-next-line no-await-in-loop
			await this.merge(filePath);
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

	private async isLoaded(): Promise<boolean> {
		const cardRepository = dataSource.getRepository(CardEntity);
		const cardTextRepository = dataSource.getRepository(CardTextEntity);

		const cardsCount = await cardRepository.count();
		const cardTextsCount = await cardTextRepository.count();

		return cardsCount > 0 && cardTextsCount > 0 && cardsCount === cardTextsCount;
	}
}
