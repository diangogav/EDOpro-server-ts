import { mock } from "jest-mock-extended";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { ISocket } from "@shared/socket/domain/ISocket";
import { Seat } from "@shared/room/admission/domain/Seat";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";
import { lobbyMetadata } from "./LobbyMetadata";

jest.mock("@ygopro/SimpleRoomMessageEmitter");
const playerInfo = { name: "Invited", password: "" } as never;
const credential = { kind: "verified" as const, userId: "user" };

describe("YGOProRoom invitations", () => {
	it("rejects instead of spectating when the last seat is taken after routing", async () => {
		const room = YGOProRoomMother.create({ command: "casual" });
		const socket = mock<ISocket>({ inviteForRoomId: room.id, closed: false });
		const target = room.admissionTarget(socket, playerInfo);
		jest.spyOn(room, "hasFreeSeat").mockReturnValue(false);
		expect(target.freeSeat()).toBeNull();
		await target.admitSpectator(credential);
		expect(room.spectators).toHaveLength(0);
		expect(socket.close).toHaveBeenCalled();
	});
	it("rejects late seat completion after the lobby has started", async () => {
		const room = YGOProRoomMother.create({ command: "casual" });
		const socket = mock<ISocket>({ inviteForRoomId: room.id, closed: false });
		const target = room.admissionTarget(socket, playerInfo);
		room.rps();
		await target.seatPlayer(credential, new Seat(0, 0));
		expect(room.players).toHaveLength(0);
		expect(socket.close).toHaveBeenCalled();
	});
	it("rejects a league mismatch rather than silently becoming a spectator", async () => {
		const room = YGOProRoomMother.create({ command: "casual" });
		const socket = mock<ISocket>({ inviteForRoomId: room.id });
		await room.admissionTarget(socket, playerInfo).admitSpectator(credential);
		expect(room.spectators).toHaveLength(0);
		expect(socket.close).toHaveBeenCalled();
	});
	it.each([false, true])("sends metadata only when negotiated (%s)", async (negotiated) => {
		const room = YGOProRoomMother.create({ command: "casual" });
		const socket = mock<ISocket>({ supportsLobbyMetadata: negotiated, closed: false });
		await room.admissionTarget(socket, playerInfo).seatPlayer(credential, new Seat(0, 0));
		const frames = socket.send.mock.calls.map(([frame]) => frame);
		expect(frames.some((frame) => frame.equals(lobbyMetadata(room.inviteId)))).toBe(negotiated);
	});
	it("excludes private and reserved rooms from public invite discovery", () => {
		const privateRoom = YGOProRoomMother.create({ command: "casual#secret" });
		expect(privateRoom.toRoomListDTO().inviteId).toBeNull();
		const room = YGOProRoomMother.create({ command: "casual" });
		room.reservedUserIds = ["user"];
		expect(room.toRoomListDTO().inviteId).toBeNull();
	});
	it.each([
		"private",
		"reserved",
		"matchmaking",
	])("never sends invitation metadata for %s seats", async (kind) => {
		const room = YGOProRoomMother.create({
			command: kind === "private" ? "casual#secret" : "casual",
		});
		if (kind === "reserved") room.reservedUserIds = ["user"];
		if (kind === "matchmaking") room.isMatchmaking = true;
		const socket = mock<ISocket>({ supportsLobbyMetadata: true, closed: false });
		await room.admissionTarget(socket, playerInfo).seatPlayer(credential, new Seat(0, 0));
		expect(
			socket.send.mock.calls.some(([frame]) => frame.equals(lobbyMetadata(room.inviteId))),
		).toBe(false);
	});
	it("publishes metadata when an admitted spectator later takes a player seat", async () => {
		const room = YGOProRoomMother.create({ command: "casual" });
		const socket = mock<ISocket>({ supportsLobbyMetadata: true, closed: false });
		await room.admissionTarget(socket, playerInfo).admitSpectator(credential);
		expect(
			socket.send.mock.calls.some(([frame]) => frame.equals(lobbyMetadata(room.inviteId))),
		).toBe(false);
		room.spectatorToPlayerUnsafe(room.spectators[0] as YGOProClient);
		expect(
			socket.send.mock.calls.some(([frame]) => frame.equals(lobbyMetadata(room.inviteId))),
		).toBe(true);
	});
	it("publishes the same public instance identity in metadata and room discovery", () => {
		const room = YGOProRoomMother.create({ command: "t,casual" });
		expect(room.toRoomListDTO().inviteId).toBe(room.inviteId);
		expect(room.toRoomListDTO().maxPlayers).toBe(4);
	});
});
