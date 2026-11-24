import { EventEmitter } from "stream";

import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { Logger } from "@shared/logger/domain/Logger";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { ISocket } from "@shared/socket/domain/ISocket";
import { config } from "../../../config";

import { ClientMessage } from "@shared/messages/MessageProcessor";
import { UserProfileMother } from "@test-support/mothers/user-profile/UserProfileMother";

import { GameCreatorHandler } from "./GameCreatorHandler";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

jest.mock("@edopro/messages/client-to-server/CreateGameMessage");
jest.mock("@edopro/messages/server-to-client/CreateGameClientMessage");
jest.mock("@edopro/messages/server-to-client/JoinGameClientMessage");

// One-line, colored room-creation notice replacing the old three-clause
// banner (WELCOME - ... - ...). Exercised directly on the private send
// method — mirrors the (state as any).<privateMethod>() pattern already
// used across this codebase's state-machine tests.

const makeLogger = (): jest.Mocked<Logger> =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as unknown as jest.Mocked<Logger>;

const makeSocket = (): jest.Mocked<ISocket> =>
	({
		send: jest.fn(),
	}) as unknown as jest.Mocked<ISocket>;

const makeHandler = (socket: jest.Mocked<ISocket>) =>
	new GameCreatorHandler(
		new EventEmitter(),
		makeLogger(),
		socket,
		{} as unknown as UserAuth,
	) as unknown as { sendRoomCreationNotice: (room: Room) => void };

const expectedFrame = (color: ChatColor, text: string): Buffer =>
	Buffer.from(new YGOProStocChat().fromPartial({ player_type: color, msg: text }).toFullPayload());

describe("GameCreatorHandler — room creation notice", () => {
	const originalRankingEnabled = config.ranking.enabled;

	afterEach(() => {
		config.ranking.enabled = originalRankingEnabled;
	});

	it("sends a GREEN notice for a ranked room", () => {
		config.ranking.enabled = true;
		const socket = makeSocket();
		const room = { ranked: true } as unknown as Room;

		makeHandler(socket).sendRoomCreationNotice(room);

		expect(socket.send).toHaveBeenCalledWith(
			expectedFrame(ChatColor.GREEN, "Ranked room — results count toward your rating."),
		);
	});

	it("sends a WHITE notice for a casual room when ranking is enabled", () => {
		config.ranking.enabled = true;
		const socket = makeSocket();
		const room = { ranked: false } as unknown as Room;

		makeHandler(socket).sendRoomCreationNotice(room);

		expect(socket.send).toHaveBeenCalledWith(
			expectedFrame(ChatColor.WHITE, "Casual room — results won't affect your rating."),
		);
	});

	it("sends a YELLOW notice when the ranking system is globally disabled", () => {
		config.ranking.enabled = false;
		const socket = makeSocket();
		const room = { ranked: false } as unknown as Room;

		makeHandler(socket).sendRoomCreationNotice(room);

		expect(socket.send).toHaveBeenCalledWith(
			expectedFrame(
				ChatColor.YELLOW,
				"Ranking is temporarily unavailable — this match won't be rated.",
			),
		);
	});

	it("sends exactly one frame per room creation, never a second follow-up message", () => {
		config.ranking.enabled = false;
		const socket = makeSocket();
		const room = { ranked: false } as unknown as Room;

		makeHandler(socket).sendRoomCreationNotice(room);

		expect(socket.send).toHaveBeenCalledTimes(1);
	});
});

describe("GameCreatorHandler — host account verification", () => {
	const originalRankingEnabled = config.ranking.enabled;
	// "Jaden:1234" in UTF-16LE, padded to the 40-byte player info frame.
	const playerInfoWithPin = Buffer.from(
		"4a006100640065006e003a0031003200330034000000000000000000000000000000000000000000",
		"hex",
	);

	afterEach(() => {
		config.ranking.enabled = originalRankingEnabled;
		jest.restoreAllMocks();
	});

	const createRoomWithHost = async (userAuth: UserAuth) => {
		const host = {
			host: true,
			sendMessage: jest.fn(),
			setAccountVerification: jest.fn(),
		};
		const room = {
			ranked: false,
			waiting: jest.fn(),
			createPlayer: jest.fn().mockResolvedValue(host),
			addPlayer: jest.fn(),
		};
		jest.spyOn(Room, "createFromCreateGameMessage").mockReturnValue(room as unknown as Room);
		jest.spyOn(RoomList, "addRoom").mockImplementation(() => undefined);
		const socket = makeSocket();
		const handler = new GameCreatorHandler(new EventEmitter(), makeLogger(), socket, userAuth);

		await handler.handleCreateGame({
			data: Buffer.alloc(80),
			previousMessage: playerInfoWithPin,
		} as unknown as ClientMessage);

		return { host, room, socket };
	};

	it("gives the host of a casual room the verification its PIN resolves to", async () => {
		config.ranking.enabled = false;
		const userAuth = {
			run: jest
				.fn()
				.mockResolvedValue(
					UserProfileMother.create({ emailVerifiedAt: new Date("2026-11-24T00:00:00Z") }),
				),
			runForVerifiedUser: jest.fn(),
		} as unknown as UserAuth;

		const { host } = await createRoomWithHost(userAuth);

		expect(host.setAccountVerification).toHaveBeenCalledTimes(1);
		await expect(host.setAccountVerification.mock.calls[0][0]).resolves.toBe(true);
	});

	it("keeps the casual host's id null and sends no error for a wrong PIN", async () => {
		config.ranking.enabled = false;
		const userAuth = {
			run: jest.fn().mockResolvedValue("Your password is incorrect."),
			runForVerifiedUser: jest.fn(),
		} as unknown as UserAuth;

		const { host, room, socket } = await createRoomWithHost(userAuth);

		expect(room.createPlayer).toHaveBeenCalledWith(socket, "Jaden", null);
		await expect(host.setAccountVerification.mock.calls[0][0]).resolves.toBe(false);
		expect(room.addPlayer).toHaveBeenCalledWith(host);
	});
});
