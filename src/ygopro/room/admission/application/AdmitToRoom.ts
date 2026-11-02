import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { Logger } from "@shared/logger/domain/Logger";
import { Admission } from "@shared/room/admission/domain/Admission";
import { RoomAdmission } from "@shared/room/admission/domain/RoomAdmission";
import { ISocket } from "@shared/socket/domain/ISocket";

import { AdmissionTarget } from "../domain/AdmissionTarget";
import { CredentialResolver } from "./CredentialResolver";

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
		// This wait is unbounded; the mid-duel states bound the same resolve
		// with resolveJoinerIdentityWithTimeout, and this path does not yet.
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
