import { Registry } from "@prometheus-io/client";

import { ProcessLivenessMetrics } from "./ProcessLivenessMetrics";

describe("ProcessLivenessMetrics", () => {
	it("reads the thread and child process counts on each scrape", async () => {
		const registry = new Registry();
		const read = jest
			.fn()
			.mockResolvedValueOnce({ threads: 11, childProcesses: 2 })
			.mockResolvedValueOnce({ threads: 14, childProcesses: 0 });
		new ProcessLivenessMetrics(registry, { read });

		const first = await registry.metrics();
		const second = await registry.metrics();

		expect(first).toContain("evolution_process_threads 11");
		expect(first).toContain("evolution_child_processes 2");
		expect(second).toContain("evolution_process_threads 14");
		expect(second).toContain("evolution_child_processes 0");
		expect(read).toHaveBeenCalledTimes(2);
	});

	it("keeps the last values when procfs cannot be read", async () => {
		const registry = new Registry();
		const read = jest
			.fn()
			.mockResolvedValueOnce({ threads: 5, childProcesses: 1 })
			.mockResolvedValue(null);
		new ProcessLivenessMetrics(registry, { read });

		await registry.metrics();
		const output = await registry.metrics();

		expect(output).toContain("evolution_process_threads 5");
		expect(output).toContain("evolution_child_processes 1");
	});
});
