

import EventEmitter from "events";

import { PlayerInfoMessage } from "../../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../shared/messages/Commands";
import { ClientMessage } from "../../../../shared/messages/MessageProcessor";
import { RoomState } from "../../../../edopro/room/domain/RoomState";
import { Logger } from "../../../../shared/logger/domain/Logger";
import { ISocket } from "../../../../shared/socket/domain/ISocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { YGOProRoom } from "../YGOProRoom";
import { TurnPlayerResult, YGOProCtosTpResult, YGOProStocDuelStart } from "ygopro-msg-encode";

export class MercuryChoosingOrderState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);

		this.logger = logger.child({ file: "MercuryChoosingOrderState" });

		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: YGOProRoom, socket: ISocket) =>
				void this.handleJoin.bind(this)(message, room, socket)
		);
		this.eventEmitter.on(
			Commands.TURN_CHOICE as unknown as string,
			(message: ClientMessage, room: YGOProRoom, client: MercuryClient) =>
				this.handle.bind(this)(message, room, client)
		);
	}

	private handle(message: ClientMessage, room: YGOProRoom, player: MercuryClient): void {
		player.logger.info("handle");

		const data = new YGOProCtosTpResult().fromPayload(message.data);
		const turn = data.res;

		room.setPositionSwapped((turn === TurnPlayerResult.FIRST) !== (room.getTeam(player.position) === 0))
		room.dueling();
	}

	private handleJoin(message: ClientMessage, room: YGOProRoom, socket: ISocket): void {
		this.logger.info("JOIN");
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
}
