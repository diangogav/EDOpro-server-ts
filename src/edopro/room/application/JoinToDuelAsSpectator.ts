import { ChatColor } from "ygopro-msg-encode";

import { AccountVerifier } from "@shared/user-profile/domain/AccountVerifier";

import { DuelStartClientMessage } from "../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { createSystemChat } from "../../../shared/room/domain/chat/SystemChat";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { CatchUpClientMessage } from "../../messages/server-to-client/CatchUpClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { Room } from "../domain/Room";

export class JoinToDuelAsSpectator {
	constructor(private readonly accountVerifier: AccountVerifier) {}

	public async run(
		joinMessage: JoinGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		socket: ISocket,
		room: Room,
	): Promise<void> {
		const spectator = room.createSpectatorUnsafe(socket, playerInfoMessage.name);
		// Not awaited: the spectator enters at once and the answer arrives later.
		spectator.setAccountVerification(
			this.accountVerifier
				.verify({ userId: socket.resolvedUserId ?? null, playerInfo: playerInfoMessage })
				.catch(() => false),
		);
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
