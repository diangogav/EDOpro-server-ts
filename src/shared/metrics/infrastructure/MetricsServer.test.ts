import { Counter, Registry } from "@prometheus-io/client";
import { AddressInfo } from "net";

import { MetricsServer } from "./MetricsServer";

describe("MetricsServer", () => {
	let server: MetricsServer;

	afterEach(async () => {
		await server.stop();
	});

	async function startServer(): Promise<string> {
		const registry = new Registry();
		new Counter({ name: "test_total", help: "test counter", registers: [registry] }).inc();
		server = new MetricsServer(registry, "127.0.0.1", 0);
		const address = (await server.start()) as AddressInfo;

		return `http://127.0.0.1:${address.port}`;
	}

	it("serves the registry in the Prometheus text format on /metrics", async () => {
		const baseUrl = await startServer();

		const response = await fetch(`${baseUrl}/metrics`);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/plain");
		expect(await response.text()).toContain("test_total 1");
	});

	it("answers 404 on any other path", async () => {
		const baseUrl = await startServer();

		const response = await fetch(`${baseUrl}/`);

		expect(response.status).toBe(404);
	});
});
