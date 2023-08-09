import { YGOClientSocket } from "../../../socket-server/HostServer";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { CatchUpClientMessage } from "../../messages/server-to-client/CatchUpClientMessage";
import { DuelStartClientMessage } from "../../messages/server-to-client/DuelStartClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { Room } from "../domain/Room";
import { Team } from "../domain/Team";

export class JoinToDuelAsSpectator {
	run(
		joinMessage: JoinGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		socket: YGOClientSocket,
		room: Room
	): void {
		const client = new Client({
			socket,
			host: false,
			name: playerInfoMessage.name,
			position: room.nextSpectatorPosition(),
			roomId: room.id,
			team: Team.SPECTATOR,
		});

		room.addSpectator(client);

		socket.write(JoinGameClientMessage.createFromRoom(joinMessage, room));
		socket.write(TypeChangeClientMessage.create({ type: 0x07 }));

		room.clients.forEach((item) => {
			const status = (item.position << 4) | 0x09;
			socket.write(PlayerEnterClientMessage.create(item.name, item.position));
			socket.write(PlayerChangeClientMessage.create({ status }));
		});

		socket.write(DuelStartClientMessage.create());

		socket.write(CatchUpClientMessage.create({ catchingUp: true }));

		room.spectatorCache.forEach((item) => {
			socket.write(item);
		});

		socket.write(CatchUpClientMessage.create({ catchingUp: false }));

		const team0 = room.clients
			.filter((player) => player.team === 0)
			.map((item) => item.name.replace(/\0/g, "").trim());

		const team1 = room.clients
			.filter((player) => player.team === 1)
			.map((item) => item.name.replace(/\0/g, "").trim());

		socket.write(
			ServerMessageClientMessage.create(`Bienvenido ${client.name.replace(/\0/g, "").trim()}`)
		);
		socket.write(
			ServerMessageClientMessage.create(
				`Score: ${team0.join(",")}: ${room.matchScore().team0} vs ${team1.join(",")}: ${
					room.matchScore().team1
				}`
			)
		);

		[...room.clients, ...room.spectators].forEach((_client) => {
			_client.sendMessage(
				ServerMessageClientMessage.create(`${client.name} ha ingresado como espectador`)
			);
		});
	}
}
