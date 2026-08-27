import { generateUnusedRoomId } from "../generateUnusedRoomId";

import { isPairingReconnectRoutingEligible } from "@shared/room/domain/findReconnectingPlayer";

import { JoinContext } from "./JoinStrategy";
import { isPairingJoin } from "./isPairingJoin";
import { YGOProRoom } from "../../domain/YGOProRoom";
import YGOProRoomList from "../../infrastructure/YGOProRoomList";

export interface FindOrCreateRoomOptions {
	/**
	 * Forwarded verbatim to YGOProRoom.create's rankedOverride param.
	 * MUST stay optional/undefined-capable — RoomLeague.determine treats
	 * `undefined` (fall through to hasPin) differently from an explicit
	 * `false` (force Casual). DefaultJoinStrategy relies on `undefined` so a
	 * PIN-carrying anonymous join still resolves to the External league.
	 */
	rankedOverride: boolean | undefined;
}

/**
 * Shared find-or-create logic used by both DefaultJoinStrategy and
 * TicketJoinStrategy.
 *
 * PAIRING joins (see isPairingJoin) resolve the existing-room lookup via
 * findJoinableByName (state-, seat-, password- and league-aware) instead of
 * findByName (first-match, state-blind): the same-name room is only reused
 * when it is WAITING, has a free seat, carries no password, AND its league
 * would not hard-reject this joiner if it's a guest. Every one of those
 * constraints is evaluated PER CANDIDATE inside the scan itself, not as a
 * post-check on whatever comes back first — a disqualified candidate (e.g. a
 * `tcg#secret` room) can therefore never permanently shadow a later
 * qualifying `tcg` room. Otherwise (no room yet, or every same-named room is
 * dueling/full/passworded/league-incompatible) a NEW room is created — a
 * pairing join can therefore never land in a non-waiting room as a fresh
 * spectator, so that path is unreachable for a STRANGER.
 *
 * Because findJoinableByName only ever considers WAITING rooms, a pairing
 * join is otherwise blind to its own room once that room leaves WAITING (e.g.
 * mid-duel) — a client that reconnects by simply re-sending its original bare
 * command (no token, unlike the first-party reconnect flow) would land in a
 * brand-new room instead of resuming its seat. Before the WAITING-only scan,
 * findPairingReconnectTarget looks for a same-name, passwordless, non-WAITING
 * room containing a disconnected occupant this joiner may legitimately
 * resume, reusing the reconnect eligibility rules through
 * isPairingReconnectRoutingEligible so the two paths never diverge. Only
 * ROUTING happens here — the predicate cannot return a seat by construction.
 * The room's own mid-duel JOIN door then resolves the joiner's identity and
 * decides the re-seat, holding the room's mutex across both so the check and
 * the seat change are atomic.
 *
 * Non-pairing joins identify a room by the exact (name, password) pair
 * (findByNameAndPassword: first-match, state-blind). A matching pair is
 * reused regardless of state (spectating a passworded room mid-duel keeps
 * working); no matching pair creates a new room under that name and
 * password, even when other rooms already share the name under a different
 * password. This function never returns null.
 */
export function findOrCreateRoom(
	ctx: JoinContext,
	{ rankedOverride }: FindOrCreateRoomOptions,
): YGOProRoom {
	if (isPairingJoin(ctx)) {
		// A guest is a joiner with neither a resolved (ticket) identity nor a PIN
		// in its player info; mirrors CredentialResolver.resolve's guest
		// fallthrough. Only guests are hard-rejected by a ranked league
		// (RoomAdmission: ranked + guest → rejected, not spectator), so only
		// guests need the league filter — non-guests keep pairing unchanged.
		const isGuestJoiner = !ctx.socket.resolvedUserId && !ctx.playerInfo.password;

		// Routing only: a PIN cannot be resolved synchronously here, so this
		// predicate never sees an identity and can never return a seat. The
		// room's mid-duel JOIN door resolves the joiner's identity and is the
		// sole authority over the seat.
		const reconnectTarget = YGOProRoomList.findPairingReconnectTarget(ctx.command, (room) =>
			isPairingReconnectRoutingEligible({
				players: room.players,
				name: ctx.playerInfo.name,
				remoteAddress: ctx.socket.remoteAddress,
				ranked: room.ranked,
			}),
		);
		if (reconnectTarget) {
			return reconnectTarget;
		}

		const joinable = YGOProRoomList.findJoinableByName(ctx.command, {
			requireEmptyPassword: true,
			excludeRankedForGuest: isGuestJoiner,
		});
		if (joinable) {
			return joinable;
		}
		return createRoom(ctx, rankedOverride, "pairing");
	}

	const existingRoom = YGOProRoomList.findByNameAndPassword(ctx.command, ctx.password);
	if (existingRoom) {
		return existingRoom;
	}

	return createRoom(ctx, rankedOverride, "non-pairing");
}

function createRoom(
	ctx: JoinContext,
	rankedOverride: boolean | undefined,
	path: "pairing" | "non-pairing",
): YGOProRoom {
	const room = YGOProRoom.create(
		generateUnusedRoomId(),
		ctx.rawPass,
		ctx.logger,
		ctx.eventEmitter,
		ctx.playerInfo,
		ctx.socketId,
		ctx.messageRepository,
		rankedOverride,
	);
	YGOProRoomList.addRoom(room);
	room.waiting();

	ctx.logger.info(`Created room "${room.name}" via ${path} path (no existing room to reuse)`);

	return room;
}
