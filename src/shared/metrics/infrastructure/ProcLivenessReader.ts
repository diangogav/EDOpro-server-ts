import { readdir, readFile } from "fs/promises";
import { join } from "path";

export type ProcessLiveness = {
	threads: number;
	childProcesses: number;
};

/**
 * Counts the threads and the live child processes of this process from the
 * Linux procfs, independently of what the rooms believe they started. Returns
 * null when procfs is missing.
 */
export class ProcLivenessReader {
	constructor(
		private readonly procRoot: string = "/proc",
		private readonly pid: number = process.pid,
	) {}

	public async read(): Promise<ProcessLiveness | null> {
		const self = join(this.procRoot, String(this.pid));
		try {
			const status = await readFile(join(self, "status"), "utf8");
			const threads = Number(/^Threads:\s+(\d+)/m.exec(status)?.[1] ?? 0);
			const taskIds = await readdir(join(self, "task"));
			const children = await Promise.all(
				taskIds.map((tid) => readFile(join(self, "task", tid, "children"), "utf8").catch(() => "")),
			);
			const childProcesses = children.join(" ").split(/\s+/).filter(Boolean).length;

			return { threads, childProcesses };
		} catch {
			return null;
		}
	}
}
