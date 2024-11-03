import { DataSource } from "typeorm";

import { dataSource } from "../../../../evolution-types/src/data-source";
import { Database } from "./../../domain/Database";

export class PostgresTypeORM implements Database {
	private readonly dataSource: DataSource;

	constructor() {
		this.dataSource = dataSource;
	}

	async connect(): Promise<void> {
		await this.dataSource.initialize();
	}

	async close(): Promise<void> {
		await this.dataSource.destroy();
	}
}
