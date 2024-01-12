import { spawn } from "child_process";

import { Logger } from "../../../modules/shared/logger/domain/Logger";
import { MercuryClient } from "../../client/domain/MercuryClient";

export class MercuryRoom {
	readonly id: string;
	private readonly _clients: MercuryClient[];
	private _logger: Logger;
	private _coreStarted = false;
	private _corePort: number | null = null;

	private constructor({ id }: { id: string }) {
		this.id = id;
		this._clients = [];
	}

	static create(command: string, logger: Logger): MercuryRoom {
		const room = new MercuryRoom({ id: command });
		room._logger = logger;

		return room;
	}

	addClient(client: MercuryClient): void {
		this._clients.push(client);
		if (this._coreStarted && this._corePort) {
			client.connectToCore({
				url: "127.0.0.1",
				port: this._corePort,
			});
		}
	}

	startCore(): void {
		this._logger.info("Starting Mercury Core");
		const core = spawn(
			"./ygopro",
			["0", "-1", "0", "1", "5", "F", "F", "8000", "5", "1", "180", "2", "0", "0", "0"],
			{
				cwd: "ygopro",
			}
		);

		core.on("error", (error) => {
			this._logger.error("Error running mercury core");
			this._logger.error(error);
		});

		core.stdout.setEncoding("utf8");
		core.stdout.once("data", (data: Buffer) => {
			this._logger.info(`Started Mercury Core at port: ${data.toString()}`);
			this._coreStarted = true;
			this._corePort = +data.toString();
			this._clients.forEach((client) => {
				client.connectToCore({
					url: "127.0.0.1",
					port: +data.toString(),
				});
			});
		});

		core.stderr.on("data", (data: Buffer) => {
			this._logger.info(`Error data: ${data.toString("hex")}`);
		});
	}

	get isCoreStarted(): boolean {
		return this._coreStarted;
	}
}
