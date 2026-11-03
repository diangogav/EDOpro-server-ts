import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { ProcLivenessReader } from "./ProcLivenessReader";

describe("ProcLivenessReader", () => {
	let procRoot: string;

	beforeEach(async () => {
		procRoot = await mkdtemp(join(tmpdir(), "proc-liveness-"));
	});

	afterEach(async () => {
		await rm(procRoot, { recursive: true, force: true });
	});

	async function writeProcess(
		pid: number,
		threads: number,
		childrenByTask: Record<string, string>,
	) {
		const self = join(procRoot, String(pid));
		await mkdir(join(self, "task"), { recursive: true });
		await writeFile(join(self, "status"), `Name:\tnode\nThreads:\t${threads}\nVmHWM:\t1 kB\n`);
		for (const [tid, children] of Object.entries(childrenByTask)) {
			await mkdir(join(self, "task", tid));
			await writeFile(join(self, "task", tid, "children"), children);
		}
	}

	it("counts the threads and the children of every task", async () => {
		await writeProcess(42, 12, { "42": "100 101 ", "43": "", "44": "102" });

		const liveness = await new ProcLivenessReader(procRoot, 42).read();

		expect(liveness).toEqual({ threads: 12, childProcesses: 3 });
	});

	it("reports zero children when no task has any", async () => {
		await writeProcess(42, 3, { "42": "" });

		const liveness = await new ProcLivenessReader(procRoot, 42).read();

		expect(liveness).toEqual({ threads: 3, childProcesses: 0 });
	});

	it("returns null when procfs is missing", async () => {
		const liveness = await new ProcLivenessReader(procRoot, 999).read();

		expect(liveness).toBeNull();
	});
});
