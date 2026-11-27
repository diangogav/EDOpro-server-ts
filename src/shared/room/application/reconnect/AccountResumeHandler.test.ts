import { EventEmitter } from "stream";

import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ReconnectionTokenIssuer } from "@shared/room/domain/reconnect/ReconnectionTokenIssuer";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";

import { ResumeInfo } from "@shared/messages/server-to-client/ResumeInfoClientMessage";
import { AccountSeat } from "@shared/room/domain/reconnect/findSeatOfUser";

import { AccountResumeHandler, AccountResumeRoute } from "./AccountResumeHandler";

const FAILURE_ACK = Buffer.from([0x02, 0x00, 0xfd, 0x01]);
const INFO: ResumeInfo = {
	banListName: "2026.10 TCG",
	score: { own: 1, opponent: 0 },
	edoproRoom: false,
	deck: null,
};

const makeClient = (): YgoClient => {
	let token: string | null = null;
	return {
		name: "Alice",
		setReconnectionToken: (value: string) => {
			token = value;
		},
		clearReconnectionToken: () => {
			token = null;
		},
		get reconnectionToken() {
			return token;
		},
	} as unknown as YgoClient;
};

describe("AccountResumeHandler", () => {
	let emitter: EventEmitter;
	let socket: jest.Mocked<ISocket>;
	let logger: jest.Mocked<Logger>;
	let room: jest.Mocked<YgoRoom>;
	let client: YgoClient;
	let route: jest.Mocked<AccountResumeRoute>;
	let order: string[];

	const resume = () =>
		emitter.emit(
			Commands.RESUME_SEAT as unknown as string,
			{ data: Buffer.alloc(0) } as ClientMessage,
		);

	beforeEach(() => {
		TokenIndex.getInstance().clear();
		order = [];
		emitter = new EventEmitter();
		socket = {
			transport: "ws",
			resolvedUserId: "user-1",
			send: jest.fn(() => order.push("send")),
			destroy: jest.fn(),
		} as unknown as jest.Mocked<ISocket>;
		logger = { info: jest.fn() } as unknown as jest.Mocked<Logger>;
		room = { id: 4, emit: jest.fn(() => order.push("emit")) } as unknown as jest.Mocked<YgoRoom>;
		client = makeClient();
		ReconnectionTokenIssuer.issue(client, 4);
		route = {
			seatOf: jest.fn((userId: string) => (userId === "user-1" ? { client, room } : null)),
			resumeInfoOf: jest.fn((_seat: AccountSeat): ResumeInfo => INFO),
			socketFor: jest.fn((_room: YgoRoom, value: ISocket) => value),
		};
		new AccountResumeHandler(emitter, logger, socket, route);
	});

	afterEach(() => TokenIndex.getInstance().clear());

	it("rotates the token, sends the resume info, then asks the room to re-sync with the new token", () => {
		const old = client.reconnectionToken!;

		resume();

		const token = client.reconnectionToken!;
		expect(token).not.toBe(old);
		expect(TokenIndex.getInstance().find(old)).toBeUndefined();
		const [frame] = socket.send.mock.calls[0]!;
		expect((frame as Buffer)[2]).toBe(0xea);
		expect(JSON.parse((frame as Buffer).subarray(3).toString("utf8"))).toEqual(INFO);
		expect(room.emit).toHaveBeenCalledWith(
			"EXPRESS_RECONNECT",
			expect.objectContaining({ command: Commands.RECONNECT, data: Buffer.from(token, "utf8") }),
			socket,
		);
		expect(order).toEqual(["send", "emit"]);
		expect(socket.destroy).not.toHaveBeenCalled();
	});

	it("hands the room the socket the route adapted for it", () => {
		const adapted: ISocket = new SocketMock();
		route.socketFor.mockReturnValue(adapted);

		resume();

		expect(room.emit).toHaveBeenCalledWith("EXPRESS_RECONNECT", expect.anything(), adapted);
	});

	it("refuses a connection without an account", () => {
		socket.resolvedUserId = undefined;

		resume();

		expect(route.seatOf).not.toHaveBeenCalled();
		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
	});

	it("refuses an account without a seat and leaves every token as it was", () => {
		socket.resolvedUserId = "user-9";
		const token = client.reconnectionToken;

		resume();

		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
		expect(client.reconnectionToken).toBe(token);
		expect(room.emit).not.toHaveBeenCalled();
	});

	it("logs the attempt on the account path", () => {
		resume();

		expect(logger.info).toHaveBeenCalledWith(
			"reconnect.attempt",
			expect.objectContaining({ path: "account", outcome: "forwarded" }),
		);
	});
});
