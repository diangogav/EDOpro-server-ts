

import EventEmitter from "events";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../edopro/messages/domain/Commands";
import { ClientMessage } from "../../../../edopro/messages/MessageProcessor";
import { RPSChooseClientMessage } from "../../../../edopro/messages/server-to-client/RPSChooseClientMessage";
import { Room } from "../../../../edopro/room/domain/Room";
import { RoomState } from "../../../../edopro/room/domain/RoomState";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryReconnect } from "../../application/MercuryReconnect";
import { MercuryRoom } from "../MercuryRoom";
import { HandResult, YGOProCtosHandResult, YGOProStocDuelStart, YGOProStocHandResult, YGOProStocSelectHand, YGOProStocSelectTp } from "ygopro-msg-encode";

export class MercuryRockPaperScissorState extends RoomState {
	private handResult = [0, 0]

	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);
		this.logger = logger.child({ file: "MercuryRockPaperScissorState" });
		this.eventEmitter.on(
			Commands.RPS_CHOICE as unknown as string,
			(message: ClientMessage, room: MercuryRoom, client: MercuryClient) =>
				this.handleRPSChoice.bind(this)(message, room, client)
		);
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket)
		);
		this.eventEmitter.on(
			Commands.READY as unknown as string,
			(message: ClientMessage, room: Room, client: MercuryClient) =>
				this.handleReady.bind(this)(message, room, client)
		);
	}


	private handleJoin(message: ClientMessage, room: MercuryRoom, socket: ISocket): void {
		this.logger.info("JOIN");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const playerAlreadyInRoom = this.playerAlreadyInRoom(playerInfoMessage, room, socket);

		if (!(playerAlreadyInRoom instanceof MercuryClient)) {
			const spectator = room.createSpectatorUnsafe(socket, playerInfoMessage.name);
			room.addSpectatorUnsafe(spectator);
			spectator.sendMessageToClient(Buffer.from(new YGOProStocDuelStart().toFullPayload()));
			room.sendDeckCountMessage(spectator);
			return;
		}

		// MercuryReconnect.run(playerAlreadyInRoom, room, socket);
	}

	private handleReady(_message: ClientMessage, _room: Room, player: MercuryClient): void {
		player.logger.info("MercuryRockPaperScissorState: READY");

		if (!player.isReconnecting) {
			return;
		}

		player.socket.send(DuelStartClientMessage.create());

		if (!player.rpsChosen) {
			const rpsChooseMessage = RPSChooseClientMessage.create();
			player.socket.send(rpsChooseMessage);
		}

		player.clearReconnecting();
	}

	private handleRPSChoice(message: ClientMessage, room: MercuryRoom, player: MercuryClient): void {
		player.logger.info(`MercuryRockPaperScissorState: RPS_CHOICE: ${message.raw.toString("hex")}`);

		const data = new YGOProCtosHandResult().fromPayload(message.data);

		if (data.res < HandResult.ROCK || data.res > HandResult.PAPER) {
			return;
		}

		const team = room.getTeam(player.position);
		if (team < 0 || team > 1) {
			return;
		}

		this.handResult[team] = data.res;

		if (!this.handResult[0] || !this.handResult[1]) {
			return;
		}

		const team0Result = new YGOProStocHandResult().fromPartial({
			res1: this.handResult[0],
			res2: this.handResult[1]
		})
		room.getTeamPlayers(0).forEach((_player) => _player.sendMessageToClient(Buffer.from(team0Result.toFullPayload())))
		room.spectators.forEach((spectator: MercuryClient) => spectator.sendMessageToClient(Buffer.from(team0Result.toFullPayload())))

		const team1Result = new YGOProStocHandResult().fromPartial({
			res1: this.handResult[1],
			res2: this.handResult[0]
		})
		room.getTeamPlayers(1).forEach((_player) => _player.sendMessageToClient(Buffer.from(team1Result.toFullPayload())))

		if (this.handResult[0] === this.handResult[1]) {
			this.handResult = [0, 0];
			this.toRPS(room);
			return;
		}

		this.handResult = [0, 0];

		const winner = this.getRPSWinner();
		const winnerPlayer = room.getTeamPlayers(winner)[0];
		if (!winnerPlayer) {
			return;
		}

		const selectTPMessage = new YGOProStocSelectTp();
		winnerPlayer.sendMessageToClient(Buffer.from(selectTPMessage.toFullPayload()));

		room.choosingOrder();
	}

	private getRPSWinner(): number {
		if (
			(this.handResult[0] === 1 && this.handResult[1] === 2) ||
			(this.handResult[0] === 2 && this.handResult[1] === 3) ||
			(this.handResult[0] === 3 && this.handResult[1] === 1)
		) {
			return 1;
		} else {
			return 0;
		}
	}
}
