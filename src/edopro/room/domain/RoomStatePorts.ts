import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { Deck } from "@shared/deck/domain/Deck";
import { DeckRules } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";

import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { DuelFinishReason } from "./DuelFinishReason";
import { Room } from "./Room";

/**
 * What the EDOPro room states need from the application layer. Room wires the
 * implementations (Reconnect, JoinToDuelAsSpectator, DeckCreator,
 * AuthenticatePlayer, FinishDuelHandler) when it builds each state.
 */

/** Puts a returning player back in their seat (Reconnect). */
export interface PlayerReconnector {
	run(
		playerInfoMessage: PlayerInfoMessage,
		player: Client,
		joinMessage: JoinGameMessage,
		socket: ISocket,
		room: Room,
	): Promise<void>;
}

/** Joins a socket to a running duel as a spectator (JoinToDuelAsSpectator). */
export interface SpectatorJoiner {
	run(
		joinMessage: JoinGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		socket: ISocket,
		room: Room,
	): Promise<void>;
}

/** Builds and validates a player's deck (DeckCreator). */
export interface DeckBuilder {
	build(params: { main: number[]; side: number[]; banListHash: number }): Promise<Deck>;
}

/** Resolves the account behind a ranked join, or null when it is rejected (AuthenticatePlayer). */
export interface PlayerAuthenticator {
	run(playerInfo: PlayerInfoMessage, socket: ISocket): Promise<UserProfile | null>;
}

/** Ends the current duel and moves the room on (FinishDuelHandler). */
export type FinishDuel = (params: {
	reason: DuelFinishReason;
	winner: number;
	room: Room;
}) => Promise<void>;

/**
 * Everything a Room builds its states and timers from. createEdoproRoomDeps
 * wires the application implementations; each factory runs at the moment the
 * room needs a fresh collaborator, as Room used to construct them inline.
 */
export interface EdoproRoomDeps {
	finishDuel: FinishDuel;
	/** Takes an expired room out of the room list. */
	removeRoom(room: Room): void;
	createReconnector(): PlayerReconnector;
	createSpectatorJoiner(): SpectatorJoiner;
	createPlayerAuthenticator(): PlayerAuthenticator;
	createDeckBuilder(deckRules: DeckRules, duelFlag: bigint): DeckBuilder;
}
