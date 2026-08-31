import { ChatColor } from "ygopro-msg-encode";

import { DuelStartClientMessage } from "../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { createSystemChat } from "../../../shared/room/domain/chat/SystemChat";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { CatchUpClientMessage } from "../../messages/server-to-client/CatchUpClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { Room } from "../domain/Room";

export class JoinToDuelAsSpectator {
	async run(
		joinMessage: JoinGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		socket: ISocket,
		room: Room,
	): Promise<void> {
		const spectator = room.createSpectatorUnsafe(socket, playerInfoMessage.name);
		spectator.sendMessage(JoinGameClientMessage.createFromRoom(joinMessage, room));
		room.addSpectatorUnsafe(spectator);
		room.notifyToAllPlayers(spectator);

		spectator.sendMessage(DuelStartClientMessage.create());
		spectator.sendMessage(CatchUpClientMessage.create({ catchingUp: true }));

		room.spectatorCache.forEach((item) => {
			socket.send(item);
		});

		spectator.sendMessage(CatchUpClientMessage.create({ catchingUp: false }));

		// room.score is the single source of truth for the "Score · A n – m B"
		// format — reused verbatim instead of re-deriving it from team rosters.
		socket.send(createSystemChat(ChatColor.WHITE, room.score));
	}
}
