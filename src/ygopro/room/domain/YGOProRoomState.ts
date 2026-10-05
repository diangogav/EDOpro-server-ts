import { RoomState } from "@edopro/room/domain/RoomState";
import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";

import { AbandonBetweenDuels } from "../application/AbandonBetweenDuels";
import { YGOProRoom } from "./YGOProRoom";

export class YGOProRoomState extends RoomState {
	protected override registerDuelEventSubscribers(): void {
		// LP and turn mutations on this pipeline live in the ocgcore middleware
		// (YGOProDuelingState / ocgcore.ts), not in dispatcher subscribers.
		// Registering the EDOPro internal handlers here would apply every
		// mutation twice; the dispatcher carries plugin delivery only.
	}

	protected toRPS(room: YGOProRoom): void {
		const team0Player = room.getTeamPlayers(0)[0];
		const team1Player = room.getTeamPlayers(1)[0];
		if (!team0Player || !team1Player) {
			return;
		}

		const message = room.messageSender.selectHandMessage();
		team0Player.captain();
		team1Player.captain();
		team0Player.sendMessageToClient(message);
		team1Player.sendMessageToClient(message);
	}

	/**
	 * Between duels there is no duel to concede, so a surrender leaves the whole
	 * match at once. Tag matches keep their team-agreement rules and are left out.
	 */
	protected settleSurrenderBetweenDuels(logger: Logger): void {
		this.eventEmitter.on(
			Commands.SURRENDER as unknown as string,
			(_message: ClientMessage, room: YGOProRoom, client: YGOProClient) => {
				if (client.isSpectator || room.isTag || !room.isBetweenDuels()) {
					return;
				}
				logger.info("Surrender between duels", { team: client.team });
				void AbandonBetweenDuels.resolve(room, client.team, logger);
			},
		);
	}
}
