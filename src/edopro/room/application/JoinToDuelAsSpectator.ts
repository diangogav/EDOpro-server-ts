import { ServerInfoMessage } from "@edopro/messages/domain/ServerInfoMessage";

import { DuelStartClientMessage } from "../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { CatchUpClientMessage } from "../../messages/server-to-client/CatchUpClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { Room } from "../domain/Room";

export class JoinToDuelAsSpectator {
	async run(
		joinMessage: JoinGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		socket: ISocket,
		room: Room
	): Promise<void> {
		const spectator = await room.createSpectator(socket, playerInfoMessage.name);
		spectator.sendMessage(JoinGameClientMessage.createFromRoom(joinMessage, room));
		room.addSpectator(spectator);
		room.notifyToAllPlayers(spectator);

		spectator.sendMessage(DuelStartClientMessage.create());
		spectator.sendMessage(CatchUpClientMessage.create({ catchingUp: true }));

		room.spectatorCache.forEach((item) => {
			socket.send(item);
		});

		spectator.sendMessage(CatchUpClientMessage.create({ catchingUp: false }));

		const team0 = room.clients
			.filter((player: Client) => player.team === 0)
			.map((item) => item.name.replace(/\0/g, "").trim());

		const team1 = room.clients
			.filter((player: Client) => player.team === 1)
			.map((item) => item.name.replace(/\0/g, "").trim());

		socket.send(
			ServerMessageClientMessage.create(`Welcome ${spectator.name.replace(/\0/g, "").trim()}`)
		);
		socket.send(
			ServerMessageClientMessage.create(
				`Score: ${team0.join(",")}: ${room.matchScore().team0} vs ${team1.join(",")}: ${
					room.matchScore().team1
				}`
			)
		);

		[...room.clients, ...room.spectators].forEach((_client: Client) => {
			_client.sendMessage(
				ServerMessageClientMessage.create(
					`${spectator.name} ${ServerInfoMessage.HAS_ENTERED_AS_A_SPECTATOR}`
				)
			);
		});
	}
}
