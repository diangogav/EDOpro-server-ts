import { spawn } from "child_process";

import { Logger } from "../../../modules/shared/logger/domain/Logger";
import { MercuryClient } from "../../client/domain/MercuryClient";
import { HostInfo } from "./host-info/HostInfo";
import { Mode } from "./host-info/Mode.enum";
import { priorityRuleMappings, ruleMappings } from "./RuleMappings";

export class MercuryRoom {
	readonly id: string;
	private readonly _clients: MercuryClient[];
	private _logger: Logger;
	private _coreStarted = false;
	private _corePort: number | null = null;
	private readonly _hostInfo: HostInfo;

	private constructor({ id, hostInfo }: { id: string; hostInfo: HostInfo }) {
		this.id = id;
		this._clients = [];
		this._hostInfo = hostInfo;
	}

	static create(command: string, logger: Logger): MercuryRoom {
		let hostInfo: HostInfo = {
			mode: Mode.SINGLE,
			startLp: 8000,
		};

		const [configuration, _password] = command.split("#");
		const options = configuration.split(",");
		const mappingKeys = Object.keys(ruleMappings);
		const priorityMappingKeys = Object.keys(priorityRuleMappings);
		const priorityRulesCommands: string[] = [];
		options.forEach((option) => {
			const mappingKey = mappingKeys.find((key) => option.startsWith(key));

			if (mappingKey) {
				const mapping = ruleMappings[mappingKey];
				const rule = mapping.get(option);
				hostInfo = { ...hostInfo, ...rule };
			}

			const priorityMappingKey = priorityMappingKeys.find((key) => option.startsWith(key));
			if (priorityMappingKey) {
				priorityRulesCommands.push(option);
			}
		});

		priorityRulesCommands.forEach((option: string) => {
			const priorityMappingKey = priorityMappingKeys.find((key) => option.startsWith(key));
			if (priorityMappingKey) {
				const mapping = priorityRuleMappings[priorityMappingKey];
				const rule = mapping.get(option);
				hostInfo = { ...hostInfo, ...rule };
			}
		});

		const room = new MercuryRoom({ id: command, hostInfo });

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

	get hostInfo(): HostInfo {
		return this._hostInfo;
	}
}
