import { EventEmitter } from "stream";

import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { Logger } from "@shared/logger/domain/Logger";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { ISocket } from "@shared/socket/domain/ISocket";
import { config } from "../../../config";

import { GameCreatorHandler } from "./GameCreatorHandler";
import { Room } from "../domain/Room";

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
		1,
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
