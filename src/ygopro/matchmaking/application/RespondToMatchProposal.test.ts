import { mock, MockProxy } from "jest-mock-extended";

import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";

import { MatchmakingPool } from "../domain/MatchmakingPool";
import { ParticipantChannel } from "../domain/ParticipantChannel";
import { RespondToMatchProposal } from "./RespondToMatchProposal";

describe("RespondToMatchProposal", () => {
	let pool: MockProxy<MatchmakingPool>;
	let channel: MockProxy<ParticipantChannel>;
	let logger: LoggerMock;
	let socket: SocketMock;
	let useCase: RespondToMatchProposal;

	beforeEach(() => {
		pool = mock<MatchmakingPool>();
		channel = mock<ParticipantChannel>();
		logger = new LoggerMock();
		socket = new SocketMock();
		socket.id = "sock-1";
		useCase = new RespondToMatchProposal(pool, logger);
	});

	it("forwards an ACCEPT for this connection's participant and sends nothing on success", () => {
		pool.accept.mockReturnValue("accepted");

		useCase.execute({ socket, channel, matchId: "match-1", response: "accept" });

		expect(pool.accept).toHaveBeenCalledWith("match-1", "sock-1");
		expect(pool.decline).not.toHaveBeenCalled();
		expect(channel.status).not.toHaveBeenCalled();
	});

	it("forwards a DECLINE for this connection's participant and sends nothing on success", () => {
		pool.decline.mockReturnValue("declined");

		useCase.execute({ socket, channel, matchId: "match-1", response: "decline" });

		expect(pool.decline).toHaveBeenCalledWith("match-1", "sock-1");
		expect(pool.accept).not.toHaveBeenCalled();
		expect(channel.status).not.toHaveBeenCalled();
	});

	it.each([
		{ response: "accept" as const, opcode: "ACCEPT" },
		{ response: "decline" as const, opcode: "DECLINE" },
	])("rejects a $opcode for an unknown match with a status reply and a warning", ({
		response,
		opcode,
	}) => {
		pool.accept.mockReturnValue("unknown_match");
		pool.decline.mockReturnValue("unknown_match");
		const warnSpy = jest.spyOn(logger, "warn");

		useCase.execute({ socket, channel, matchId: "match-404", response });

		expect(channel.status).toHaveBeenCalledWith({
			state: "rejected",
			waitedMs: 0,
			reason: "unknown_match",
		});
		expect(warnSpy).toHaveBeenCalledWith("matchmaking.rejected", {
			reason: "unknown_match",
			opcode,
		});
	});
});
