import { readdir } from "fs/promises";
import { join } from "path";
import { DataSource } from "typeorm";

import { CardEntity } from "../../../../card/infrastructure/postgres/CardEntity";
import { CardTextEntity } from "../../../../card/infrastructure/postgres/CardTextEntity";
import { Database } from "../../domain/Database";
import { dataSource } from "./data-source";

export class SQLiteTypeORM implements Database {
	private readonly dataSource: DataSource;

	constructor() {
		this.dataSource = dataSource;
	}

	async connect(): Promise<void> {
		await this.dataSource.initialize();
	}

	async initialize(): Promise<void> {
		const databaseLoaded = await this.isLoaded();

		if (databaseLoaded) {
			return;
		}

		const directoryPath = "./databases";
		const files = await readdir(directoryPath);
		const cdbFiles = files.filter((file) => file.endsWith(".cdb"));
		for (const file of cdbFiles) {
			const filePath = join(directoryPath, file);
			// eslint-disable-next-line no-await-in-loop
			await this.merge(filePath);
		}
	}

	private async merge(path: string): Promise<void> {
		const queryRunner = dataSource.manager;
		await queryRunner.query(`ATTACH DATABASE '${path}' AS toMerge`);
		await queryRunner.query("INSERT OR REPLACE INTO datas SELECT * FROM toMerge.datas");
		await queryRunner.query("INSERT OR REPLACE INTO texts SELECT * FROM toMerge.texts");
		await queryRunner.query("DETACH toMerge");
	}

	private async isLoaded(): Promise<boolean> {
		const cardRepository = dataSource.getRepository(CardEntity);
		const cardTextRepository = dataSource.getRepository(CardTextEntity);

		const cardsCount = await cardRepository.count();
		const cardTextsCount = await cardTextRepository.count();

		return cardsCount > 0 && cardTextsCount > 0 && cardsCount === cardTextsCount;
	}
}
