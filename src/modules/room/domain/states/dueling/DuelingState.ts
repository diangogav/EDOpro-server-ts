/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { spawn } from "child_process";
import EventEmitter from "events";

import { YGOClientSocket } from "../../../../../socket-server/HostServer";
import { decimalToBytesBuffer } from "../../../../../utils";
import { Client } from "../../../../client/domain/Client";
import { JoinGameMessage } from "../../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../messages/domain/Commands";
import { ClientMessage } from "../../../../messages/MessageProcessor";
import { DuelStartClientMessage } from "../../../../messages/server-to-client/DuelStartClientMessage";
import { BroadcastClientMessage } from "../../../../messages/server-to-client/game-messages/BroadcastClientMessage";
import { RawClientMessage } from "../../../../messages/server-to-client/game-messages/RawClientMessage";
import { StartDuelClientMessage } from "../../../../messages/server-to-client/game-messages/StartDuelClientMessage";
import { TimeLimitClientMessage } from "../../../../messages/server-to-client/game-messages/TimeLimitClientMessage";
import { UpdateCardClientMessage } from "../../../../messages/server-to-client/game-messages/UpdateCardClientMessage";
import { UpdateDataClientMessage } from "../../../../messages/server-to-client/game-messages/UpdateDataClientMessage";
import { WaitingClientMessage } from "../../../../messages/server-to-client/game-messages/WaitingClientMessage";
import { ServerMessageClientMessage } from "../../../../messages/server-to-client/ServerMessageClientMessage";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { FinishDuelHandler } from "../../../application/FinishDuelHandler";
import { JoinToDuelAsSpectator } from "../../../application/JoinToDuelAsSpectator";
import { Reconnect } from "../../../application/Reconnect";
import { DuelFinishReason } from "../../DuelFinishReason";
import { Room } from "../../Room";
import { RoomState } from "../../RoomState";

export class DuelingState extends RoomState {
	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly reconnect: Reconnect,
		private readonly joinToDuelAsSpectator: JoinToDuelAsSpectator,
		private readonly room: Room
	) {
		super(eventEmitter);

		this.handle();

		this.eventEmitter.on(
			"JOIN" as unknown as string,
			(message: ClientMessage, room: Room, socket: YGOClientSocket) =>
				this.handleJoin.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			Commands.SURRENDER as unknown as string,
			(message: ClientMessage, room: Room, socket: YGOClientSocket) =>
				this.handleSurrender.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			Commands.RESPONSE as unknown as string,
			(message: ClientMessage, _room: Room, client: Client) =>
				this.handleResponse.bind(this)(message, client)
		);

		this.eventEmitter.on(
			Commands.READY as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				this.handleReady.bind(this)(message, room, client)
		);
	}

	private handle(): void {
		this.room.prepareTurnOrder();
		const players = this.room.clients.map((item) => ({
			team: item.team,
			mainDeck: item.deck.main.map((card) => Number(card.code)),
			sideDeck: item.deck.side.map((card) => Number(card.code)),
			extraDeck: item.deck.extra.map((card) => Number(card.code)),
			turn: item.duelPosition,
		}));

		const core = spawn(
			`${__dirname}/../../../../../../core/CoreIntegrator`,
			[
				Number(!this.room.noShuffle).toString(),
				this.room.startLp.toString(),
				this.room.startHand.toString(),
				this.room.drawCount.toString(),
				this.room.duelFlag.toString(),
				this.room.extraRules.toString(),
				this.room.firstToPlay.toString(),
				this.room.timeLimit.toString(),
				JSON.stringify(players),
			],
			{
				cwd: process.cwd(),
			}
		);

		this.room.setDuel(core);

		core.stdout.on("data", (data: string) => {
			const message = data.toString().trim();
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
					this.handleCoreStart(params);
				}

				if (cmd === "CMD:BUFFER") {
					this.handleCoreBuffer(params);
				}

				if (cmd === "CMD:CARD") {
					this.handleCoreCard(params);
				}

				if (cmd === "CMD:DUEL") {
					this.room.sendMessageToCpp("CMD:PROCESS\n");
				}

				if (cmd === "CMD:MESSAGE") {
					this.handleCoreMessage(params);
				}

				if (cmd === "CMD:BROADCAST") {
					this.handleCoreBroadcast(params);
				}

				if (cmd === "CMD:EXCEPT") {
					this.handleCoreExcept(params);
				}

				if (cmd === "CMD:WAITING") {
					this.handleCoreWaiting(params);
				}

				if (cmd === "CMD:TIME") {
					this.handleCoreTime(params);
				}

				if (cmd === "CMD:FINISH") {
					this.handleCoreFinish(params);
				}

				if (cmd === "CMD:CREATED") {
					this.handleCoreCreated(params);
				}

				if (cmd === "CMD:TURN") {
					this.handleCoreTurn(params);
				}

				if (cmd === "CMD:FIELD") {
					this.handleCoreField(params);
				}

				if (cmd === "CMD:REFRESH") {
					this.handleCoreRefresh(params);
				}

				if (cmd === "CMD:RECONNECT") {
					this.handleCoreReconnect(params);
				}

				if (cmd === "CMD:SWAP") {
					this.handleCoreSwap(params);
				}

				if (cmd === "CMD:REPLAY") {
					this.handleCoreReplay(params);
				}
			});
		});
	}

	private handleCoreReplay(params: string[]) {
		const messageType = params[0];

		if (messageType === "data") {
			const con = Number(params[1]);
			const location = Number(params[2]);
			const bufferData = params.slice(3).map(Number);
			const buffer = Buffer.from(bufferData);
			const message = UpdateDataClientMessage.create({
				deckLocation: location,
				con,
				buffer,
			});
			this.room.replay.addMessage(message);

			return;
		}

		if (messageType === "card") {
			const con = Number(params[1]);
			const location = Number(params[2]);
			const sequence = Number(params[3]);
			const bufferData = params.slice(4).map(Number);
			const buffer = Buffer.from(bufferData);
			const message = UpdateCardClientMessage.create({
				deckLocation: location,
				con,
				sequence,
				buffer,
			});
			this.room.replay.addMessage(message);

			return;
		}

		if (messageType === "message") {
			const data = Buffer.from(params.slice(1, params.length).map(Number));
			const message = RawClientMessage.create({ buffer: data });
			this.room.replay.addMessage(message);

			return;
		}
	}

	private handleCoreSwap(params: string[]) {
		this.room.clients.forEach((client) => {
			client.sendMessage(ServerMessageClientMessage.create("SWAP"));
		});
		const team = Number(params[0]);
		this.room.nextTurn(team);
	}

	private handleCoreReconnect(params: string[]) {
		const _team = Number(params[0]);
		const position = Number(params[1]);

		const player = this.room.clients.find((player) => player.position === position);

		if (!player) {
			return;
		}
		if (!player.cache) {
			return;
		}
		player.sendMessage(player.cache);
		player.clearReconnecting();

		this.room.clients.forEach((client) => {
			client.sendMessage(ServerMessageClientMessage.create(`${player.name} ha ingresado al duelo`));
		});

		this.room.spectators.forEach((spectator) => {
			spectator.sendMessage(
				ServerMessageClientMessage.create(`${player.name} ha ingresado al duelo`)
			);
		});
	}

	private handleCoreRefresh(params: string[]) {
		if (params.length === 0) {
			return;
		}
		// const reconnectingTeam = Number(params[0]);
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

		[...this.room.clients, ...this.room.spectators].forEach((client) => {
			if (client.team === team) {
				client.sendMessage(message);
			}
		});
	}

	private handleCoreField(params: string[]) {
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
		const player = this.room.clients.find((player) => player.position === position);
		if (!player) {
			return;
		}
		player.sendMessage(message);
		this.room.sendMessageToCpp(`CMD:REFRESH|${player.team}|${position}\n`);
	}

	private handleCoreTurn(_params: string[]) {
		this.room.increaseTurn();
		this.room.resetTimer(0, this.room.timeLimit * 1000);
		this.room.resetTimer(1, this.room.timeLimit * 1000);
	}

	private handleCoreCreated(params: string[]) {
		this.room.replay.setSeed(params);
	}

	private handleCoreFinish(params: string[]) {
		const reason = Number(params[0]) as DuelFinishReason;
		const winner = Number(params[1]);
		const duelFinisher = new FinishDuelHandler({
			reason,
			winner,
			room: this.room,
		});
		void duelFinisher.run();
	}

	private handleCoreTime(params: string[]) {
		const team = Number(params[0]);
		const timeLimit = Number(params[1]);
		const message = TimeLimitClientMessage.create({
			team: this.room.calculateTimeReceiver(team),
			timeLimit,
		});

		this.room.resetTimer(team, timeLimit);

		this.room.clients.forEach((client) => {
			this.room.cacheTeamMessage(client.team, message);
			client.sendMessage(message);
		});

		this.room.spectators.forEach((client) => {
			client.sendMessage(message);
		});
	}

	private handleCoreWaiting(params: string[]) {
		const nonWaitingPlayerTeam = Number(params[0]);
		const message = WaitingClientMessage.create();
		this.room.clients.forEach((client) => {
			if (client.team !== nonWaitingPlayerTeam) {
				client.sendMessage(message);
			}
		});
	}

	private handleCoreExcept(params: string[]) {
		const team = Number(params[0]);
		const data = Buffer.from(params.slice(1).map(Number));
		const message = BroadcastClientMessage.create({ buffer: data });
		this.room.clients.forEach((client) => {
			if (client.team !== team) {
				client.sendMessage(message);
			}
		});
	}

	private handleCoreBroadcast(params: string[]) {
		const data = Buffer.from(params.slice(0).map(Number));
		const message = BroadcastClientMessage.create({ buffer: data });
		// this.room.cacheMessage(0, message);
		// this.room.cacheMessage(1, message);
		this.room.cacheTeamMessage(3, message);
		this.room.clients.forEach((client) => {
			client.sendMessage(message);
		});

		this.room.spectators.forEach((spectator) => {
			spectator.sendMessage(message);
		});
	}

	private handleCoreMessage(params: string[]) {
		const forAllTeam = Boolean(Number(params[0]));
		const cache = Number(params[1]);
		const team = Number(params[2]);
		const data = Buffer.from(params.slice(3, params.length).map(Number));

		const message = RawClientMessage.create({ buffer: data });

		if (!forAllTeam) {
			const player = this.room.clients.find((player) => player.inTurn && player.team === team);

			if (cache) {
				player?.setLastMessage(message);
			}

			player?.sendMessage(message);

			return;
		}

		if (cache) {
			this.room.cacheTeamMessage(team, message);
		}

		this.room.clients.forEach((client) => {
			if (client.team === team) {
				client.sendMessage(message);
			}
		});

		this.room.spectators.forEach((spectator) => {
			if (spectator.team === team) {
				spectator.sendMessage(message);
			}
		});
	}

	private handleCoreCard(params: string[]) {
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
			this.room.cacheTeamMessage(team, message);
		}

		[...this.room.clients, ...this.room.spectators].forEach((client) => {
			if (client.team === team) {
				client.sendMessage(message);
			}
		});

		this.room.spectators.forEach((spectator) => {
			if (spectator.team === team) {
				spectator.sendMessage(message);
			}
		});
	}

	private handleCoreBuffer(params: string[]): void {
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
			this.room.cacheTeamMessage(team, message);
		}

		[...this.room.clients, ...this.room.spectators].forEach((client) => {
			if (client.team === team) {
				client.sendMessage(message);
			}
		});
	}

	private handleCoreStart(params: string[]): void {
		const playerGameMessage = StartDuelClientMessage.create({
			lp: this.room.startLp,
			team: this.room.firstToPlay ^ 0,
			playerMainDeckSize: Number(params[0]),
			playerExtraDeckSize: Number(params[1]),
			opponentMainDeckSize: Number(params[2]),
			opponentExtraDeckSize: Number(params[3]),
		});

		const opponentGameMessage = StartDuelClientMessage.create({
			lp: this.room.startLp,
			team: this.room.firstToPlay ^ 1,
			playerMainDeckSize: Number(params[0]),
			playerExtraDeckSize: Number(params[1]),
			opponentMainDeckSize: Number(params[2]),
			opponentExtraDeckSize: Number(params[3]),
		});

		const spectatorGameMessage = StartDuelClientMessage.create({
			lp: this.room.startLp,
			team: 0xf0 | this.room.firstToPlay,
			playerMainDeckSize: Number(params[0]),
			playerExtraDeckSize: Number(params[1]),
			opponentMainDeckSize: Number(params[2]),
			opponentExtraDeckSize: Number(params[3]),
		});

		this.room.replay.addMessage(playerGameMessage);
		this.room.setPlayerDecksSize(Number(params[0]), Number(params[1]));
		this.room.setPlayerDecksSize(Number(params[2]), Number(params[3]));

		this.room.clients.forEach((client) => {
			if (client.team === 0) {
				client.sendMessage(playerGameMessage);
			}
		});

		this.room.clients.forEach((client) => {
			if (client.team === 1) {
				client.sendMessage(opponentGameMessage);
			}
		});

		this.room.clearSpectatorCache();
		this.room.cacheTeamMessage(3, spectatorGameMessage);
		this.room.spectators.forEach((spectator) => {
			spectator.sendMessage(spectatorGameMessage);
		});
		this.room.sendMessageToCpp("CMD:DECKS\n");
	}

	private handleReady(message: ClientMessage, room: Room, player: Client): void {
		this.logger.info("DUELING: READY");
		if (!player.isReconnecting) {
			return;
		}

		player.sendMessage(DuelStartClientMessage.create());
		player.sendMessage(
			StartDuelClientMessage.create({
				lp: room.startLp,
				team: room.firstToPlay === player.team ? 0 : 1,
				playerMainDeckSize: room.playerMainDeckSize,
				playerExtraDeckSize: room.playerExtraDeckSize,
				opponentMainDeckSize: room.opponentMainDeckSize,
				opponentExtraDeckSize: room.opponentExtraDeckSize,
			})
		);

		room.sendMessageToCpp(`CMD:FIELD|${player.position}\n`);
	}

	private async handleJoin(
		message: ClientMessage,
		room: Room,
		socket: YGOClientSocket
	): Promise<void> {
		this.logger.info("JOIN IN DUELING");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const joinMessage = new JoinGameMessage(message.data);
		const reconnectingPlayer = this.playerAlreadyInRoom(playerInfoMessage, room, socket);

		if (!reconnectingPlayer) {
			this.joinToDuelAsSpectator.run(joinMessage, playerInfoMessage, socket, room);

			return;
		}

		await this.reconnect.run(playerInfoMessage, reconnectingPlayer, joinMessage, socket, room);
	}

	private handleSurrender(_message: ClientMessage, client: Client): void {
		const finishDuelHandler = new FinishDuelHandler({
			reason: DuelFinishReason.SURRENDERED,
			winner: Number(!client.team),
			room: this.room,
		});

		void finishDuelHandler.run();
	}

	private handleResponse(message: ClientMessage, client: Client): void {
		const data = message.data
			.toString("hex")
			.match(/.{1,2}/g)
			?.join("|");

		if (!data) {
			return;
		}

		this.room.replay.addResponse(data);
		this.room.stopTimer(client.team);
		this.room.sendMessageToCpp(`CMD:RESPONSE|${client.team}|${data}\n`);
	}
}
