/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { spawn } from "child_process";
import * as crypto from "crypto";
import EventEmitter from "events";
import { CoreMessages } from "src/edopro/messages/domain/CoreMessages";
import { DuelStartClientMessage } from "src/shared/messages/server-to-client/DuelStartClientMessage";
import { Team } from "src/shared/room/Team";

import { Logger } from "../../../../../shared/logger/domain/Logger";
import { ISocket } from "../../../../../shared/socket/domain/ISocket";
import { decimalToBytesBuffer } from "../../../../../utils";
import { Client } from "../../../../client/domain/Client";
import { UpdateDeckMessageSizeCalculator } from "../../../../deck/application/UpdateDeckMessageSizeCalculator";
import { JoinGameMessage } from "../../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../messages/domain/Commands";
import { JSONMessageProcessor } from "../../../../messages/JSONMessageProcessor";
import { ClientMessage } from "../../../../messages/MessageProcessor";
import { ErrorMessages } from "../../../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../../messages/server-to-client/ErrorClientMessage";
import { StartDuelClientMessage } from "../../../../messages/server-to-client/game-messages/StartDuelClientMessage";
import { TimeLimitClientMessage } from "../../../../messages/server-to-client/game-messages/TimeLimitClientMessage";
import { PlayerChangeClientMessage } from "../../../../messages/server-to-client/PlayerChangeClientMessage";
import { ServerErrorClientMessage } from "../../../../messages/server-to-client/ServerErrorMessageClientMessage";
import { ServerMessageClientMessage } from "../../../../messages/server-to-client/ServerMessageClientMessage";
import { FinishDuelHandler } from "../../../application/FinishDuelHandler";
import { JoinToDuelAsSpectator } from "../../../application/JoinToDuelAsSpectator";
import { Reconnect } from "../../../application/Reconnect";
import { DuelFinishReason } from "../../DuelFinishReason";
import { Room } from "../../Room";
import { RoomState } from "../../RoomState";

interface Message {
	type: string;
}

type CoreMessage = {
	data: string;
	receiver: number;
	all: boolean;
	except?: number;
	cacheable: boolean;
};

type RawCoreMessage = {
	message: number;
	data: string;
	cacheable: boolean;
};

type TimeMessage = {
	team: number;
	time: number;
	cacheable: boolean;
};

type FieldMessage = {
	data: string;
	position: number;
	cacheable: boolean;
};

type ReconnectMessage = {
	position: number;
	team: number;
	cacheable: boolean;
};

type StartDuelMessage = {
	lp: number;
	playerDeckSize: number;
	playerExtraDeckSize: number;
	opponentDeckSize: number;
	opponentExtraDeckSize: number;
	header: number;
	type: number;
	cacheable: boolean;
};

type ReplayMessage = {
	data: string;
};

type FinishMessage = {
	reason: number;
	winner: number;
};

type SwapMessage = {
	team: number;
};
export class DuelingState extends RoomState {
	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly reconnect: Reconnect,
		private readonly joinToDuelAsSpectator: JoinToDuelAsSpectator,
		private readonly room: Room,
		private readonly jsonMessageProcessor: JSONMessageProcessor
	) {
		super(eventEmitter);

		this.handle();

		this.eventEmitter.on(
			"JOIN" as unknown as string,
			(message: ClientMessage, room: Room, socket: ISocket) =>
				this.handleJoin.bind(this)(message, room, socket)
		);

		this.eventEmitter.on(
			Commands.SURRENDER as unknown as string,
			(message: ClientMessage, _room: Room, client: Client) =>
				this.handleSurrender.bind(this)(message, client)
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

		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				this.handleUpdateDeck.bind(this)(message, room, client)
		);
	}

	private handleUpdateDeck(message: ClientMessage, room: Room, client: Client): void {
		this.logger.debug("DUELING: UPDATE_DECK");

		const messageSize = new UpdateDeckMessageSizeCalculator(message.data).calculate();
		const body = message.data.subarray(0, messageSize);
		const mainAndExtraDeckSize = body.readUInt32LE(0);
		const sizeDeckSize = body.readUint32LE(4);
		const mainDeck: number[] = [];
		for (let i = 8; i < mainAndExtraDeckSize * 4 + 8; i += 4) {
			const code = body.readUint32LE(i);
			mainDeck.push(code);
		}

		const sideDeck: number[] = [];
		for (
			let i = mainAndExtraDeckSize * 4 + 8;
			i < (mainAndExtraDeckSize + sizeDeckSize) * 4 + 8;
			i += 4
		) {
			const code = body.readUint32LE(i);
			sideDeck.push(code);
		}

		const completeIncomingDeck = [...mainDeck, ...sideDeck];
		const completeCurrentDeck = [
			...client.deck.main,
			...client.deck.side,
			...client.deck.extra,
		].map((item) => Number(item.code));

		if (completeCurrentDeck.length !== completeIncomingDeck.length) {
			client.socket.send(
				ServerErrorClientMessage.create(
					"Por favor selecciona el mismo deck de la partida en curso para poder reconectar"
				)
			);
			const message = ErrorClientMessage.create(ErrorMessages.DECK_ERROR);
			client.socket.send(message);

			const status = (client.position << 4) | 0x0a;
			const playerChangeMessage = PlayerChangeClientMessage.create({ status });

			client.socket.send(playerChangeMessage);
			client.setCanReconnect(false);

			return;
		}

		if (!completeIncomingDeck.every((item) => completeCurrentDeck.includes(item))) {
			client.socket.send(
				ServerErrorClientMessage.create(
					"Por favor selecciona el mismo deck de la partida en curso para poder reconectar"
				)
			);

			const message = ErrorClientMessage.create(ErrorMessages.DECK_ERROR);
			client.socket.send(message);

			const status = (client.position << 4) | 0x0a;
			const playerChangeMessage = PlayerChangeClientMessage.create({ status });
			client.socket.send(playerChangeMessage);
			client.setCanReconnect(false);

			return;
		}

		client.setCanReconnect(true);
	}

	private handle(): void {
		this.room.clients.forEach((item) => {
			item.socket.send(ServerMessageClientMessage.create("Preparando el duelo"));
		});
		this.room.prepareTurnOrder();

		const players = this.room.clients.map((item: Client) => ({
			team: item.team,
			mainDeck: item.deck.main.map((card) => Number(card.code)),
			sideDeck: item.deck.side.map((card) => Number(card.code)),
			extraDeck: item.deck.extra.map((card) => Number(card.code)),
			turn: item.duelPosition,
		}));

		const seeds = this.generateSeeds();
		this.room.replay.setSeed(seeds);
		this.logger.debug(`GAME: ${this.room.playerNames(0)} VS ${this.room.playerNames(1)}`);

		this.room.clients.forEach((item) => {
			item.socket.send(ServerMessageClientMessage.create("Iniciando duelo"));
		});

		const core = spawn(
			`./core/CoreIntegrator`,
			[
				JSON.stringify({
					config: {
						startLp: this.room.startLp.toString(),
						seeds: seeds.map((seed) => Number(seed)),
						flags: Number(this.room.duelFlag),
						lp: this.room.startLp,
						startingDrawCount: this.room.startHand,
						drawCountPerTurn: this.room.drawCount,
						firstToPlay: this.room.firstToPlay,
						timeLimit: this.room.timeLimit,
					},
					players,
				}),
			],
			{
				cwd: process.cwd(),
			}
		);

		this.room.setDuel(core);

		core.stderr.on("data", (data: string) => {
			this.logger.error(data.toString());
			this.room.clients.forEach((item) => {
				item.socket.send(ServerMessageClientMessage.create(data.toString()));
			});
		});

		core.on("exit", (code, signal) => {
			this.logger.info(
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				`Core closed for room ${this.room.id} with code: ${code} and signal: ${signal} `
			);
		});

		core.on("close", (code, signal) => {
			this.logger.info(
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				`Core closed for room ${this.room.id} with code: ${code} and signal: ${signal} `
			);
		});

		core.on("error", (error) => {
			this.logger.info(`Core error in room ${this.room.id}`);
			this.logger.error(error.toString());
		});

		core.stdout.on("data", (data: Buffer) => {
			try {
				this.jsonMessageProcessor.read(data);
				this.processMessage();
			} catch (error) {
				const payload = this.jsonMessageProcessor.payload;
				this.logger.error(error as Error);
				this.logger.info(`data: ${data.toString("hex")}`);
				this.logger.info(`data: ${data.toString()}`);
				this.logger.info(`payload:data ${payload.data}`);
				this.logger.info(`payload:size ${payload.size}`);
				this.logger.info(
					`payload:buffer ${this.jsonMessageProcessor.currentBuffer.toString("hex")}`
				);
				this.logger.info(`payload:buffer ${this.jsonMessageProcessor.currentBuffer.toString()}`);
				this.logger.info(`score: ${this.room.score}`);
			}
		});

		const banList = BanListMemoryRepository.findByHash(this.room.banListHash);
		this.room.createDuel(banList?.name ?? null);
		this.notifyDuelStart(this.room);
	}

	private processMessage(): void {
		if (!this.jsonMessageProcessor.isMessageReady()) {
			return;
		}

		this.jsonMessageProcessor.process();
		const payload = this.jsonMessageProcessor.payload;
		const message = JSON.parse(payload.data) as Message;

		if (message.type === "START") {
			this.handleCoreStart(message as unknown as StartDuelMessage);
		}

		if (message.type === "TIME") {
			this.handleCoreTime(message as unknown as TimeMessage);
		}

		if (message.type === "FIELD") {
			this.handleCoreField(message as unknown as FieldMessage);
		}

		if (message.type === "RECONNECT") {
			this.handleCoreReconnect(message as unknown as ReconnectMessage);
		}

		if (message.type === "MESSAGE") {
			this.handleCoreMessage(message as unknown as CoreMessage);
		}

		if (message.type === "MESSAGE_ALL") {
			this.handleCoreMessageAll(message as unknown as CoreMessage);
		}

		if (message.type === "MESSAGE_ALL_EXCEPT") {
			this.handleCoreMessageAllExcept(message as unknown as CoreMessage);
		}

		if (message.type === "CORE") {
			const _coreMessage = message as unknown as RawCoreMessage;

			if (_coreMessage.message === CoreMessages.MSG_NEW_PHASE) {
				this.room.setLastPhaseMessage(Buffer.from(_coreMessage.data, "hex"));
			}

			this.processDuelMessage(
				_coreMessage.message,
				Buffer.from(_coreMessage.data, "hex"),
				this.room
			);
		}

		if (message.type === "REPLAY") {
			this.handleCoreReplay(message as unknown as ReplayMessage);
		}

		if (message.type === "FINISH") {
			this.handleCoreFinish(message as unknown as FinishMessage);
		}

		if (message.type === "SWAP") {
			this.handleCoreSwap(message as unknown as SwapMessage);
		}

		this.processMessage();
	}

	private handleCoreReplay(message: ReplayMessage) {
		const data = Buffer.from(message.data, "hex");
		const payload = Buffer.concat([decimalToBytesBuffer(data.length, 2), data]);
		this.room.replay.addMessage(payload.subarray(3));
	}

	private handleCoreSwap(message: SwapMessage) {
		this.room.nextTurn(message.team);
	}

	private handleCoreReconnect(message: ReconnectMessage) {
		const _team = message.team;
		const position = message.position;

		const player = this.room.clients.find((player) => player.position === position);

		if (!(player instanceof Client)) {
			return;
		}

		if (!player.cache) {
			return;
		}

		player.sendMessage(player.cache);
		const opponentTimeMessage = TimeLimitClientMessage.create({
			team: this.room.calculateTimeReceiver(Team.OPPONENT),
			timeLimit: this.room.getTime(Team.OPPONENT),
		});
		player.sendMessage(opponentTimeMessage);
		const playerTimeMessage = TimeLimitClientMessage.create({
			team: this.room.calculateTimeReceiver(Team.PLAYER),
			timeLimit: this.room.getTime(Team.PLAYER),
		});
		player.sendMessage(playerTimeMessage);

		player.clearReconnecting();

		this.room.clients.forEach((client: Client) => {
			client.sendMessage(ServerMessageClientMessage.create(`${player.name} ha ingresado al duelo`));
		});

		this.room.spectators.forEach((spectator: Client) => {
			spectator.sendMessage(
				ServerMessageClientMessage.create(`${player.name} ha ingresado al duelo`)
			);
		});
	}

	private handleCoreField(message: FieldMessage) {
		const data = Buffer.from(message.data, "hex");
		const payload = Buffer.concat([decimalToBytesBuffer(data.length, 2), data]);

		const player = this.room.clients.find((player) => player.position === message.position);

		if (!(player instanceof Client)) {
			return;
		}

		player.sendMessage(payload);
		this.room.sendMessageToCpp(
			JSON.stringify({
				command: "REFRESH_FIELD",
				data: {
					position: player.position,
					team: player.team,
				},
			})
		);
	}

	private handleCoreFinish(message: FinishMessage) {
		this.jsonMessageProcessor.clear();
		const reason = message.reason as DuelFinishReason;
		const winner = message.winner;

		if (this.room.isFinished()) {
			return;
		}

		this.room.sendMessageToCpp(
			JSON.stringify({
				command: "DESTROY_DUEL",
				data: {},
			})
		);

		this.room.finished();
		const duelFinisher = new FinishDuelHandler({
			reason,
			winner,
			room: this.room,
		});
		void duelFinisher.run();
	}

	private handleCoreTime(payload: TimeMessage) {
		const message = TimeLimitClientMessage.create({
			team: this.room.calculateTimeReceiver(payload.team),
			timeLimit: payload.time,
		});

		this.room.resetTimer(payload.team, payload.time);

		this.room.clients.forEach((client: Client) => {
			this.room.cacheTeamMessage(client.team, message);
			client.sendMessage(message);
		});

		this.room.spectators.forEach((client: Client) => {
			client.sendMessage(message);
		});
	}

	private handleCoreMessageAll(message: CoreMessage) {
		const data = Buffer.from(message.data, "hex");
		const payload = Buffer.concat([decimalToBytesBuffer(data.length, 2), data]);
		this.room.cacheTeamMessage(3, payload);
		[...this.room.clients, ...this.room.spectators].forEach((client: Client) => {
			client.sendMessage(payload);
		});
	}

	private handleCoreMessageAllExcept(message: CoreMessage) {
		const data = Buffer.from(message.data, "hex");
		const payload = Buffer.concat([decimalToBytesBuffer(data.length, 2), data]);

		if (message.except !== undefined) {
			this.room.clients.forEach((client: Client) => {
				if (!(client.team === message.except && client.inTurn)) {
					client.sendMessage(payload);
				}
			});

			this.room.cacheTeamMessage(3, payload);
		}
	}

	private handleCoreMessage(message: CoreMessage) {
		const data = Buffer.from(message.data, "hex");
		const payload = Buffer.concat([decimalToBytesBuffer(data.length, 2), data]);

		if (message.cacheable) {
			this.room.cacheTeamMessage(message.receiver, payload);
		}

		if (message.except !== undefined) {
			this.room.clients.forEach((client: Client) => {
				if (!(client.team === message.except && client.inTurn)) {
					client.sendMessage(payload);
				}
			});

			return;
		}

		if (message.all) {
			const data = Buffer.from(message.data, "hex");
			const payload = Buffer.concat([decimalToBytesBuffer(data.length, 2), data]);

			[...this.room.clients, ...this.room.spectators].forEach((client: Client) => {
				if (client.team === message.receiver) {
					client.sendMessage(payload);
				}
			});

			return;
		}

		const player = [...this.room.clients, ...this.room.spectators].find(
			(player: Client) => player.inTurn && player.team === message.receiver
		);

		(<Client | undefined>player)?.sendMessage(payload);
	}

	private handleCoreStart(message: StartDuelMessage): void {
		const playerGameMessage = StartDuelClientMessage.create({
			lp: this.room.startLp,
			team: this.room.firstToPlay ^ 0,
			playerMainDeckSize: message.playerDeckSize,
			playerExtraDeckSize: message.playerExtraDeckSize,
			opponentMainDeckSize: message.opponentDeckSize,
			opponentExtraDeckSize: message.opponentExtraDeckSize,
		});

		const opponentGameMessage = StartDuelClientMessage.create({
			lp: this.room.startLp,
			team: this.room.firstToPlay ^ 1,
			playerMainDeckSize: message.playerDeckSize,
			playerExtraDeckSize: message.playerExtraDeckSize,
			opponentMainDeckSize: message.opponentDeckSize,
			opponentExtraDeckSize: message.opponentExtraDeckSize,
		});

		const spectatorGameMessage = StartDuelClientMessage.create({
			lp: this.room.startLp,
			team: 0xf0 | this.room.firstToPlay,
			playerMainDeckSize: message.playerDeckSize,
			playerExtraDeckSize: message.playerExtraDeckSize,
			opponentMainDeckSize: message.opponentDeckSize,
			opponentExtraDeckSize: message.opponentExtraDeckSize,
		});

		this.room.replay.addMessage(playerGameMessage.subarray(3));
		this.room.cacheTeamMessage(3, spectatorGameMessage);

		this.room.setPlayerDecksSize(message.playerDeckSize, message.playerExtraDeckSize);
		this.room.setOpponentDecksSize(message.opponentDeckSize, message.opponentExtraDeckSize);

		this.room.clients.forEach((client: Client) => {
			if (client.team === 0) {
				client.sendMessage(playerGameMessage);
			}
		});

		this.room.clients.forEach((client: Client) => {
			if (client.team === 1) {
				client.sendMessage(opponentGameMessage);
			}
		});

		this.room.spectators.forEach((spectator: Client) => {
			spectator.sendMessage(spectatorGameMessage);
		});

		this.room.sendMessageToCpp(
			JSON.stringify({
				command: "SET_DECKS",
				data: {},
			})
		);
	}

	private handleReady(message: ClientMessage, room: Room, player: Client): void {
		this.logger.debug("DUELING: READY");
		if (!player.isReconnecting || !player.canReconnect) {
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
		player.sendMessage(Buffer.from("0300012800", "hex"));
		if (room.lastPhaseMessage) {
			player.sendMessage(Buffer.from(`040001${room.lastPhaseMessage.toString("hex")}`, "hex"));
		}
		room.sendMessageToCpp(
			JSON.stringify({
				command: "GET_FIELD",
				data: {
					position: player.position,
				},
			})
		);
	}

	private async handleJoin(message: ClientMessage, room: Room, socket: ISocket): Promise<void> {
		this.logger.debug("DUELING: JOIN");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const joinMessage = new JoinGameMessage(message.data);
		const reconnectingPlayer = this.playerAlreadyInRoom(playerInfoMessage, room, socket);

		if (!(reconnectingPlayer instanceof Client)) {
			this.joinToDuelAsSpectator.run(joinMessage, playerInfoMessage, socket, room);

			return;
		}

		await this.reconnect.run(playerInfoMessage, reconnectingPlayer, joinMessage, socket, room);
	}

	private handleSurrender(_message: ClientMessage, client: Client): void {
		this.logger.debug("DUELING: SURRENDER");
		this.jsonMessageProcessor.clear();
		if (this.room.isFinished()) {
			return;
		}

		this.room.finished();

		this.room.sendMessageToCpp(
			JSON.stringify({
				command: "DESTROY_DUEL",
				data: {},
			})
		);

		const finishDuelHandler = new FinishDuelHandler({
			reason: DuelFinishReason.SURRENDERED,
			winner: Number(!client.team),
			room: this.room,
		});

		void finishDuelHandler.run();
	}

	private handleResponse(message: ClientMessage, client: Client): void {
		this.logger.debug("DUELING: RESPONSE");

		const data = message.data
			.toString("hex")
			.match(/.{1,2}/g)
			?.join("|");

		if (!data) {
			return;
		}

		this.room.replay.addResponse(data);
		this.room.stopTimer(client.team);

		this.room.sendMessageToCpp(
			JSON.stringify({
				command: "RESPONSE",
				data: {
					replier: client.team,
					message: data,
				},
			})
		);
	}

	private generateSeeds(): bigint[] {
		const randomSeed1 = crypto.randomBytes(8).readBigUInt64LE();
		const randomSeed2 = crypto.randomBytes(8).readBigUInt64LE();
		const randomSeed3 = crypto.randomBytes(8).readBigUInt64LE();
		const randomSeed4 = crypto.randomBytes(8).readBigUInt64LE();

		return [randomSeed1, randomSeed2, randomSeed3, randomSeed4];
	}
}
