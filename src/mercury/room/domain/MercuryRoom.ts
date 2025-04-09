import { spawn } from "child_process";
import net from "net";
import BanListMemoryRepository from "src/edopro/ban-list/infrastructure/BanListMemoryRepository";
import { Team } from "src/shared/room/Team";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "../../../edopro/room/domain/RoomState";
import { Logger } from "../../../shared/logger/domain/Logger";
import { DuelState, YgoRoom } from "../../../shared/room/domain/YgoRoom";
import MercuryBanListMemoryRepository from "../../ban-list/infrastructure/MercuryBanListMemoryRepository";
import { MercuryClient } from "../../client/domain/MercuryClient";
import {
	MercuryJointGameToCoreMessage,
	MercuryPlayerInfoToCoreMessage,
	MercuryToObserverToCoreMessage,
} from "../../messages/server-to-core";
import MercuryRoomList from "../infrastructure/MercuryRoomList";
import { HostInfo } from "./host-info/HostInfo";
import { Mode } from "./host-info/Mode.enum";
import { priorityRuleMappings, ruleMappings } from "./RuleMappings";
import { MercuryChoosingOrderState } from "./states/MercuryChoosingOrderState";
import { MercuryDuelingState } from "./states/MercuryDuelingState";
import { MercuryRockPaperScissorState } from "./states/MercuryRockPaperScissorsState";
import { MercurySideDeckingState } from "./states/MercurySideDeckingState";
import { MercuryWaitingState } from "./states/MercuryWaitingState";

export class MercuryRoom extends YgoRoom {
	readonly name: string;
	readonly password: string;
	readonly createdBySocketId: string;
	private _logger: Logger;
	private _coreStarted = false;
	private _corePort: number | null = null;
	private _banListHash: number;
	private _edoBanListHash: number | null;
	private _joinBuffer: Buffer | null = null;
	private readonly _hostInfo: HostInfo;
	private roomState: RoomState | null = null;
	private route = "mercury";

	private constructor({
		id,
		name,
		password = "",
		hostInfo,
		team0,
		team1,
		ranked,
		createdBySocketId,
		bestOf,
		startLp,
	}: {
		id: number;
		password: string;
		name: string;
		hostInfo: HostInfo;
		team0: number;
		team1: number;
		ranked: boolean;
		createdBySocketId: string;
		bestOf: number;
		startLp: number;
	}) {
		super({ team0, team1, ranked, bestOf, startLp, id, notes: "" });
		this.name = name;
		this.password = password;
		this._clients = [];
		this._hostInfo = hostInfo;
		this._state = DuelState.WAITING;
		this._banListHash = 0;
		this.createdBySocketId = createdBySocketId;
	}

	static create(
		id: number,
		command: string,
		logger: Logger,
		emitter: EventEmitter,
		playerInfo: PlayerInfoMessage,
		createdBySocketId: string
	): MercuryRoom {
		let hostInfo: HostInfo = {
			mode: Mode.SINGLE,
			startLp: 8000,
			startHand: 5,
			drawCount: 1,
			timeLimit: 180,
			rule: 1,
			noCheck: false,
			noShuffle: false,
			lflist: MercuryBanListMemoryRepository.getLastTCGIndex(),
			duelRule: 5,
		};

		const [configuration, password] = command.split("#");
		const options = configuration
			.toLowerCase()
			.split(",")
			.map((_) => _.trim());

		const mappingKeys = Object.keys(ruleMappings);
		const priorityMappingKeys = Object.keys(priorityRuleMappings);
		const mappings = mappingKeys.map((key) => ruleMappings[key]);
		const priorityMappings = priorityMappingKeys.map((key) => priorityRuleMappings[key]);

		options.forEach((option) => {
			const items = mappings.filter((item) => item.validate(option));
			if (items.length > 1) {
				throw new Error(`Error: param match with two rules.`);
			}

			const mapping = items.shift();
			if (mapping) {
				const rule = mapping.get(option);
				hostInfo = { ...hostInfo, ...rule };
			}
		});

		options.forEach((option) => {
			const items = priorityMappings.filter((item) => item.validate(option));
			if (items.length > 1) {
				throw new Error(`Error: param match with two rules.`);
			}
			const mapping = items.shift();
			if (mapping) {
				const rule = mapping.get(option);
				hostInfo = { ...hostInfo, ...rule };
			}
		});

		const teamCount = hostInfo.mode === Mode.TAG ? 2 : 1;
		const ranked = Boolean(playerInfo.password);
		const room = new MercuryRoom({
			id,
			hostInfo,
			name: command,
			password,
			team0: teamCount,
			team1: teamCount,
			ranked,
			createdBySocketId,
			bestOf: hostInfo.mode === Mode.MATCH ? 3 : 1,
			startLp: hostInfo.startLp,
		});

		room._logger = logger;
		room.emitter = emitter;

		const routes = {
			edison: "mercury/alternatives/edison",
			hat: "mercury/alternatives/hat",
			goat: "mercury/alternatives/goat",
			tengu: "mercury/alternatives/tengu",
			md: "mercury/alternatives/md",
			jtp: "mercury/alternatives/jtp",
			gx: "mercury/alternatives/gx",
			mdc: "mercury/alternatives/mdc",
			rush: "mercury/alternatives/rush",
			speed: "mercury/alternatives/speed",
			world: "mercury/alternatives/world",
			pre: "mercury/pre-releases",
		};

		options.forEach((option) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			room.route = routes[option] ?? room.route;
		});

		return room;
	}

	addClient(client: MercuryClient): void {
		client.setNeedSpectatorMessages(false);
		this._clients.push(client);
		if (client.connectedToCore) {
			return;
		}

		this.connectClientToCore(client);
	}

	addSpectator(spectator: MercuryClient, needSpectatorMessages: boolean, fromLobby = false): void {
		spectator.setNeedSpectatorMessages(needSpectatorMessages);
		this._spectators.push(spectator);

		if (!spectator.connectedToCore) {
			this.connectClientToCore(spectator);
		}

		if (!fromLobby) {
			this.spectatorCache.forEach((message) => {
				spectator.socket.send(message);
			});
		}
	}

	startCore(): void {
		this._logger.debug("Starting Mercury Core");

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
			],
			{
				cwd: this.route,
			}
		);

		core.on("error", (error) => {
			this._logger.error("Error running mercury core");
			this._logger.error(error);
		});

		core.on("exit", (code, signal) => {
			this._logger.debug(
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				`Core closed for room ${this.id} with code: ${code} and signal: ${signal} `
			);

			MercuryRoomList.deleteRoom(this);
		});

		core.stdout.setEncoding("utf8");
		core.stdout.once("data", (data: Buffer) => {
			this._logger.debug(`Started Mercury Core at port: ${data.toString()}`);
			this._coreStarted = true;
			this._corePort = +data.toString();
			this._clients.forEach((client: MercuryClient) => {
				client.connectToCore({
					url: "127.0.0.1",
					port: +data.toString(),
				});
			});

			const watch = net.connect(this._corePort, "127.0.0.1", () => {
				this._logger.debug("Connected to watch");
				watch.write(MercuryPlayerInfoToCoreMessage.create("the Big Brother"));
				watch.write(MercuryJointGameToCoreMessage.create("the Big Brother"));
				watch.write(MercuryToObserverToCoreMessage.create());
			});

			watch.on("data", (data: Buffer) => {
				this._logger.debug(`Incoming data for spectators: ${data.toString("hex")}`);
				this.spectatorCache.push(data);
				this._spectators.forEach((spectator: MercuryClient) => {
					if (spectator.needSpectatorMessages) {
						spectator.socket.send(data);
					}
				});
			});

			watch.on("error", (error) => {
				this._logger.error("Error connecting watch at mercury room");
				this._logger.error(error);
			});
		});

		core.stderr.on("data", (data: Buffer) => {
			this._logger.error(`Error data at mercury core: ${data.toString()}`);
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

	get joinBuffer(): Buffer | null {
		return this._joinBuffer;
	}

	setJoinBuffer(buffer: Buffer): void {
		this._joinBuffer = buffer;
	}

	waiting(): void {
		this.roomState?.removeAllListener();
		this.roomState = new MercuryWaitingState(
			new UserAuth(new UserProfilePostgresRepository()),
			this.emitter,
			this._logger
		);
	}

	rps(): void {
		this._state = DuelState.RPS;
		this.roomState?.removeAllListener();
		this.roomState = new MercuryRockPaperScissorState(this.emitter, this._logger);
	}

	choosingOrder(): void {
		this._state = DuelState.CHOOSING_ORDER;
		this.roomState?.removeAllListener();
		this.roomState = new MercuryChoosingOrderState(this.emitter, this._logger);
	}

	dueling(): void {
		this._state = DuelState.DUELING;
		this.isStart = "start";
		this.roomState?.removeAllListener();
		this.roomState = new MercuryDuelingState(this, this.emitter, this._logger);
		//TODO: Mercury and EdoPro lists are linked by means of scripts in infrastructure
		const banList = BanListMemoryRepository.findByHash(this._banListHash);
		this.createDuel(banList?.name ?? null);
	}

	sideDecking(): void {
		this._state = DuelState.SIDE_DECKING;
		this.roomState?.removeAllListener();
		this.roomState = new MercurySideDeckingState(this.emitter, this._logger);
	}

	setBanListHash(banListHash: number): void {
		this._banListHash = banListHash;
		this._edoBanListHash =
			BanListMemoryRepository.findByMercuryHash(this._banListHash)?.hash ?? null;
	}

	calculatePlayerTeam(client: MercuryClient, position: number): void {
		const team = this.determineTeam(position);
		client.playerPosition(position, team);
	}

	get isPlayersFull(): boolean {
		return (
			(this._hostInfo.mode === Mode.SINGLE || this._hostInfo.mode === Mode.MATCH) &&
			this.playersCount === 2
		);
	}

	toPresentation(): { [key: string]: unknown } {
		return {
			roomid: this.id,
			roomname: this.name,
			roomnotes: "",
			roommode: this._hostInfo.mode,
			needpass: this.password.length > 0,
			team1: this.team0,
			team2: this.team1,
			best_of: this.bestOf,
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
			banlist_hash: this._edoBanListHash ?? this._banListHash,
			istart: this.isStart,
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

	destroy(): void {
		this.emitter.removeAllListeners();
		this.roomState?.removeAllListener();
		this._clients.forEach((client: MercuryClient) => {
			client.destroy();
		});
	}

	removeSpectator(spectator: MercuryClient): void {
		this._spectators = this._spectators.filter((item) => item.socket.id !== spectator.socket.id);
	}

	get banListHash(): number {
		return this._banListHash;
	}

	private connectClientToCore(client: MercuryClient): void {
		if (this._coreStarted && this._corePort) {
			client.connectToCore({
				url: "127.0.0.1",
				port: this._corePort,
			});
		}
	}

	private determineTeam(position: number): Team {
		if (this._hostInfo.mode === Mode.TAG) {
			if (position >= 0 && position < 2) {
				return Team.PLAYER;
			}
			if (position >= 7) {
				return Team.SPECTATOR;
			}

			return Team.OPPONENT;
		}

		return position === 0 ? Team.PLAYER : Team.OPPONENT;
	}
}
