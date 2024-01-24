import { spawn } from "child_process";
import * as crypto from "crypto";
import { EventEmitter } from "stream";

import { RoomState } from "../../../modules/room/domain/RoomState";
import { Logger } from "../../../modules/shared/logger/domain/Logger";
import { YgoRoom } from "../../../modules/shared/room/domain/YgoRoom";
import { MercuryClient } from "../../client/domain/MercuryClient";
import { HostInfo } from "./host-info/HostInfo";
import { Mode } from "./host-info/Mode.enum";
import { priorityRuleMappings, ruleMappings } from "./RuleMappings";
import { MercuryWaitingState } from "./states/MercuryWaitingState";

export class MercuryRoom extends YgoRoom {
	readonly id: number;
	readonly name: string;
	readonly password: string;
	private readonly _clients: MercuryClient[];
	private _logger: Logger;
	private _coreStarted = false;
	private _corePort: number | null = null;
	private readonly _hostInfo: HostInfo;
	private roomState: RoomState | null = null;

	private constructor({
		id,
		name,
		password,
		hostInfo,
	}: {
		id: number;
		password: string;
		name: string;
		hostInfo: HostInfo;
	}) {
		super();
		this.id = id;
		this.name = name;
		this.password = password;
		this._clients = [];
		this._hostInfo = hostInfo;
	}

	static create(id: number, command: string, logger: Logger, emitter: EventEmitter): MercuryRoom {
		let hostInfo: HostInfo = {
			mode: Mode.SINGLE,
			startLp: 8000,
			startHand: 5,
			drawCount: 1,
			timeLimit: 180,
			rule: 0,
			noCheck: false,
			noShuffle: false,
			lflist: -1,
			duelRule: 5,
		};

		const [configuration, password] = command.split("#");
		const options = configuration.split(",").map((_) => _.trim());
		const mappingKeys = Object.keys(ruleMappings);
		const priorityMappingKeys = Object.keys(priorityRuleMappings).map((_) => _.trim());
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

		const room = new MercuryRoom({ id, hostInfo, name: command, password });

		room._logger = logger;
		room.emitter = emitter;

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
			[
				"0",
				this._hostInfo.lflist.toString(),
				this._hostInfo.rule.toString(),
				this._hostInfo.mode.toString(),
				this._hostInfo.duelRule.toString(),
				this._hostInfo.noCheck ? "T" : "F",
				this._hostInfo.noShuffle ? "T" : "F",
				this._hostInfo.startLp.toString(),
				this._hostInfo.startHand.toString(),
				this._hostInfo.drawCount.toString(),
				this._hostInfo.timeLimit.toString(),
				"2", //REPLAY MODE
				...this.generateSeeds(),
			],
			{
				cwd: "mercury",
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
			this._logger.info(`Error data: ${data.toString()}`);
		});
	}

	get isCoreStarted(): boolean {
		return this._coreStarted;
	}

	get hostInfo(): HostInfo {
		return this._hostInfo;
	}

	get playersCount(): number {
		return this._clients.length;
	}

	waiting(): void {
		this.roomState?.removeAllListener();
		this.roomState = new MercuryWaitingState(this.emitter, this._logger);
	}

	toPresentation(): { [key: string]: unknown } {
		return {
			roomid: this.id,
			roomname: this.name,
			roomnotes: "",
			roommode: this._hostInfo.mode,
			needpass: true,
			team1: 1,
			team2: 1,
			best_of: 3,
			duel_flag: 0,
			forbidden_types: 0,
			extra_rules: 0,
			start_lp: this._hostInfo.startLp,
			start_hand: this._hostInfo.startHand,
			draw_count: this._hostInfo.drawCount,
			time_limit: this._hostInfo.timeLimit,
			rule: this._hostInfo.rule,
			no_check: this._hostInfo.noCheck,
			no_shuffle: this._hostInfo.noShuffle,
			banlist_hash: 0,
			istart: "waiting",
			main_min: 40,
			main_max: 60,
			extra_min: 0,
			extra_max: 15,
			side_min: 0,
			side_max: 15,
			users: this._clients.map((player) => ({
				name: player.name.replace(/\0/g, "").trim(),
				pos: player.position,
			})),
		};
	}

	private generateSeeds(): string[] {
		const randomSeed1 = crypto.randomBytes(8).readBigUInt64LE().toString();
		const randomSeed2 = crypto.randomBytes(8).readBigUInt64LE().toString();
		const randomSeed3 = crypto.randomBytes(8).readBigUInt64LE().toString();

		return [randomSeed1, randomSeed2, randomSeed3];
	}
}
