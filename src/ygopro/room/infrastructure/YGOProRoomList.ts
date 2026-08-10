import { YGOProRoom } from "../domain/YGOProRoom";
import { DuelState } from "@shared/room/domain/YgoRoom";

const rooms: YGOProRoom[] = [];

/**
 * Extra constraints layered onto findJoinableByName's base scan (name match +
 * WAITING + free seat). Both default to false so existing callers are
 * byte-identical; the pairing feature (findOrCreateRoom) opts into both.
 */
export interface FindJoinableOptions {
	/**
	 * When true, a candidate whose password is non-empty is skipped instead of
	 * being returned and rejected by a post-check — the constraint must be
	 * part of the scan so a passworded same-named room can never shadow a
	 * later passwordless one.
	 */
	requireEmptyPassword?: boolean;
	/**
	 * When true, a candidate whose league would hard-reject a guest
	 * (RoomAdmission: ranked room + guest credential → rejected, not
	 * spectator) is skipped. Only meaningful for a guest joiner — the caller
	 * decides whether the current joiner is a guest and passes this
	 * accordingly; non-guests are never restricted by this flag.
	 */
	excludeRankedForGuest?: boolean;
}

export default {
	addRoom(room: YGOProRoom): void {
		rooms.push(room);
	},

	getRooms(): YGOProRoom[] {
		return rooms;
	},

	/**
	 * Exact (case-sensitive) name match. Returns the FIRST room with that name
	 * and ignores room state — other callers (join strategies' spectate-or-join
	 * path) depend on this exact contract. Do NOT change it; see
	 * findJoinableByName for the state-aware variant used by the pairing feature.
	 */
	findByName(name: string): YGOProRoom | null {
		return rooms.find((room) => room.name === name) ?? null;
	},

	/**
	 * Iterates ALL rooms with an exact (case-sensitive) name match and returns
	 * the first whose state is WAITING and that has a free seat (a lock-free
	 * routing hint — see YGOProRoom.hasFreeSeat). Unlike findByName, order
	 * among same-named rooms does not matter: dueling/full rooms are skipped
	 * instead of shadowing a joinable one further down the list. Returns null
	 * when no same-named room is currently joinable.
	 *
	 * `options` fold extra pairing-only constraints INTO the same scan —
	 * password and league are evaluated per-candidate, not as a post-check on
	 * whatever this returns first, so a disqualified candidate can never
	 * shadow a qualifying one further down the list.
	 */
	findJoinableByName(name: string, options: FindJoinableOptions = {}): YGOProRoom | null {
		return (
			rooms.find(
				(room) =>
					room.name === name &&
					room.duelState === DuelState.WAITING &&
					room.hasFreeSeat() &&
					(!options.requireEmptyPassword || room.password === "") &&
					(!options.excludeRankedForGuest || !room.league.isRanked),
			) ?? null
		);
	},

	/**
	 * Iterates ALL rooms with an exact (case-sensitive) name match and returns
	 * the FIRST whose password also matches exactly, ignoring room state — a
	 * room stays matchable through every duel phase until it is removed from
	 * the list, same as findByName. Two rooms sharing a name are only
	 * distinguishable by this pair; see findOrCreateRoom for the caller that
	 * treats (name, password) as room identity for non-pairing joins.
	 */
	findByNameAndPassword(name: string, password: string): YGOProRoom | null {
		return rooms.find((room) => room.name === name && room.password === password) ?? null;
	},

	/**
	 * Iterates ALL rooms with an exact (case-sensitive) name match, an empty
	 * password, and a state other than WAITING, and returns the first for
	 * which `isEligibleReconnectTarget` reports a matching occupant.
	 * findJoinableByName only ever considers WAITING rooms, so a joiner's own
	 * non-WAITING room (e.g. mid-duel) is otherwise unreachable through the
	 * pairing scan; this lets findOrCreateRoom route a legitimate reconnect
	 * back to that room before falling through to the ordinary pairing scan.
	 */
	findPairingReconnectTarget(
		name: string,
		isEligibleReconnectTarget: (room: YGOProRoom) => boolean,
	): YGOProRoom | null {
		return (
			rooms.find(
				(room) =>
					room.name === name &&
					room.password === "" &&
					room.duelState !== DuelState.WAITING &&
					isEligibleReconnectTarget(room),
			) ?? null
		);
	},

	findById(id: number): YGOProRoom | null {
		return rooms.find((room) => room.id === id) ?? null;
	},

	deleteRoom(room: YGOProRoom): void {
		const index = rooms.findIndex((item) => item.id === room.id);
		if (index !== -1) {
			rooms.splice(index, 1);
		}
	},
};
