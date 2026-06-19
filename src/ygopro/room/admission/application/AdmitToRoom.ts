import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { Logger } from "@shared/logger/domain/Logger";
import { Admission, AdmissionRejection } from "@shared/room/admission/domain/Admission";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";
import { RoomAdmission } from "@shared/room/admission/domain/RoomAdmission";
import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";
import { Seat } from "@shared/room/admission/domain/Seat";
import { ISocket } from "@shared/socket/domain/ISocket";

import { CredentialResolver } from "./CredentialResolver";

/**
 * What AdmitToRoom needs from the room to EXECUTE a decision. The room (or an
 * adapter around it) implements this; the use case never touches sockets,
 * wire messages or persistence — that keeps it transport-agnostic and testable
 * (Dependency Inversion).
 */
export interface AdmissionTarget {
	readonly league: RoomLeague;
	freeSeat(): Seat | null;
	seatPlayer(credential: PlayerCredential, seat: Seat): Promise<void>;
	admitSpectator(credential: PlayerCredential): Promise<void>;
	rejectAdmission(reason: AdmissionRejection): void;
}

/**
 * The single guard that decides AND applies how a connecting client is admitted
 * to a room. Reused at both doors — the JOIN and the spectator→player switch —
 * so the rule "sitting down always passes admission" cannot be bypassed.
 *
 * Flow: resolve identity once → ask the pure policy → apply the outcome on the
 * target. The contract itself lives in RoomAdmission; this only wires it up.
 */
export class AdmitToRoom {
	constructor(
		private readonly resolver: CredentialResolver,
		private readonly admission: RoomAdmission,
		private readonly logger?: Logger,
	) {}

	async run(
		socket: ISocket,
		playerInfo: PlayerInfoMessage,
		target: AdmissionTarget,
	): Promise<Admission> {
		const credential = await this.resolver.resolve(socket, playerInfo);
		const result = this.admission.decide(credential, {
			league: target.league,
			freeSeat: target.freeSeat(),
		});

		this.logger?.debug(
			`admission/decision: credential=${credential.kind} league=${target.league.type} decision=${result.kind}${
				result.kind === "rejected" ? ` reason=${result.reason}` : ""
			}`,
		);

		switch (result.kind) {
			case "player":
				await target.seatPlayer(result.credential, result.seat);
				break;
			case "spectator":
				await target.admitSpectator(credential);
				break;
			case "rejected":
				target.rejectAdmission(result.reason);
				break;
		}

		return result;
	}
}
