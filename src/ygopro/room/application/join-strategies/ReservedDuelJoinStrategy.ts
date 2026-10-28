import { ErrorMessageType } from "ygopro-msg-encode";

import {
	RESERVATION_COMMAND,
	RESERVATION_ID_PATTERN,
	Reservation,
} from "@shared/reserved-duel/domain/Reservation";
import { ReservedDuelSession } from "@shared/reserved-duel/domain/ReservedDuelSession";
import {
	ReservedDuels,
	ReservedDuelServices,
} from "@shared/reserved-duel/application/ReservedDuels";

import { WindbotModule } from "../../../windbot/application/WindbotModule";
import { YGOProRoom } from "../../domain/YGOProRoom";
import { reservedRoomCommand } from "../../domain/reservedRoomCommand";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";
import { FinalizeYGOProRoom } from "../FinalizeYGOProRoom";
import { generateUnusedRoomId } from "../generateUnusedRoomId";
import { ReservedDuelLobbyTimeout } from "../ReservedDuelLobbyTimeout";
import { JoinContext, JoinStrategy } from "./JoinStrategy";

/**
 * ReservedDuelJoinStrategy — "rv#<reservationId>" from a ticket-authenticated
 * socket.
 *
 * The first participant to arrive claims the reservation and opens its room,
 * built only from the reservation's format, mode and options; later
 * participants of the same reservation are sent to that room. Bots named in
 * the reservation are requested here and come back through the usual AIJOIN
 * path. Every refusal surfaces as a JOINERROR (thrown to the join handler).
 */
export class ReservedDuelJoinStrategy implements JoinStrategy {
	/** Rooms still being opened, so a participant arriving meanwhile waits for it. */
	private readonly opening = new Map<string, Promise<YGOProRoom | null>>();

	constructor(
		private readonly windbot?: WindbotModule,
		private readonly services: () => ReservedDuelServices | null = () => ReservedDuels.current(),
	) {}

	matches(ctx: JoinContext): boolean {
		return ctx.command === RESERVATION_COMMAND;
	}

	async handle(ctx: JoinContext): Promise<void> {
		const userId = ctx.socket.resolvedUserId;
		const reservationId = ctx.password;
		const services = this.services();
		if (!userId || !services || !RESERVATION_ID_PATTERN.test(reservationId)) {
			throw new Error("reserved duel join refused: no identity, no store or bad id");
		}

		const claim = await services.store.claim(reservationId, services.instanceId, userId);
		if (claim.status === "claimed") {
			await this.openRoom(ctx, claim.reservation, userId, services);
			return;
		}
		if (claim.status === "already_claimed_here") {
			await this.joinOpenRoom(ctx, claim.reservation, userId, services);
			return;
		}

		throw new Error(`reserved duel join refused: ${claim.status}`);
	}

	private async openRoom(
		ctx: JoinContext,
		reservation: Reservation,
		userId: string,
		services: ReservedDuelServices,
	): Promise<void> {
		let settle: (room: YGOProRoom | null) => void = () => undefined;
		this.opening.set(
			reservation.id,
			new Promise((resolve) => {
				settle = resolve;
			}),
		);

		try {
			const room = this.createRoom(ctx, reservation, services);
			const joinedSeat = room.reservedDuel?.seatOfUser(userId) ?? 0;
			try {
				await services.repository.open({
					reservation,
					instanceId: services.instanceId,
					roomId: room.id,
					joinedSeat,
				});
			} catch (error) {
				// The write may have committed and only its reply been lost. With
				// the row in place the duel goes on; otherwise (or unknown) the room
				// is closed through its session: any committed row is recorded as
				// room_closed and the reservation key is given back.
				const committed = await services.repository.exists(reservation.id).catch(() => false);
				if (!committed) {
					room.reservedDuel?.close({ seat: null, reason: "room_closed" });
					throw error;
				}
				ctx.logger.warn("Reserved duel rows committed despite a failed write", {
					reservationId: reservation.id,
				});
			}

			if (!room.isTag && room.isMatch === (reservation.mode === "match")) {
				this.activate(ctx, room);
				settle(room);
				return;
			}

			// The format token contradicts the reservation's mode: the room is
			// recorded and closed by the server without being played.
			ctx.logger.error("Reserved duel format does not fit its mode", {
				reservationId: reservation.id,
				format: reservation.format,
				mode: reservation.mode,
			});
			room.reservedDuel?.close({ seat: null, reason: "room_closed" });
			throw new Error("reserved duel join refused: format does not fit mode");
		} finally {
			// A room that never opened lets anyone waiting on it fail fast.
			settle(null);
			this.opening.delete(reservation.id);
		}
	}

	private createRoom(
		ctx: JoinContext,
		reservation: Reservation,
		services: ReservedDuelServices,
	): YGOProRoom {
		const command = reservedRoomCommand(reservation);
		if (!command) {
			// Unknown format: claimed but unplayable. Recording it closed keeps
			// the issuer from waiting on a room that will never exist.
			const session = new ReservedDuelSession(reservation, services);
			void services.repository
				.open({ reservation, instanceId: services.instanceId, roomId: 0, joinedSeat: -1 })
				.then(() => session.close({ seat: null, reason: "room_closed" }))
				.catch(() => services.release(reservation.id));
			throw new Error(`reserved duel join refused: unknown format ${reservation.format}`);
		}

		const room = YGOProRoom.create(
			generateUnusedRoomId(),
			command,
			ctx.logger,
			ctx.eventEmitter,
			ctx.playerInfo,
			ctx.socketId,
			ctx.messageRepository,
			false,
		);
		const session = new ReservedDuelSession(reservation, services);
		room.reservedDuel = session;
		room.reservedUserIds = session.userIds;
		room.noReconnect = !session.allowsReconnect;

		return room;
	}

	private activate(ctx: JoinContext, room: YGOProRoom): void {
		YGOProRoomList.addRoom(room);
		room.waiting();
		room.emit("JOIN", ctx.message, ctx.socket);
		ReservedDuelLobbyTimeout.schedule(room);

		for (const bot of room.reservedDuel?.bots ?? []) {
			this.requestBot(ctx, room, bot.botName);
		}
	}

	private requestBot(ctx: JoinContext, room: YGOProRoom, botName: string): void {
		const failed = (): void => {
			// JOINERROR before teardown, as WindBotJoinStrategy does: the
			// finalizer destroys the human's socket.
			ctx.socket.send(ctx.messageRepository.errorMessage(ErrorMessageType.JOINERROR, 0));
			ctx.socket.close();
			FinalizeYGOProRoom.run(room, { seat: null, reason: "bot_unavailable" });
		};

		if (!this.windbot?.isEnabled()) {
			failed();
			return;
		}

		this.windbot
			.requestBot(room.id, botName, () => room.finalizing)
			.then(({ bot }) => {
				room.windbot = { name: bot.name, deck: bot.deck };
			})
			.catch((error: unknown) => {
				ctx.logger.error("Reserved duel bot request failed", {
					roomId: room.id,
					botName,
					error: error instanceof Error ? error.message : String(error),
				});
				failed();
			});
	}

	private async joinOpenRoom(
		ctx: JoinContext,
		reservation: Reservation,
		userId: string,
		services: ReservedDuelServices,
	): Promise<void> {
		const room =
			(await this.opening.get(reservation.id)) ??
			YGOProRoomList.getRooms().find((candidate) => candidate.reservedDuel?.id === reservation.id);
		const session = room?.reservedDuel;
		if (!room || !session || room.finalizing) {
			throw new Error("reserved duel join refused: room no longer live");
		}

		const seat = session.seatOfUser(userId);
		if (seat === null) {
			throw new Error("reserved duel join refused: not a participant");
		}

		// A seat is taken once. Coming back to one already taken is only a thing
		// in rooms that allow reconnecting; the room's own gates then stop a
		// second live connection for the same user.
		const claimed = await services.repository.claimSeat(reservation.id, seat);
		if (!claimed && !session.allowsReconnect) {
			throw new Error("reserved duel join refused: seat already taken");
		}

		room.emit("JOIN", ctx.message, ctx.socket);
	}
}
