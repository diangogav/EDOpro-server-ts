import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { RoomState } from "@shared/room/domain/RoomState";
import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { EMOTE_COOLDOWN_MS, MAX_ID_BYTES, buildStocEmoteFrame } from "@ygopro/emote/emote-protocol";
import { NetPlayerType, YGOProStocChat } from "ygopro-msg-encode";

import { BufferToUTF16 } from "../../../utils/BufferToUTF16";

import { AbandonBetweenDuels } from "../application/AbandonBetweenDuels";
import { YGOProRoom } from "./YGOProRoom";

export class YGOProRoomState extends RoomState {
	protected override registerDuelEventSubscribers(): void {
		// LP and turn mutations on this pipeline live in the ocgcore middleware
		// (YGOProDuelingState / ocgcore.ts), not in dispatcher subscribers.
		// Registering the EDOPro internal handlers here would apply every
		// mutation twice; the dispatcher carries plugin delivery only.
	}

	protected relayChat(message: ClientMessage, room: YgoRoom, client: YgoClient): void {
		const playerType = client.isSpectator
			? NetPlayerType.OBSERVER
			: this.ingameSeat(room as YGOProRoom, client);

		const content = BufferToUTF16(message.data, message.data.length);
		// STOC_CHAT (opcode 0x19) only carries player_type + msg — there is no name field,
		// and every spectator shares player_type=7, so the client cannot tell which spectator
		// spoke (it would fall back to a duelist's identity). Prefix the spectator's name into
		// the text so the client can attribute the message to the right person.
		const outgoing = client.isSpectator
			? `${client.name.replace(/\0/g, "").trim()}: ${content}`
			: content;
		const chatMessage = Buffer.from(
			new YGOProStocChat().fromPartial({ player_type: playerType, msg: outgoing }).toFullPayload(),
		);

		room.clients.forEach((_client: YgoClient) => {
			_client.socket.send(chatMessage);
		});
	}

	/**
	 * Relay an emote (custom CTOS 0xfc) to the whole room as STOC 0xfc. The opcode
	 * is understood solely by this project's client, and a standard ygopro client
	 * would neither send nor decode it. Bounds the id size and rate-limits per
	 * client before broadcasting; receivers decide which ids to play.
	 */
	protected override relayEmote(message: ClientMessage, room: YgoRoom, client: YgoClient): void {
		// Only seated duelists may emote. Spectators watch and receive emotes but
		// cannot send them — reject here (the authoritative gate; the client also
		// hides the picker for spectators).
		if (client.isSpectator) return;

		if (message.data.length === 0 || message.data.length > MAX_ID_BYTES) return;
		if (!client.tryEmote(Date.now(), EMOTE_COOLDOWN_MS)) return;

		// Seat resolution mirrors relayChat so the client maps the sender to the
		// correct HUD side (accounting for a swapped board).
		const playerType = this.ingameSeat(room as YGOProRoom, client);

		const frame = buildStocEmoteFrame(playerType, message.data);
		room.clients.forEach((c: YgoClient) => {
			c.socket.send(frame);
		});
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

	/**
	 * The seat a duelist is announced as in STOC_CHAT/emote frames, mirroring
	 * srvpro2's getIngamePos: once the turn choice swaps positions the seat
	 * flips its team bit, which is bit 0 in a single duel and bit 1 in Tag
	 * (teams sit at 0-1 and 2-3), so Tag partners keep their own seats.
	 */
	private ingameSeat(room: YGOProRoom, client: YgoClient): number {
		if (!room.isPositionSwapped) {
			return client.position;
		}

		return client.position ^ (room.isTag ? 0b10 : 0b01);
	}
}
