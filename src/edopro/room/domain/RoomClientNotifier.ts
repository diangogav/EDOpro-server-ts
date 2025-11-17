import { Client } from "@edopro/client/domain/Client";
import { PlayerChangeClientMessage } from "@edopro/messages/server-to-client/PlayerChangeClientMessage";
import { WatchChangeClientMessage } from "@edopro/messages/server-to-client/WatchChangeClientMessage";
import { YgoClient } from "src/shared/client/domain/YgoClient";
import { PlayerEnterClientMessage } from "src/shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "src/shared/messages/server-to-client/TypeChangeClientMessage";

import { PlayerRoomState } from "./PlayerRoomState";

export class RoomClientNotifier {
	constructor(
		private readonly players: () => YgoClient[],
		private readonly spectators: () => YgoClient[]
	) {}

	sendPlayerChange(player: Client, state: PlayerRoomState): void {
		const status = (player.position << 4) | state;
		const msg = PlayerChangeClientMessage.create({ status });
		this.broadcastToAll(msg);
	}

	sendPlayerEnter(player: Client, place: { position: number; team: number }): void {
		const msg = PlayerEnterClientMessage.create(player.name, place.position);
		this.broadcastToAll(msg);
	}

	sendPlayerCellChange(player: Client, place: { position: number; team: number }): void {
		const status = (player.position << 4) | place.position;
		const msg = PlayerChangeClientMessage.create({ status });
		this.broadcastToAll(msg);
	}

	sendTypeChange(player: Client, value?: number): void {
		const type = value ?? (Number(player.host) << 4) | player.position;
		player.sendMessage(TypeChangeClientMessage.create({ type }));
	}

	sendSpectatorCount(count: number): void {
		const msg = WatchChangeClientMessage.create({ count });
		this.broadcastToAll(msg);
	}

	private broadcastToAll(message: Buffer): void {
		this.players().forEach((client: Client) => {
			client.sendMessage(message);
		});
		this.spectators().forEach((client: Client) => {
			client.sendMessage(message);
		});
	}
}
