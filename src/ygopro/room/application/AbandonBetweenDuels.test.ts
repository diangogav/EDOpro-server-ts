import { Logger } from "@shared/logger/domain/Logger";
import { MatchAbandonClientMessage } from "@shared/messages/server-to-client/MatchAbandonClientMessage";
import { DuelState } from "@shared/room/domain/YgoRoom";
import { Team } from "@shared/room/Team";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";

import { YGOProRoom } from "../domain/YGOProRoom";
import { ABANDON_GRACE_MS, AbandonBetweenDuels } from "./AbandonBetweenDuels";
import { EndMatchByAbandon } from "./EndMatchByAbandon";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";

jest.mock("./FinalizeYGOProRoom", () => ({
	FinalizeYGOProRoom: { run: jest.fn() },
}));

jest.mock("./EndMatchByAbandon", () => ({
	EndMatchByAbandon: { run: jest.fn().mockResolvedValue(undefined) },
}));

describe("AbandonBetweenDuels", () => {
	let logger: jest.Mocked<Logger>;

	const makePlayer = (team: number, position: number, isSpectator = false) => {
		const socket = { closed: false };
		return {
			team,
			position,
			isSpectator,
			socket,
			sendMessageToClient: jest.fn(),
		} as unknown as jest.Mocked<YGOProClient> & { socket: { closed: boolean } };
	};

	const BETWEEN_DUELS = [DuelState.RPS, DuelState.CHOOSING_ORDER, DuelState.SIDE_DECKING];

	const makeRoom = (
		players: YGOProClient[],
		overrides: Partial<Record<keyof YGOProRoom, unknown>> = {},
	) =>
		({
			id: 7,
			duelState: DuelState.RPS,
			finalizing: false,
			players,
			isMatchFinished: jest.fn().mockReturnValue(false),
			hasPlayedAnyDuel: jest.fn().mockReturnValue(false),
			getTeamPlayers: (team: number) => players.filter((player) => player.team === team),
			isBetweenDuels(this: { duelState: DuelState }) {
				return BETWEEN_DUELS.includes(this.duelState);
			},
			...overrides,
		}) as unknown as jest.Mocked<YGOProRoom>;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		logger = {
			child: jest.fn().mockReturnThis(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<Logger>;
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("gives a one-minute grace window", () => {
		expect(ABANDON_GRACE_MS).toBe(60_000);
	});

	describe("playerLeft", () => {
		it.each([
			DuelState.RPS,
			DuelState.CHOOSING_ORDER,
			DuelState.SIDE_DECKING,
		])("takes ownership of a leave during %s", (duelState) => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer], { duelState });

			expect(AbandonBetweenDuels.playerLeft(room, leaver, logger)).toBe(true);
		});

		it.each([DuelState.WAITING, DuelState.DUELING])("ignores a leave during %s", (duelState) => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer], { duelState });

			expect(AbandonBetweenDuels.playerLeft(room, leaver, logger)).toBe(false);
			jest.advanceTimersByTime(ABANDON_GRACE_MS);
			expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
		});

		it("ignores a spectator leaving", () => {
			const spectator = makePlayer(Team.PLAYER, 7, true);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([spectator, stayer]);

			expect(AbandonBetweenDuels.playerLeft(room, spectator, logger)).toBe(false);
			expect(stayer.sendMessageToClient).not.toHaveBeenCalled();
		});

		it("tells the players who stayed how long the leaver has to come back", () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer]);

			AbandonBetweenDuels.playerLeft(room, leaver, logger);

			expect(stayer.sendMessageToClient).toHaveBeenCalledWith(
				MatchAbandonClientMessage.opponentDisconnected(60),
			);
			expect(leaver.sendMessageToClient).not.toHaveBeenCalled();
		});

		it("decides nothing before the grace window ends", () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer]);

			AbandonBetweenDuels.playerLeft(room, leaver, logger);
			jest.advanceTimersByTime(ABANDON_GRACE_MS - 1);

			expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
			expect(EndMatchByAbandon.run).not.toHaveBeenCalled();
		});

		it("cancels the match with no result when no duel was played", () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer]);

			AbandonBetweenDuels.playerLeft(room, leaver, logger);
			leaver.socket.closed = true;
			jest.advanceTimersByTime(ABANDON_GRACE_MS);

			expect(stayer.sendMessageToClient).toHaveBeenCalledWith(
				MatchAbandonClientMessage.matchCancelled(),
			);
			expect(FinalizeYGOProRoom.run).toHaveBeenCalledWith(room);
			expect(EndMatchByAbandon.run).not.toHaveBeenCalled();
		});

		it("awards the match to the team that stayed once a duel was played", () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer], {
				duelState: DuelState.SIDE_DECKING,
				hasPlayedAnyDuel: jest.fn().mockReturnValue(true),
			});

			AbandonBetweenDuels.playerLeft(room, leaver, logger);
			leaver.socket.closed = true;
			jest.advanceTimersByTime(ABANDON_GRACE_MS);

			expect(stayer.sendMessageToClient).toHaveBeenCalledWith(MatchAbandonClientMessage.matchWon());
			expect(EndMatchByAbandon.run).toHaveBeenCalledWith(room, Team.PLAYER, logger);
			expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
		});

		it("decides nothing when the leaver reconnected within the window", () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer]);

			AbandonBetweenDuels.playerLeft(room, leaver, logger);
			leaver.socket.closed = true;
			// A reconnect swaps in a fresh, open socket; the dead one stays closed.
			(leaver as unknown as { socket: { closed: boolean } }).socket = { closed: false };
			jest.advanceTimersByTime(ABANDON_GRACE_MS);

			expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
			expect(EndMatchByAbandon.run).not.toHaveBeenCalled();
		});

		it("restarts the window when the same player leaves again", () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer]);

			AbandonBetweenDuels.playerLeft(room, leaver, logger);
			leaver.socket.closed = true;
			jest.advanceTimersByTime(ABANDON_GRACE_MS / 2);
			AbandonBetweenDuels.playerLeft(room, leaver, logger);
			jest.advanceTimersByTime(ABANDON_GRACE_MS / 2);

			expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();

			jest.advanceTimersByTime(ABANDON_GRACE_MS / 2);

			expect(FinalizeYGOProRoom.run).toHaveBeenCalledTimes(1);
		});

		it("leaves a duel that started after the leaver came back alone", () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer]);

			AbandonBetweenDuels.playerLeft(room, leaver, logger);
			// Reconnected, the duel started, then the same player dropped mid-duel.
			(room as { duelState: DuelState }).duelState = DuelState.DUELING;
			leaver.socket.closed = true;
			jest.advanceTimersByTime(ABANDON_GRACE_MS);

			expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
			expect(EndMatchByAbandon.run).not.toHaveBeenCalled();
		});

		it("leaves a room that is already being torn down alone", () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer]);

			AbandonBetweenDuels.playerLeft(room, leaver, logger);
			leaver.socket.closed = true;
			(room as { finalizing: boolean }).finalizing = true;
			jest.advanceTimersByTime(ABANDON_GRACE_MS);

			expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
			expect(EndMatchByAbandon.run).not.toHaveBeenCalled();
		});
	});

	describe("resolve", () => {
		it("settles a surrender immediately and drops the pending window", async () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer]);

			AbandonBetweenDuels.playerLeft(room, leaver, logger);
			await AbandonBetweenDuels.resolve(room, Team.PLAYER, logger);
			jest.advanceTimersByTime(ABANDON_GRACE_MS);

			expect(FinalizeYGOProRoom.run).toHaveBeenCalledTimes(1);
		});

		it("never settles a match whose duel is being played", async () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer], { duelState: DuelState.DUELING });

			await AbandonBetweenDuels.resolve(room, Team.PLAYER, logger);

			expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
			expect(EndMatchByAbandon.run).not.toHaveBeenCalled();
		});

		it("still closes the room and logs when awarding the match fails", async () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer], {
				hasPlayedAnyDuel: jest.fn().mockReturnValue(true),
			});
			(EndMatchByAbandon.run as jest.Mock).mockRejectedValueOnce(new Error("hooks down"));

			await expect(AbandonBetweenDuels.resolve(room, Team.PLAYER, logger)).resolves.toBeUndefined();

			expect(logger.error).toHaveBeenCalled();
			expect(FinalizeYGOProRoom.run).toHaveBeenCalledWith(room);
		});

		it("does not rewrite a match that already has a result", async () => {
			const leaver = makePlayer(Team.PLAYER, 0);
			const stayer = makePlayer(Team.OPPONENT, 1);
			const room = makeRoom([leaver, stayer], {
				isMatchFinished: jest.fn().mockReturnValue(true),
			});

			await AbandonBetweenDuels.resolve(room, Team.PLAYER, logger);

			expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
			expect(EndMatchByAbandon.run).not.toHaveBeenCalled();
		});
	});
});
