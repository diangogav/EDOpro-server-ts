import { EventEmitter } from "stream";

import { mock } from "jest-mock-extended";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";

import { ParticipantChannel } from "../domain/ParticipantChannel";
import { Session } from "../domain/Session";
import { AuthenticateMatchmakingSession } from "./AuthenticateMatchmakingSession";
import { CancelMatchmaking } from "./CancelMatchmaking";
import { EnterMatchmaking } from "./EnterMatchmaking";
import { MatchmakingConnectionHandler } from "./MatchmakingConnectionHandler";
import { RespondToMatchProposal } from "./RespondToMatchProposal";

const makeMessage = (data: Buffer): ClientMessage => ({ data }) as unknown as ClientMessage;

function buildAuthBody(ticket: string): Buffer {
	const ticketBytes = Buffer.from(ticket, "utf8");

	return Buffer.concat([Buffer.from([ticketBytes.length]), ticketBytes]);
}

function buildEnterBody(formatCode: number, modeCode: number, clientVersion: number): Buffer {
	const body = Buffer.alloc(4);
	body.writeUInt8(formatCode, 0);
	body.writeUInt8(modeCode, 1);
	body.writeUInt16LE(clientVersion, 2);

	return body;
}

describe("MatchmakingConnectionHandler", () => {
	let eventEmitter: EventEmitter;
	let socket: SocketMock;
	let session: Session;
	let channel: ReturnType<typeof mock<ParticipantChannel>>;
	let authenticate: ReturnType<typeof mock<AuthenticateMatchmakingSession>>;
	let enter: ReturnType<typeof mock<EnterMatchmaking>>;
	let cancel: ReturnType<typeof mock<CancelMatchmaking>>;
	let respond: ReturnType<typeof mock<RespondToMatchProposal>>;
	let logger: LoggerMock;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		socket = new SocketMock();
		session = new Session(socket);
		channel = mock<ParticipantChannel>();
		authenticate = mock<AuthenticateMatchmakingSession>();
		enter = mock<EnterMatchmaking>();
		cancel = mock<CancelMatchmaking>();
		respond = mock<RespondToMatchProposal>();
		logger = new LoggerMock();

		new MatchmakingConnectionHandler(
			eventEmitter,
			socket,
			session,
			channel,
			authenticate,
			enter,
			cancel,
			logger,
			respond,
		);
	});

	it("subscribes to PLAYER_INFO and the five CTOS matchmaking opcodes exactly once", () => {
		expect(eventEmitter.listenerCount(Commands.PLAYER_INFO as unknown as string)).toBe(1);
		expect(eventEmitter.listenerCount(Commands.MATCHMAKING_AUTH as unknown as string)).toBe(1);
		expect(eventEmitter.listenerCount(Commands.MATCHMAKING_ENTER as unknown as string)).toBe(1);
		expect(eventEmitter.listenerCount(Commands.MATCHMAKING_CANCEL as unknown as string)).toBe(1);
		expect(eventEmitter.listenerCount(Commands.MATCHMAKING_ACCEPT as unknown as string)).toBe(1);
		expect(eventEmitter.listenerCount(Commands.MATCHMAKING_DECLINE as unknown as string)).toBe(1);
	});

	it("leaves ACCEPT and DECLINE unsubscribed when no proposal responder is wired", () => {
		const bare = new EventEmitter();

		new MatchmakingConnectionHandler(
			bare,
			socket,
			session,
			channel,
			authenticate,
			enter,
			cancel,
			logger,
		);

		expect(bare.listenerCount(Commands.MATCHMAKING_ACCEPT as unknown as string)).toBe(0);
		expect(bare.listenerCount(Commands.MATCHMAKING_DECLINE as unknown as string)).toBe(0);
	});

	it("captures PLAYER_INFO bytes into the session", () => {
		const body = Buffer.from("Yugi", "utf16le");

		eventEmitter.emit(Commands.PLAYER_INFO as unknown as string, makeMessage(body));

		expect(session.playerInfo?.name).toBe("Yugi");
	});

	it("keeps PLAYER_INFO reaching every other listener on the connection emitter", () => {
		const roomJoinListener = jest.fn();
		eventEmitter.on(Commands.PLAYER_INFO as unknown as string, roomJoinListener);
		const body = Buffer.from("Kaiba", "utf16le");

		eventEmitter.emit(Commands.PLAYER_INFO as unknown as string, makeMessage(body));

		expect(roomJoinListener).toHaveBeenCalledTimes(1);
		expect(session.playerInfo?.name).toBe("Kaiba");
	});

	describe("MATCHMAKING_AUTH", () => {
		it("rejects a malformed frame with a status reply, logs it, and never invokes the use case", () => {
			const warnSpy = jest.spyOn(logger, "warn");

			eventEmitter.emit(
				Commands.MATCHMAKING_AUTH as unknown as string,
				makeMessage(Buffer.alloc(0)),
			);

			expect(channel.status).toHaveBeenCalledWith({
				state: "rejected",
				waitedMs: 0,
				reason: "malformed_frame",
			});
			expect(authenticate.execute).not.toHaveBeenCalled();
			expect(warnSpy).toHaveBeenCalledWith("matchmaking.rejected", {
				reason: "malformed_frame",
				opcode: "AUTH",
			});
		});

		it("routes a well-formed frame to AuthenticateMatchmakingSession with the parsed ticket", () => {
			eventEmitter.emit(
				Commands.MATCHMAKING_AUTH as unknown as string,
				makeMessage(buildAuthBody("11111111-1111-4111-8111-111111111111")),
			);

			expect(authenticate.execute).toHaveBeenCalledWith({
				ticket: "11111111-1111-4111-8111-111111111111",
				remoteAddress: socket.remoteAddress,
				session,
				channel,
			});
		});
	});

	describe("MATCHMAKING_ENTER", () => {
		it("rejects a malformed frame with a status reply and never invokes the use case", () => {
			eventEmitter.emit(
				Commands.MATCHMAKING_ENTER as unknown as string,
				makeMessage(Buffer.alloc(3)),
			);

			expect(channel.status).toHaveBeenCalledWith({
				state: "rejected",
				waitedMs: 0,
				reason: "malformed_frame",
			});
			expect(enter.execute).not.toHaveBeenCalled();
		});

		it("rejects an out-of-range format byte with its own reason and never invokes the use case", () => {
			eventEmitter.emit(
				Commands.MATCHMAKING_ENTER as unknown as string,
				makeMessage(buildEnterBody(0xff, 0, 1)),
			);

			expect(channel.status).toHaveBeenCalledWith({
				state: "rejected",
				waitedMs: 0,
				reason: "unknown_format",
			});
			expect(enter.execute).not.toHaveBeenCalled();
		});

		it("routes a well-formed frame to EnterMatchmaking with the parsed format, mode, and version", () => {
			eventEmitter.emit(
				Commands.MATCHMAKING_ENTER as unknown as string,
				makeMessage(buildEnterBody(1, 0, 1234)),
			);

			expect(enter.execute).toHaveBeenCalledWith({
				socket,
				session,
				channel,
				format: "jtp",
				mode: "ranked",
				clientVersion: 1234,
			});
		});

		it("forwards the bot fallback delay from an eight-byte frame", () => {
			const delay = Buffer.alloc(4);
			delay.writeUInt32LE(90_000, 0);
			eventEmitter.emit(
				Commands.MATCHMAKING_ENTER as unknown as string,
				makeMessage(Buffer.concat([buildEnterBody(0, 0, 1234), delay])),
			);

			expect(enter.execute).toHaveBeenCalledWith(
				expect.objectContaining({ botFallbackAfterMs: 90_000 }),
			);
		});

		it("forwards the accept-step opt-in from a five-byte frame", () => {
			eventEmitter.emit(
				Commands.MATCHMAKING_ENTER as unknown as string,
				makeMessage(Buffer.concat([buildEnterBody(0, 0, 1234), Buffer.from([1])])),
			);

			expect(enter.execute).toHaveBeenCalledWith(
				expect.objectContaining({ supportsAcceptStep: true }),
			);
		});

		it("rejects an accept-step byte other than 0 or 1 as malformed and never invokes the use case", () => {
			eventEmitter.emit(
				Commands.MATCHMAKING_ENTER as unknown as string,
				makeMessage(Buffer.concat([buildEnterBody(0, 0, 1234), Buffer.from([2])])),
			);

			expect(channel.status).toHaveBeenCalledWith({
				state: "rejected",
				waitedMs: 0,
				reason: "malformed_frame",
			});
			expect(enter.execute).not.toHaveBeenCalled();
		});
	});

	describe.each([
		{ command: Commands.MATCHMAKING_ACCEPT, response: "accept", opcode: "ACCEPT" },
		{ command: Commands.MATCHMAKING_DECLINE, response: "decline", opcode: "DECLINE" },
	])("MATCHMAKING_$opcode", ({ command, response, opcode }) => {
		it("routes a well-formed frame to RespondToMatchProposal with the parsed match id", () => {
			eventEmitter.emit(command as unknown as string, makeMessage(buildAuthBody("match-1")));

			expect(respond.execute).toHaveBeenCalledWith({
				socket,
				channel,
				matchId: "match-1",
				response,
			});
		});

		it("rejects a malformed frame with a status reply and never invokes the use case", () => {
			const warnSpy = jest.spyOn(logger, "warn");

			eventEmitter.emit(command as unknown as string, makeMessage(Buffer.alloc(0)));

			expect(channel.status).toHaveBeenCalledWith({
				state: "rejected",
				waitedMs: 0,
				reason: "malformed_frame",
			});
			expect(warnSpy).toHaveBeenCalledWith("matchmaking.rejected", {
				reason: "malformed_frame",
				opcode,
			});
			expect(respond.execute).not.toHaveBeenCalled();
		});
	});

	describe("MATCHMAKING_CANCEL", () => {
		it("rejects a malformed frame with a status reply and never invokes the use case", () => {
			eventEmitter.emit(
				Commands.MATCHMAKING_CANCEL as unknown as string,
				makeMessage(Buffer.alloc(1)),
			);

			expect(channel.status).toHaveBeenCalledWith({
				state: "rejected",
				waitedMs: 0,
				reason: "malformed_frame",
			});
			expect(cancel.execute).not.toHaveBeenCalled();
		});

		it("routes an empty frame to CancelMatchmaking", () => {
			eventEmitter.emit(
				Commands.MATCHMAKING_CANCEL as unknown as string,
				makeMessage(Buffer.alloc(0)),
			);

			expect(cancel.execute).toHaveBeenCalledWith({ socket, session, channel });
		});
	});
});
