import { AdmissionRejection } from "@shared/room/admission/domain/Admission";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";
import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";
import { Seat } from "@shared/room/admission/domain/Seat";

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
