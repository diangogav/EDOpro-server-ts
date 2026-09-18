import { mock, MockProxy } from "jest-mock-extended";

import { ISocket } from "@shared/socket/domain/ISocket";

import { MATCHMAKING_FOUND, MATCHMAKING_STATUS } from "../protocol/matchmaking-protocol";
import { SocketParticipantChannel } from "./SocketParticipantChannel";

describe("SocketParticipantChannel", () => {
	let socket: MockProxy<ISocket>;
	let channel: SocketParticipantChannel;

	beforeEach(() => {
		socket = mock<ISocket>({ closed: false });
		channel = new SocketParticipantChannel(socket);
	});

	describe("status", () => {
		it("sends a STATUS frame carrying the update's state and waitedMs, defaulting the reason to none", () => {
			channel.status({ state: "searching", waitedMs: 4000 });

			expect(socket.send).toHaveBeenCalledTimes(1);
			const frame = socket.send.mock.calls[0][0] as Buffer;
			expect(frame.readUInt8(2)).toBe(MATCHMAKING_STATUS);
			expect(frame.readUInt8(3)).toBe(0); // searching
			expect(frame.readUInt32LE(4)).toBe(4000);
			expect(frame.readUInt8(8)).toBe(0); // none
		});

		it("encodes an explicit rejection reason on the same frame", () => {
			channel.status({ state: "rejected", waitedMs: 0, reason: "invalid_ticket" });

			const frame = socket.send.mock.calls[0][0] as Buffer;
			expect(frame.readUInt8(3)).toBe(2); // rejected
			expect(frame.readUInt8(8)).toBe(1); // invalid_ticket
		});
	});

	describe("found", () => {
		it("sends a FOUND frame carrying opponent details and ignores roomPassword", () => {
			channel.found({
				matchId: "match-1",
				roomId: 4242,
				roomPassword: "s3cr3t",
				opponentType: "human",
				rated: true,
				opponentName: "Kaiba",
			});

			expect(socket.send).toHaveBeenCalledTimes(1);
			const frame = socket.send.mock.calls[0][0] as Buffer;
			expect(frame.readUInt8(2)).toBe(MATCHMAKING_FOUND);
			expect(frame.readUInt8(3)).toBe(0); // human
			expect(frame.readUInt8(4)).toBe(1); // rated
			expect(frame.readUInt16LE(5)).toBe(4242);

			const matchIdLen = frame.readUInt8(7);
			expect(frame.subarray(8, 8 + matchIdLen).toString("utf8")).toBe("match-1");
			const nameOffset = 8 + matchIdLen;
			const nameLen = frame.readUInt8(nameOffset);
			expect(frame.subarray(nameOffset + 1, nameOffset + 1 + nameLen).toString("utf8")).toBe(
				"Kaiba",
			);
		});

		it("encodes a bot opponent with no resolvable name as zero name bytes", () => {
			channel.found({
				matchId: "m",
				roomId: 1,
				roomPassword: "",
				opponentType: "bot",
				rated: false,
				opponentName: null,
			});

			const frame = socket.send.mock.calls[0][0] as Buffer;
			const matchIdLen = frame.readUInt8(7);
			expect(frame.readUInt8(3)).toBe(1); // bot
			expect(frame.readUInt8(4)).toBe(0); // not rated
			expect(frame.readUInt8(8 + matchIdLen)).toBe(0);
		});
	});

	describe("close", () => {
		it("sends a rejected STATUS frame for an ordinary rejection reason and closes the socket", () => {
			channel.close("banned");

			expect(socket.send).toHaveBeenCalledTimes(1);
			const frame = socket.send.mock.calls[0][0] as Buffer;
			expect(frame.readUInt8(3)).toBe(2); // rejected
			expect(frame.readUInt8(8)).toBe(10); // banned
			expect(socket.close).toHaveBeenCalledTimes(1);
		});

		it("sends a replaced STATUS frame when a new connection supersedes this one", () => {
			channel.close("replaced_by_new_connection");

			const frame = socket.send.mock.calls[0][0] as Buffer;
			expect(frame.readUInt8(3)).toBe(3); // replaced
			expect(socket.close).toHaveBeenCalledTimes(1);
		});
	});

	describe("isAlive", () => {
		it("is true while the socket is open", () => {
			expect(channel.isAlive(Date.now())).toBe(true);
		});

		it("is false once the socket is closed", () => {
			socket = mock<ISocket>({ closed: true });
			channel = new SocketParticipantChannel(socket);

			expect(channel.isAlive(Date.now())).toBe(false);
		});
	});
});
