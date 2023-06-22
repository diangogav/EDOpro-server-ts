import { spawn } from "child_process";

import { Client } from "../../../client/domain/Client";
import { Room } from "../../../room/domain/Room";
import { Logger } from "../../../shared/logger/domain/Logger";
import { Pino } from "../../../shared/logger/infrastructure/Pino";
import { Commands } from "../../domain/Commands";
import { BroadcastClientMessage } from "../../server-to-client/game-messages/BroadcastClientMessage";
import { RawClientMessage } from "../../server-to-client/game-messages/RawClientMessage";
import { StartDuelClientMessage } from "../../server-to-client/game-messages/StartDuelClientMessage";
import { TimeLimitClientMessage } from "../../server-to-client/game-messages/TimeLimitClientMessage";
import { UpdateCardClientMessage } from "../../server-to-client/game-messages/UpdateCardClientMessage";
import { UpdateDataClientMessage } from "../../server-to-client/game-messages/UpdateDataClientMessage";
import { WaitingClientMessage } from "../../server-to-client/game-messages/WaitingClientMessage";
import { FinishDuelHandler } from "../FinishDuelHandler";
import { RoomMessageHandlerContext } from "./RoomMessageHandlerContext";
import { NotReadyCommandStrategy } from "./Strategies/NotReadyCommandStrategy";
import { ReadyCommandStrategy } from "./Strategies/ReadyCommandStrategy";
import { RpsChoiceCommandStrategy } from "./Strategies/RpsChoiceCommandStrategy";
import { TryStartCommandStrategy } from "./Strategies/TryStartCommandStrategy";
import { UpdateDeckCommandStrategy } from "./Strategies/UpdateDeckCommandStrategy";

export class RoomMessageHandler {
	private readonly context: RoomMessageHandlerContext;
	private readonly logger: Logger = new Pino();

	constructor(data: Buffer, client: Client, clients: Client[], room: Room) {
		this.context = new RoomMessageHandlerContext(data, client, clients, room);
	}

	read(): void {
		if (this.context.isDataEmpty()) {
			return;
		}
		const header = this.context.readHeader();
		const command = header.subarray(2, 3).readInt8();

		if (command === Commands.UPDATE_DECK) {
			this.logger.info("UPDATE_DECK");
			this.context.setStrategy(new UpdateDeckCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.READY) {
			this.logger.info("READY");
			this.context.setStrategy(new ReadyCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.NOT_READY) {
			this.logger.info("NOT_READY");
			this.context.setStrategy(new NotReadyCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.TRY_START) {
			this.logger.info("TRY_START");
			this.context.setStrategy(new TryStartCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.RPS_CHOICE) {
			this.logger.info("RPS_CHOICE");
			this.context.setStrategy(new RpsChoiceCommandStrategy(this.context));
		}

		if (command === Commands.TURN_CHOICE) {
			this.logger.info("TURN_CHOICE");
			const turn = this.context.readBody(1).readInt8();
			this.logger.info(`TURN_CHOICE: ${turn}`);
			const position = this.context.room.clients.find(
				(client) => client === this.context.client
			)?.position;

			const playFirst = turn === 1 ? this.context.client.team : Number(!this.context.client.team);
			this.logger.info(`PLAY_FIRST: ${playFirst}`);

			const isTeam1GoingFirst = (position === 0 && turn === 0) || (position === 1 && turn === 1);

			const core = spawn(`${__dirname}/../../../../../core/build/Debug/bin/CoreIntegrator`, [
				this.context.room.startLp.toString(),
				this.context.room.startHand.toString(),
				this.context.room.drawCount.toString(),
				this.context.room.duelFlag.toString(),
				this.context.room.extraRules.toString(),
				Number(isTeam1GoingFirst).toString(),
				this.context.room.timeLimit.toString(),
				JSON.stringify(this.context.room.users[0].deck?.main ?? []),
				JSON.stringify(this.context.room.users[0].deck?.side ?? []),
				JSON.stringify(this.context.room.users[1].deck?.main ?? []),
				JSON.stringify(this.context.room.users[1].deck?.side ?? []),
			]);

			this.context.room.setDuel(core);

			core.stdout.on("data", (data: string) => {
				const message = data.toString().trim();
				// const regex = /CMD:[A-Z]+(\|[a-zA-Z0-9]+)*\b/g;
				const regex = /CMD:[A-Z]+(\|[\w]+)*\b/g;
				const commands = message.match(regex);

				if (!commands) {
					return;
				}

				commands.forEach((command) => {
					const commandParts = command.split("|");
					const cmd = commandParts[0];
					const params = commandParts.slice(1);

					if (cmd === "CMD:START") {
						const playerGameMessage = StartDuelClientMessage.create({
							lp: this.context.room.startLp,
							team: Number(isTeam1GoingFirst) ^ 0,
							playerMainDeckSize: Number(params[0]),
							playerExtraDeckSize: Number(params[1]),
							opponentMainDeckSize: Number(params[2]),
							opponentExtraDeckSize: Number(params[3]),
						});

						const opponentGameMessage = StartDuelClientMessage.create({
							lp: this.context.room.startLp,
							team: Number(isTeam1GoingFirst) ^ 1,
							playerMainDeckSize: Number(params[0]),
							playerExtraDeckSize: Number(params[1]),
							opponentMainDeckSize: Number(params[2]),
							opponentExtraDeckSize: Number(params[3]),
						});

						this.logger.debug(`sending to team 0: ${playerGameMessage.toString("hex")}`);
						this.logger.debug(`sending to team 1:  ${opponentGameMessage.toString("hex")}`);

						this.context.clients[0].socket.write(playerGameMessage);
						this.context.clients[1].socket.write(opponentGameMessage);
						core.stdin.write("CMD:DECKS\n");
					}

					if (cmd === "CMD:BUFFER") {
						const team = Number(params[0]);
						const location = Number(params[1]);
						const con = Number(params[2]);
						const bufferData = params.slice(3).map(Number);
						const buffer = Buffer.from(bufferData);
						const message = UpdateDataClientMessage.create({
							deckLocation: location,
							con,
							buffer,
						});

						this.context.clients.forEach((client) => {
							if (client.team === team) {
								this.logger.debug(`sending to team ${team}: ${message.toString("hex")}`);
								client.socket.write(message);
							}
						});
					}

					if (cmd === "CMD:CARD") {
						const team = Number(params[0]);
						const location = Number(params[1]);
						const con = Number(params[2]);
						const sequence = Number(params[3]);
						const bufferData = params.slice(4).map(Number);
						const buffer = Buffer.from(bufferData);
						const message = UpdateCardClientMessage.create({
							deckLocation: location,
							con,
							sequence,
							buffer,
						});

						this.context.clients.forEach((client) => {
							if (client.team === team) {
								this.logger.debug(`sending to team ${team}: ${message.toString("hex")}`);
								client.socket.write(message);
							}
						});
					}

					if (cmd === "CMD:DUEL") {
						core.stdin.write("CMD:PROCESS\n");
					}

					if (cmd === "CMD:MESSAGE") {
						const team = Number(params[0]);
						const data = Buffer.from(params.slice(1, params.length).map(Number));

						const message = RawClientMessage.create({ buffer: data });

						this.context.clients.forEach((client) => {
							if (client.team === team) {
								this.logger.debug(`sending to team ${team}: ${message.toString("hex")}`);
								client.socket.write(message);
							}
						});
					}

					if (cmd === "CMD:BROADCAST") {
						const data = Buffer.from(params.slice(0).map(Number));
						const message = BroadcastClientMessage.create({ buffer: data });
						this.context.clients.forEach((client) => {
							this.logger.debug(`sending to all: ${message.toString("hex")}`);
							client.socket.write(message);
						});
					}

					if (cmd === "CMD:EXCEPT") {
						const team = Number(params[0]);
						const data = Buffer.from(params.slice(1).map(Number));
						const message = BroadcastClientMessage.create({ buffer: data });
						this.context.clients.forEach((client) => {
							if (client.team !== team) {
								this.logger.debug(`sending to team ${team}: ${message.toString("hex")}`);
								client.socket.write(message);
							}
						});
					}

					if (cmd === "CMD:WAITING") {
						const nonWaitingPlayer = Number(params[0]);
						const message = WaitingClientMessage.create();
						this.context.clients.forEach((client) => {
							if (client.team !== nonWaitingPlayer) {
								client.socket.write(message);
							}
						});
					}

					if (cmd === "CMD:TIME") {
						const team = Number(params[0]);
						const timeLimit = Number(params[1]);
						const message = TimeLimitClientMessage.create({ team, timeLimit });
						this.context.clients.forEach((client) => {
							this.logger.debug(`sending to team ${team}: ${message.toString("hex")}`);
							client.socket.write(message);
						});
					}

					if (cmd === "CMD:FINISH") {
						const reason = Number(params[0]);
						const winner = Number(params[1]);
						const duelFinisher = new FinishDuelHandler({ reason, winner, room: this.context.room });
						duelFinisher.run();
					}

					if (cmd === "CMD:LOG") {
						this.logger.debug("Message from core");
						this.logger.debug(
							params
								.map((numStr) => parseInt(numStr, 10).toString(16).toUpperCase().padStart(2, "0"))
								.join(" ")
						);
					}
				});
			});
		}

		this.context.execute();
	}
}
