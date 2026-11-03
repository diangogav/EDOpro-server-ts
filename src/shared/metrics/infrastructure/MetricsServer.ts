import { Registry } from "@prometheus-io/client";
import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo } from "net";

/**
 * Serves `/metrics` on its own host and port, apart from the public HTTP API,
 * so it can listen only on an interface the metrics collector reaches.
 */
export class MetricsServer {
	private server: Server | null = null;

	constructor(
		private readonly registry: Registry,
		private readonly host: string,
		private readonly port: number,
	) {}

	public start(): Promise<AddressInfo | string | null> {
		const server = createServer((request, response) => void this.handle(request, response));
		this.server = server;

		return new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(this.port, this.host, () => {
				server.off("error", reject);
				resolve(server.address());
			});
		});
	}

	public stop(): Promise<void> {
		const server = this.server;
		this.server = null;
		if (!server) {
			return Promise.resolve();
		}

		return new Promise((resolve) => server.close(() => resolve()));
	}

	private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
		if (request.method !== "GET" || request.url?.split("?")[0] !== "/metrics") {
			response.writeHead(404).end();

			return;
		}

		try {
			const body = await this.registry.metrics();
			response.writeHead(200, { "Content-Type": this.registry.contentType }).end(body);
		} catch {
			response.writeHead(500).end();
		}
	}
}
