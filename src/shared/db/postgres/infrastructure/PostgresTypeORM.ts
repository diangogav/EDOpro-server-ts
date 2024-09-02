import { DataSource } from "typeorm";

import { Database } from "./../../domain/Database";
import { dataSource } from "./data-source";

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
