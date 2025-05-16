import { ServerInfoMessage } from "@edopro/messages/domain/ServerInfoMessage";

import { DuelStartClientMessage } from "../../../shared/messages/server-to-client/DuelStartClientMessage";
import { PlayerEnterClientMessage } from "../../../shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../shared/messages/server-to-client/TypeChangeClientMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { CatchUpClientMessage } from "../../messages/server-to-client/CatchUpClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { Room } from "../domain/Room";

export class JoinToDuelAsSpectator {
	run(
		joinMessage: JoinGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		socket: ISocket,
		room: Room
	): void {
		const client = room.createSpectator(socket, playerInfoMessage.name);

		socket.send(JoinGameClientMessage.createFromRoom(joinMessage, room));
		socket.send(TypeChangeClientMessage.create({ type: 0x07 }));

		room.clients.forEach((item) => {
			const status = (item.position << 4) | 0x09;
			socket.send(PlayerEnterClientMessage.create(item.name, item.position));
			socket.send(PlayerChangeClientMessage.create({ status }));
		});

		socket.send(DuelStartClientMessage.create());

		socket.send(CatchUpClientMessage.create({ catchingUp: true }));

		room.spectatorCache.forEach((item) => {
			socket.send(item);
		});

		socket.send(CatchUpClientMessage.create({ catchingUp: false }));

		const team0 = room.clients
			.filter((player: Client) => player.team === 0)
			.map((item) => item.name.replace(/\0/g, "").trim());

		const team1 = room.clients
			.filter((player: Client) => player.team === 1)
			.map((item) => item.name.replace(/\0/g, "").trim());

		socket.send(
			ServerMessageClientMessage.create(`Welcome ${client.name.replace(/\0/g, "").trim()}`)
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
					`${client.name} ${ServerInfoMessage.HAS_ENTERED_AS_A_SPECTATOR}`
				)
			);
		});
	}
}
