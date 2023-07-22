import { spawn } from "child_process";

import { decimalToBytesBuffer } from "../../../../utils";
import { CardSQLiteTYpeORMRepository } from "../../../card/infrastructure/postgres/CardSQLiteTYpeORMRepository";
import { Client } from "../../../client/domain/Client";
import { DeckCreator } from "../../../deck/application/DeckCreator";
import { DuelFinishReason } from "../../../room/domain/DuelFinishReason";
import { Room } from "../../../room/domain/Room";
import { Commands } from "../../domain/Commands";
import { BroadcastClientMessage } from "../../server-to-client/game-messages/BroadcastClientMessage";
import { RawClientMessage } from "../../server-to-client/game-messages/RawClientMessage";
import { StartDuelClientMessage } from "../../server-to-client/game-messages/StartDuelClientMessage";
import { TimeLimitClientMessage } from "../../server-to-client/game-messages/TimeLimitClientMessage";
import { UpdateCardClientMessage } from "../../server-to-client/game-messages/UpdateCardClientMessage";
import { UpdateDataClientMessage } from "../../server-to-client/game-messages/UpdateDataClientMessage";
import { WaitingClientMessage } from "../../server-to-client/game-messages/WaitingClientMessage";
import { ServerMessageClientMessage } from "../../server-to-client/ServerMessageClientMessage";
import { FinishDuelHandler } from "../FinishDuelHandler";
import { ClientMessage } from "../MessageHandler/MessageProcessor";
import { RoomMessageHandlerContext } from "./RoomMessageHandlerContext";
import { ChangeToDuel } from "./Strategies/ChangeToDuel";
import { ChangeToObserver } from "./Strategies/ChangeToObserver";
import { Kick } from "./Strategies/kick";
import { NotReadyCommandStrategy } from "./Strategies/NotReadyCommandStrategy";
import { ReadyCommandStrategy } from "./Strategies/ReadyCommandStrategy";
import { RpsChoiceCommandStrategy } from "./Strategies/RpsChoiceCommandStrategy";
import { TryStartCommandStrategy } from "./Strategies/TryStartCommandStrategy";
import { UpdateDeckCommandStrategy } from "./Strategies/UpdateDeckCommandStrategy";

export class RoomMessageHandler {
	private readonly context: RoomMessageHandlerContext;
	private readonly message: ClientMessage;

	constructor(data: ClientMessage, client: Client, clients: Client[], room: Room) {
		this.context = new RoomMessageHandlerContext(data, client, clients, room);
		this.message = data;
	}

	read(): void {
		if (this.message.command === Commands.UPDATE_DECK) {
			this.context.setStrategy(
				new UpdateDeckCommandStrategy(
					this.context,
					new DeckCreator(new CardSQLiteTYpeORMRepository(), this.context.room.deckRules)
				)
			);
		}

		if (this.message.command === Commands.READY) {
			this.context.setStrategy(new ReadyCommandStrategy(this.context));
		}

		if (this.message.command === Commands.NOT_READY) {
			this.context.setStrategy(new NotReadyCommandStrategy(this.context));
		}

		if (this.message.command === Commands.TRY_START) {
			this.context.setStrategy(new TryStartCommandStrategy(this.context));
		}

		if (this.message.command === Commands.OBSERVER) {
			this.context.setStrategy(new ChangeToObserver(this.context));
		}
		if (this.message.command === Commands.TODUEL) {
			this.context.setStrategy(new ChangeToDuel(this.context));
		}

		if (this.message.command === Commands.KICK) {
			this.context.setStrategy(new Kick(this.context));
		}

		if (this.message.command === Commands.RPS_CHOICE) {
			this.context.setStrategy(new RpsChoiceCommandStrategy(this.context));
		}

		if (this.message.command === Commands.TURN_CHOICE) {
			const turn = this.context.readBody().readInt8();
			const position = this.context.room.clients.find(
				(client) => client === this.context.client
			)?.position;

			const isTeam1GoingFirst = (position === 0 && turn === 0) || (position === 1 && turn === 1);

			if (isTeam1GoingFirst) {
				this.context.room.setFirstToPlay(1);
			} else {
				this.context.room.setFirstToPlay(0);
			}

			this.context.room.prepareTurnOrder();
			const players = this.context.clients.map((item) => ({
				team: item.team,
				mainDeck: item.deck.main.map((card) => Number(card.code)),
				sideDeck: item.deck.side.map((card) => Number(card.code)),
				extraDeck: item.deck.extra.map((card) => Number(card.code)),
				turn: item.duelPosition,
			}));

			const core = spawn(
				`${__dirname}/../../../../../core/CoreIntegrator`,
				[
					Number(!this.context.room.noShuffle).toString(),
					this.context.room.startLp.toString(),
					this.context.room.startHand.toString(),
					this.context.room.drawCount.toString(),
					this.context.room.duelFlag.toString(),
					this.context.room.extraRules.toString(),
					Number(isTeam1GoingFirst).toString(),
					this.context.room.timeLimit.toString(),
					JSON.stringify(players),
				],
				{
					cwd: process.cwd(),
				}
			);

			this.context.room.setDuel(core);
			this.context.room.dueling();

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
						this.context.room.startRoomTimer();
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

						this.context.room.setPlayerDecksSize(Number(params[0]), Number(params[1]));
						this.context.room.setPlayerDecksSize(Number(params[2]), Number(params[3]));

						this.context.clients.forEach((client) => {
							if (client.team === 0) {
								client.sendMessage(playerGameMessage);
							}
						});

						this.context.clients.forEach((client) => {
							if (client.team === 1) {
								client.sendMessage(opponentGameMessage);
							}
						});

						this.context.room.clearSpectatorCache();
						this.context.room.cacheTeamMessage(3, opponentGameMessage);
						this.context.room.spectators.forEach((spectator) => {
							spectator.sendMessage(opponentGameMessage);
						});
						core.stdin.write("CMD:DECKS\n");
					}

					if (cmd === "CMD:BUFFER") {
						const cache = Number(params[0]);
						const team = Number(params[1]);
						const location = Number(params[2]);
						const con = Number(params[3]);
						const bufferData = params.slice(4).map(Number);
						const buffer = Buffer.from(bufferData);
						const message = UpdateDataClientMessage.create({
							deckLocation: location,
							con,
							buffer,
						});

						if (cache) {
							this.context.room.cacheTeamMessage(team, message);
						}

						[...this.context.clients, ...this.context.room.spectators].forEach((client) => {
							if (client.team === team) {
								client.sendMessage(message);
							}
						});
					}

					if (cmd === "CMD:CARD") {
						const cache = Number(params[0]);
						const team = Number(params[1]);
						const location = Number(params[2]);
						const con = Number(params[3]);
						const sequence = Number(params[4]);
						const bufferData = params.slice(5).map(Number);
						const buffer = Buffer.from(bufferData);
						const message = UpdateCardClientMessage.create({
							deckLocation: location,
							con,
							sequence,
							buffer,
						});

						if (cache) {
							this.context.room.cacheTeamMessage(team, message);
						}

						[...this.context.clients, ...this.context.room.spectators].forEach((client) => {
							if (client.team === team) {
								client.sendMessage(message);
							}
						});

						this.context.room.spectators.forEach((spectator) => {
							if (spectator.team === team) {
								spectator.sendMessage(message);
							}
						});
					}

					if (cmd === "CMD:DUEL") {
						core.stdin.write("CMD:PROCESS\n");
					}

					if (cmd === "CMD:MESSAGE") {
						const forAllTeam = Boolean(Number(params[0]));
						const cache = Number(params[1]);
						const team = Number(params[2]);
						const data = Buffer.from(params.slice(3, params.length).map(Number));

						const message = RawClientMessage.create({ buffer: data });

						if (!forAllTeam) {
							const player = this.context.clients.find(
								(player) => player.inTurn && player.team === team
							);

							if (cache) {
								player?.setLastMessage(message);
							}

							player?.sendMessage(message);

							return;
						}

						if (cache) {
							this.context.room.cacheTeamMessage(team, message);
						}

						this.context.clients.forEach((client) => {
							if (client.team === team) {
								client.sendMessage(message);
							}
						});

						this.context.room.spectators.forEach((spectator) => {
							if (spectator.team === team) {
								spectator.sendMessage(message);
							}
						});
					}

					if (cmd === "CMD:BROADCAST") {
						const data = Buffer.from(params.slice(0).map(Number));
						const message = BroadcastClientMessage.create({ buffer: data });
						// this.context.room.cacheMessage(0, message);
						// this.context.room.cacheMessage(1, message);
						this.context.room.cacheTeamMessage(3, message);
						this.context.clients.forEach((client) => {
							client.sendMessage(message);
						});

						this.context.room.spectators.forEach((spectator) => {
							spectator.sendMessage(message);
						});
					}

					if (cmd === "CMD:EXCEPT") {
						const team = Number(params[0]);
						const data = Buffer.from(params.slice(1).map(Number));
						const message = BroadcastClientMessage.create({ buffer: data });
						this.context.clients.forEach((client) => {
							if (client.team !== team) {
								client.sendMessage(message);
							}
						});
					}

					if (cmd === "CMD:WAITING") {
						const nonWaitingPlayerTeam = Number(params[0]);
						const message = WaitingClientMessage.create();
						this.context.clients.forEach((client) => {
							if (client.team !== nonWaitingPlayerTeam) {
								client.sendMessage(message);
							}
						});
					}

					if (cmd === "CMD:TIME") {
						const team = Number(params[0]);
						const timeLimit = Number(params[1]);
						const message = TimeLimitClientMessage.create({
							team: this.context.room.calculateTimeReceiver(team),
							timeLimit,
						});

						this.context.room.resetTimer(team, timeLimit);

						this.context.clients.forEach((client) => {
							this.context.room.cacheTeamMessage(client.team, message);
							client.sendMessage(message);
						});

						this.context.room.spectators.forEach((client) => {
							client.sendMessage(message);
						});
					}

					if (cmd === "CMD:FINISH") {
						const reason = Number(params[0]) as DuelFinishReason;
						const winner = Number(params[1]);
						const duelFinisher = new FinishDuelHandler({
							reason,
							winner,
							room: this.context.room,
						});
						duelFinisher.run();
					}

					if (cmd === "CMD:LOG") {
						// console.log("Message from core");
						// console.log(
						// 	params
						// 		.map((numStr) => parseInt(numStr, 10).toString(16).toUpperCase().padStart(2, "0"))
						// 		.join(" ")
						// );
					}

					if (cmd === "CMD:TURN") {
						this.context.room.increaseTurn();
						this.context.room.resetTimer(0, this.context.room.timeLimit * 1000);
						this.context.room.resetTimer(1, this.context.room.timeLimit * 1000);
						this.context.room.resetRoomTimer();
					}

					if (cmd === "CMD:FIELD") {
						if (params.length === 1) {
							return;
						}
						const position = Number(params[0]);
						const buffer = Buffer.from(params.slice(1).map(Number));
						const header = Buffer.from([0x01]);
						const type = Buffer.from([0xa2]);
						const data = Buffer.concat([type, buffer]);
						const size = decimalToBytesBuffer(1 + data.length, 2);
						const message = Buffer.concat([size, header, data]);
						const player = this.context.clients.find((player) => player.position === position);
						if (!player) {
							return;
						}
						player.sendMessage(message);
						core.stdin.write(`CMD:REFRESH|${player.team}|${position}\n`);
					}

					if (cmd === "CMD:REFRESH") {
						if (params.length === 0) {
							return;
						}
						const reconnectingTeam = Number(params[0]);
						const team = Number(params[1]);
						const location = Number(params[2]);
						const con = Number(params[3]);
						const bufferData = params.slice(4).map(Number);
						const buffer = Buffer.from(bufferData);
						const message = UpdateDataClientMessage.create({
							deckLocation: location,
							con,
							buffer,
						});

						if (team !== reconnectingTeam) {
							return;
						}

						this.context.clients.forEach((client) => {
							if (client.team === team) {
								client.sendMessage(message);
							}
						});
					}

					if (cmd === "CMD:RECONNECT") {
						const _team = Number(params[0]);
						const position = Number(params[1]);

						const player = this.context.clients.find((player) => player.position === position);

						if (!player) {
							return;
						}
						if (!player.cache) {
							return;
						}
						player.sendMessage(player.cache);
						player.clearReconnecting();

						this.context.room.clients.forEach((client) => {
							client.sendMessage(
								ServerMessageClientMessage.create(`${player.name} ha ingresado al duelo`)
							);
						});

						this.context.room.spectators.forEach((spectator) => {
							spectator.sendMessage(
								ServerMessageClientMessage.create(`${player.name} ha ingresado al duelo`)
							);
						});
					}

					if (cmd === "CMD:SWAP") {
						this.context.room.clients.forEach((client) => {
							client.sendMessage(ServerMessageClientMessage.create("SWAP"));
						});
						const team = Number(params[0]);
						this.context.room.nextTurn(team);
					}
				});
			});
		}

		this.context.execute();
	}
}
