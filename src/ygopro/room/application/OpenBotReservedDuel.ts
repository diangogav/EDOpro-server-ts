import { createYGOProRoomDeps } from "@ygopro/room/application/createYGOProRoomDeps";
import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { ReservedDuelServices } from "@shared/reserved-duel/application/ReservedDuels";
import { Reservation, RESERVATION_ID_PATTERN } from "@shared/reserved-duel/domain/Reservation";
import { ReservedDuelSession } from "@shared/reserved-duel/domain/ReservedDuelSession";

import { WindbotModule } from "../../windbot/application/WindbotModule";
import { YGOProRoom } from "../domain/YGOProRoom";
import { reservedRoomCommand } from "../domain/reservedRoomCommand";
import { YGOProMessageRepository } from "../infrastructure/YGOProMessageRepository";
import YGOProRoomList from "../infrastructure/YGOProRoomList";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";
import { generateUnusedRoomId } from "./generateUnusedRoomId";
import { ReservedDuelLobbyTimeout } from "./ReservedDuelLobbyTimeout";

/**
 * Opens the room of a reserved duel between two bots. No human will ever claim
 * it, so the issuer announces it and this instance claims it itself: the room
 * is built from the reservation alone, with no creating socket (as matchmaking
 * rooms are), and both bots are requested, each for its own seat. From there it
 * is an ordinary reserved room: the lobby timeout, the game-over record and the
 * abandon paths are the ones every reserved duel uses. A bot that cannot come
 * ends the room as `bot_unavailable`, which blames no seat.
 */
export class OpenBotReservedDuel {
	public constructor(
		private readonly services: () => ReservedDuelServices | null,
		private readonly windbot: WindbotModule | undefined,
		private readonly logger: Logger,
	) {}

	public async run(reservationId: string): Promise<void> {
		const services = this.services();
		if (!services || !RESERVATION_ID_PATTERN.test(reservationId)) {
			return;
		}

		// Every instance hears the announcement; the atomic claim picks one.
		const claim = await services.store.claimForServer(reservationId, services.instanceId);
		if (claim.status !== "claimed") {
			return;
		}

		const { reservation } = claim;
		const room = this.createRoom(reservation, services);
		if (!room) {
			return;
		}
		if (!(await this.recordOpen(room, reservation, services))) {
			return;
		}

		YGOProRoomList.addRoom(room);
		room.waiting();
		ReservedDuelLobbyTimeout.schedule(room);
		for (const bot of room.reservedDuel?.bots ?? []) {
			this.requestBot(room, bot.botName, bot.seat);
		}
	}

	private createRoom(reservation: Reservation, services: ReservedDuelServices): YGOProRoom | null {
		const session = new ReservedDuelSession(reservation, services);
		const command = reservedRoomCommand(reservation);
		if (!command) {
			// Unknown format: claimed but unplayable. Recording it closed keeps
			// the issuer from waiting on a room that will never exist.
			this.logger.error("Bot reserved duel has an unknown format", {
				reservationId: reservation.id,
				format: reservation.format,
			});
			void services.repository
				.open({ reservation, instanceId: services.instanceId, roomId: 0, joinedSeat: -1 })
				.then(() => session.close({ seat: null, reason: "room_closed" }))
				.catch(() => services.release(reservation.id));
			return null;
		}

		const room = YGOProRoom.create(
			generateUnusedRoomId(),
			command,
			this.logger,
			new EventEmitter(),
			// Empty buffer: no host name and no password; each bot brings its own name.
			new PlayerInfoMessage(Buffer.alloc(0), 0),
			`reserved-${reservation.id}`,
			new YGOProMessageRepository(),
			createYGOProRoomDeps(),
			false,
		);
		room.reservedDuel = session;
		room.reservedUserIds = [];
		// Bots never reconnect, so the room hands out no reconnection tokens.
		room.noReconnect = true;

		return room;
	}

	// No seat is joined yet: each bot sits when it connects.
	private async recordOpen(
		room: YGOProRoom,
		reservation: Reservation,
		services: ReservedDuelServices,
	): Promise<boolean> {
		try {
			await services.repository.open({
				reservation,
				instanceId: services.instanceId,
				roomId: room.id,
				joinedSeat: -1,
			});
		} catch (error) {
			// The write may have committed and only its reply been lost: with the
			// row in place the duel goes on, otherwise the room is closed.
			const committed = await services.repository.exists(reservation.id).catch(() => false);
			if (!committed) {
				this.logger.error("Bot reserved duel could not be recorded", {
					reservationId: reservation.id,
					error: error instanceof Error ? error.message : String(error),
				});
				room.reservedDuel?.close({ seat: null, reason: "room_closed" });
				return false;
			}
		}

		if (room.isTag || room.isMatch) {
			this.logger.error("Bot reserved duel format does not fit a single duel", {
				reservationId: reservation.id,
				format: reservation.format,
			});
			room.reservedDuel?.close({ seat: null, reason: "room_closed" });
			return false;
		}

		return true;
	}

	private requestBot(room: YGOProRoom, botName: string, seat: number): void {
		const failed = (): void => {
			FinalizeYGOProRoom.run(room, { seat: null, reason: "bot_unavailable" });
		};

		if (!this.windbot?.isEnabled()) {
			failed();
			return;
		}

		this.windbot
			.requestBot(room.id, botName, () => room.finalizing, undefined, undefined, seat)
			.catch((error: unknown) => {
				this.logger.error("Bot reserved duel request failed", {
					roomId: room.id,
					botName,
					error: error instanceof Error ? error.message : String(error),
				});
				failed();
			});
	}
}
