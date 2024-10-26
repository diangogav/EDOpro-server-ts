import { Request, Response } from "express";
import { SimpleGit, simpleGit, SimpleGitOptions } from "simple-git";

import { SQLiteTypeORM } from "../../shared/db/sqlite/infrastructure/SQLiteTypeORM";
import { Logger } from "../../shared/logger/domain/Logger";

export class SyncRepositoriesController {
	constructor(private readonly logger: Logger) {}

	async run(_req: Request, response: Response): Promise<void> {
		this.logger.info("Init sync database and scripts");
		response.status(200).json({});
		await this.syncDatabase();
		this.logger.info("Database updated.");
		await this.syncScripts();
		this.logger.info("Scripts updated.");
	}

	private async syncScripts(): Promise<void> {
		const options: Partial<SimpleGitOptions> = {
			baseDir: "scripts/evolution",
			binary: "git",
			maxConcurrentProcesses: 1,
			trimmed: false,
		};
		const git: SimpleGit = simpleGit(options);
		await git.pull();
	}

	private async syncDatabase(): Promise<void> {
		const options: Partial<SimpleGitOptions> = {
			baseDir: "databases/evolution",
			binary: "git",
			maxConcurrentProcesses: 1,
			trimmed: false,
		};
		const git: SimpleGit = simpleGit(options);
		const localCommit = (await git.revparse(["HEAD"])).trim();
		this.logger.info("Pulling databases");
		await git.pull();
		this.logger.info("Databases pull success");
		const remoteCommit = (await git.revparse(["HEAD"])).trim();

		const diffSummary = await git.diff([
			"--name-only",
			"--diff-filter=AM",
			`${localCommit}..${remoteCommit}`,
		]);

		this.logger.info(`Databases difference: ${JSON.stringify(diffSummary)}`);

		const database = new SQLiteTypeORM();
		await database.initialize();
	}
}
