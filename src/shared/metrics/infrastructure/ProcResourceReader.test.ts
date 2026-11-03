import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { ProcResourceReader } from "./ProcResourceReader";

describe("ProcResourceReader", () => {
	let procRoot: string;

	beforeEach(async () => {
		procRoot = await mkdtemp(join(tmpdir(), "proc-reader-"));
	});

	afterEach(async () => {
		await rm(procRoot, { recursive: true, force: true });
	});

	async function writeProc(pid: number, stat: string, status: string): Promise<void> {
		await mkdir(join(procRoot, String(pid)));
		await writeFile(join(procRoot, String(pid), "stat"), stat);
		await writeFile(join(procRoot, String(pid), "status"), status);
	}

	it("reads user plus system CPU seconds and the peak resident memory of a process", async () => {
		// utime=250 and stime=50 clock ticks; the command name contains spaces and parentheses.
		const stat =
			"42 (Core (Integrator) x) S 1 42 42 0 -1 4194560 100 0 0 0 250 50 0 0 20 0 1 0 100 1000 10";
		const status = "Name:\tCoreIntegrator\nVmRSS:\t  20480 kB\nVmHWM:\t  30720 kB\n";
		await writeProc(42, stat, status);

		const usage = await new ProcResourceReader(procRoot, 100).read(42);

		expect(usage).toEqual({ cpuSeconds: 3, peakMemoryBytes: 30720 * 1024 });
	});

	it("returns null when the process no longer exists", async () => {
		const usage = await new ProcResourceReader(procRoot, 100).read(999);

		expect(usage).toBeNull();
	});
});
