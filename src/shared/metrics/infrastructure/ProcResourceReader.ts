import { readFile } from "fs/promises";
import { join } from "path";

export type ProcessResources = {
	cpuSeconds: number;
	peakMemoryBytes: number;
};

// USER_HZ is 100 on every Linux architecture the server is deployed to.
const DEFAULT_CLOCK_TICKS_PER_SECOND = 100;
// Fields after the "(comm)" part of /proc/<pid>/stat start at field 3 (state).
const UTIME_INDEX = 14 - 3;
const STIME_INDEX = 15 - 3;

/**
 * Reads the CPU time and peak resident memory (VmHWM) of a process from the
 * Linux procfs. Returns null once the process is gone or procfs is missing.
 */
export class ProcResourceReader {
	constructor(
		private readonly procRoot: string = "/proc",
		private readonly clockTicksPerSecond: number = DEFAULT_CLOCK_TICKS_PER_SECOND,
	) {}

	public async read(pid: number): Promise<ProcessResources | null> {
		try {
			const [stat, status] = await Promise.all([
				readFile(join(this.procRoot, String(pid), "stat"), "utf8"),
				readFile(join(this.procRoot, String(pid), "status"), "utf8"),
			]);

			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			const ticks = Number(fields[UTIME_INDEX]) + Number(fields[STIME_INDEX]);
			const peakKb = Number(/^VmHWM:\s+(\d+)\s+kB/m.exec(status)?.[1] ?? 0);

			return {
				cpuSeconds: ticks / this.clockTicksPerSecond,
				peakMemoryBytes: peakKb * 1024,
			};
		} catch {
			return null;
		}
	}
}
