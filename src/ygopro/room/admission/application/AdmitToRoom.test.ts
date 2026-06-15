import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";
import { RoomAdmission } from "@shared/room/admission/domain/RoomAdmission";
import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";
import { Seat } from "@shared/room/admission/domain/Seat";
import { ISocket } from "@shared/socket/domain/ISocket";

import { AdmissionTarget, AdmitToRoom } from "./AdmitToRoom";
import { CredentialResolver } from "./CredentialResolver";

const socket = {} as ISocket;
const playerInfo = { name: "P", password: null } as unknown as PlayerInfoMessage;

const verified: PlayerCredential = { kind: "verified", userId: "u-1" };
const external: PlayerCredential = { kind: "external", userId: "u-2" };
const guest: PlayerCredential = { kind: "guest", name: "P" };

const makeTarget = (league: RoomLeague, freeSeat: Seat | null): jest.Mocked<AdmissionTarget> =>
	({
		league,
		freeSeat: jest.fn().mockReturnValue(freeSeat),
		seatPlayer: jest.fn(),
		admitSpectator: jest.fn(),
		rejectAdmission: jest.fn(),
	}) as unknown as jest.Mocked<AdmissionTarget>;

describe("AdmitToRoom", () => {
	let resolver: jest.Mocked<CredentialResolver>;
	let admit: AdmitToRoom;

	beforeEach(() => {
		resolver = { resolve: jest.fn() } as unknown as jest.Mocked<CredentialResolver>;
		admit = new AdmitToRoom(resolver, new RoomAdmission());
	});

	it("seats a matching player when there is a free seat", async () => {
		resolver.resolve.mockResolvedValue(verified);
		const seat = new Seat(0, 0);
		const target = makeTarget(RoomLeague.Verified, seat);

		const result = await admit.run(socket, playerInfo, target);

		expect(target.seatPlayer).toHaveBeenCalledWith(verified, seat);
		expect(target.admitSpectator).not.toHaveBeenCalled();
		expect(result.kind).toBe("player");
	});

	it("admits as spectator when the method is wrong for the league", async () => {
		resolver.resolve.mockResolvedValue(external); // external in a Verified room
		const target = makeTarget(RoomLeague.Verified, new Seat(0, 0));

		const result = await admit.run(socket, playerInfo, target);

		expect(target.admitSpectator).toHaveBeenCalledWith(external);
		expect(target.seatPlayer).not.toHaveBeenCalled();
		expect(result.kind).toBe("spectator");
	});

	it("rejects a guest from a ranked room", async () => {
		resolver.resolve.mockResolvedValue(guest);
		const target = makeTarget(RoomLeague.Verified, new Seat(0, 0));

		const result = await admit.run(socket, playerInfo, target);

		expect(target.rejectAdmission).toHaveBeenCalledWith("ranked-requires-account");
		expect(target.seatPlayer).not.toHaveBeenCalled();
		expect(target.admitSpectator).not.toHaveBeenCalled();
		expect(result.kind).toBe("rejected");
	});

	it("seats a guest in a casual room (no free-seat check skipped)", async () => {
		resolver.resolve.mockResolvedValue(guest);
		const seat = new Seat(1, 1);
		const target = makeTarget(RoomLeague.Casual, seat);

		const result = await admit.run(socket, playerInfo, target);

		expect(target.seatPlayer).toHaveBeenCalledWith(guest, seat);
		expect(result.kind).toBe("player");
	});
});
