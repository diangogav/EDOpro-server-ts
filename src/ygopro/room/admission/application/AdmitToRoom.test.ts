import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";
import { RoomAdmission } from "@shared/room/admission/domain/RoomAdmission";
import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";
import { Seat } from "@shared/room/admission/domain/Seat";
import { ISocket } from "@shared/socket/domain/ISocket";

import { AdmissionTarget } from "../domain/AdmissionTarget";
import { AdmitToRoom } from "./AdmitToRoom";
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
		resolver = { resolveForAdmission: jest.fn() } as unknown as jest.Mocked<CredentialResolver>;
		admit = new AdmitToRoom(resolver, new RoomAdmission(), undefined, false);
	});

	it("seats a matching player when there is a free seat", async () => {
		resolver.resolveForAdmission.mockResolvedValue({
			credential: verified,
			accountVerified: false,
		});
		const seat = new Seat(0, 0);
		const target = makeTarget(RoomLeague.Verified, seat);

		const result = await admit.run(socket, playerInfo, target);

		expect(target.seatPlayer).toHaveBeenCalledWith(verified, seat);
		expect(target.admitSpectator).not.toHaveBeenCalled();
		expect(result.kind).toBe("player");
	});

	it("admits as spectator when the method is wrong for the league", async () => {
		resolver.resolveForAdmission.mockResolvedValue({
			credential: external,
			accountVerified: false,
		}); // external in a Verified room
		const target = makeTarget(RoomLeague.Verified, new Seat(0, 0));

		const result = await admit.run(socket, playerInfo, target);

		expect(target.admitSpectator).toHaveBeenCalledWith(external);
		expect(target.seatPlayer).not.toHaveBeenCalled();
		expect(result.kind).toBe("spectator");
	});

	it("rejects a guest from a ranked room", async () => {
		resolver.resolveForAdmission.mockResolvedValue({ credential: guest, accountVerified: false });
		const target = makeTarget(RoomLeague.Verified, new Seat(0, 0));

		const result = await admit.run(socket, playerInfo, target);

		expect(target.rejectAdmission).toHaveBeenCalledWith("ranked-requires-account");
		expect(target.seatPlayer).not.toHaveBeenCalled();
		expect(target.admitSpectator).not.toHaveBeenCalled();
		expect(result.kind).toBe("rejected");
	});

	it("seats a guest in a casual room (no free-seat check skipped)", async () => {
		resolver.resolveForAdmission.mockResolvedValue({ credential: guest, accountVerified: false });
		const seat = new Seat(1, 1);
		const target = makeTarget(RoomLeague.Casual, seat);

		const result = await admit.run(socket, playerInfo, target);

		expect(target.seatPlayer).toHaveBeenCalledWith(guest, seat);
		expect(result.kind).toBe("player");
	});
	describe("with the verified-account switch on", () => {
		beforeEach(() => {
			admit = new AdmitToRoom(resolver, new RoomAdmission(), undefined, true);
		});

		it("rejects an unverified account from a ranked room", async () => {
			resolver.resolveForAdmission.mockResolvedValue({
				credential: verified,
				accountVerified: false,
			});
			const target = makeTarget(RoomLeague.Verified, new Seat(0, 0));

			const result = await admit.run(socket, playerInfo, target);

			expect(target.rejectAdmission).toHaveBeenCalledWith("ranked-requires-verified-account");
			expect(target.seatPlayer).not.toHaveBeenCalled();
			expect(target.admitSpectator).not.toHaveBeenCalled();
			expect(result).toEqual({ kind: "rejected", reason: "ranked-requires-verified-account" });
		});

		it("seats a verified account in a ranked room", async () => {
			resolver.resolveForAdmission.mockResolvedValue({
				credential: verified,
				accountVerified: true,
			});
			const seat = new Seat(0, 0);
			const target = makeTarget(RoomLeague.Verified, seat);

			await admit.run(socket, playerInfo, target);

			expect(target.seatPlayer).toHaveBeenCalledWith(verified, seat);
		});

		it("seats an unverified account in a casual room", async () => {
			resolver.resolveForAdmission.mockResolvedValue({
				credential: verified,
				accountVerified: false,
			});
			const seat = new Seat(0, 0);
			const target = makeTarget(RoomLeague.Casual, seat);

			await admit.run(socket, playerInfo, target);

			expect(target.seatPlayer).toHaveBeenCalledWith(verified, seat);
		});

		it("still rejects a guest with ranked-requires-account", async () => {
			resolver.resolveForAdmission.mockResolvedValue({ credential: guest, accountVerified: false });
			const target = makeTarget(RoomLeague.Verified, new Seat(0, 0));

			await admit.run(socket, playerInfo, target);

			expect(target.rejectAdmission).toHaveBeenCalledWith("ranked-requires-account");
		});
	});

	it("seats an unverified account in a ranked room when the switch is off", async () => {
		resolver.resolveForAdmission.mockResolvedValue({
			credential: verified,
			accountVerified: false,
		});
		const seat = new Seat(0, 0);
		const target = makeTarget(RoomLeague.Verified, seat);

		await admit.run(socket, playerInfo, target);

		expect(target.seatPlayer).toHaveBeenCalledWith(verified, seat);
	});
});
