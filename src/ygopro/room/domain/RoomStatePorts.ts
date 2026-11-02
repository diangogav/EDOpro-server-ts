import { CardRepository } from "@shared/card/domain/CardRepository";
import { Deck } from "@shared/deck/domain/Deck";
import { DeckError } from "@shared/deck/domain/errors/DeckError";
import { Logger } from "@shared/logger/domain/Logger";
import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { ReservedDuelAbandon } from "@shared/reserved-duel/domain/ReservedDuelRepository";
import { Admission } from "@shared/room/admission/domain/Admission";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";
import { DeckRules } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";

import { AdmissionTarget } from "../admission/domain/AdmissionTarget";
import { YGOProRoom } from "./YGOProRoom";

/**
 * What the YGOPro room states need from the application layer. YGOProRoom
 * wires the implementations (YGOProDeckCreator, AdmitToRoom,
 * AbandonBetweenDuels, FinalizeYGOProRoom) when it builds each state.
 */

/** Builds and validates a player's deck (YGOProDeckCreator). */
export interface YGOProDeckBuilder {
	build(params: { main: number[]; side: number[]; banListHash: number }): Promise<Deck | DeckError>;
}

/** Decides and applies how a joining client enters the room (AdmitToRoom). */
export interface PlayerAdmission {
	run(socket: ISocket, playerInfo: PlayerInfoMessage, target: AdmissionTarget): Promise<Admission>;
}

/** Ends the match for a team that left between duels (AbandonBetweenDuels). */
export interface MatchAbandonment {
	resolve(room: YGOProRoom, abandoningTeam: number, logger: Logger): Promise<void>;
}

/** Closes the room once the match is over (FinalizeYGOProRoom). */
export interface RoomFinalizer {
	run(room: YGOProRoom, abandon?: ReservedDuelAbandon): void;
}

/** Resolves who is behind a joining socket (CredentialResolver). */
export interface JoinerCredentialResolver {
	resolve(socket: ISocket, playerInfo: PlayerInfoMessage): Promise<PlayerCredential>;
}

/**
 * Everything a YGOProRoom builds its states from. createYGOProRoomDeps wires
 * the application implementations; each factory runs at the moment the room
 * needs a fresh collaborator, as YGOProRoom used to construct them inline.
 */
export interface YGOProRoomDeps {
	createCardRepository(cardPool: string): CardRepository;
	createDeckBuilder(
		cardRepository: CardRepository,
		deckRules: DeckRules,
		logger: Logger,
	): YGOProDeckBuilder;
	createPlayerAdmission(logger: Logger): PlayerAdmission;
	createCredentialResolver(logger: Logger): JoinerCredentialResolver;
	abandonment: MatchAbandonment;
	finalizer: RoomFinalizer;
}
