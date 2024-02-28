import { Request, Response } from "express";
import { SimpleGit, simpleGit, SimpleGitOptions } from "simple-git";

import { SQLiteTypeORM } from "../../modules/shared/db/postgres/infrastructure/SQLiteTypeORM";

export class SyncRepositoriesController {
	async run(_req: Request, response: Response): Promise<void> {
		await this.syncDatabase();
		await this.syncScripts();
		response.status(200).json({});
	}

	private async syncScripts(): Promise<void> {
		const options: Partial<SimpleGitOptions> = {
			baseDir: "core/scripts",
			binary: "git",
			maxConcurrentProcesses: 1,
			trimmed: false,
		};
		const git: SimpleGit = simpleGit(options);
		await git.pull();
	}

	private async syncDatabase(): Promise<void> {
		const options: Partial<SimpleGitOptions> = {
			baseDir: "databases",
			binary: "git",
			maxConcurrentProcesses: 1,
			trimmed: false,
		};
		const git: SimpleGit = simpleGit(options);
		const localCommit = (await git.revparse(["HEAD"])).trim();
		await git.pull();
		const remoteCommit = (await git.revparse(["HEAD"])).trim();

		if (localCommit === remoteCommit) {
			return;
		}

		const diffSummary = await git.diff([
			"--name-only",
			"--diff-filter=AM",
			`${localCommit}..${remoteCommit}`,
		]);

		const updatedFiles = diffSummary.split("\n").filter((item) => item !== "");

		const database = new SQLiteTypeORM();
		await database.load(updatedFiles);
	}
}
