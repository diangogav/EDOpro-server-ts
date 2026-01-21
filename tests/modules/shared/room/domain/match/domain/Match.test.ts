import {
  Match,
  Player,
} from "../../../../../../../src/shared/room/domain/match/domain/Match";
import { Team } from "../../../../../../../src/shared/room/Team";

describe("Match", () => {
  let match: Match;
  const players: Player[] = [
    {
      id: "player1",
      name: "Player One",
      team: Team.PLAYER,
    },
    {
      id: "player2",
      name: "Player Two",
      team: Team.OPPONENT,
    },
  ];

  describe("Constructor and initialization", () => {
    it("should create a match with best of 1", () => {
      match = new Match({ bestOf: 1 });

      expect(match.score).toEqual({ team0: 0, team1: 0 });
      expect(match.isFinished()).toBe(false);
    });

    it("should create a match with best of 3", () => {
      match = new Match({ bestOf: 3 });

      expect(match.score).toEqual({ team0: 0, team1: 0 });
      expect(match.isFinished()).toBe(false);
    });

    it("should create a match with best of 5", () => {
      match = new Match({ bestOf: 5 });

      expect(match.score).toEqual({ team0: 0, team1: 0 });
      expect(match.isFinished()).toBe(false);
    });

    it("should initialize historical data for players", () => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);

      const history = match.playersHistory;
      expect(history).toHaveLength(2);
      expect(history[0].name).toBe("Player One");
      expect(history[0].games).toEqual([]);
      expect(history[1].name).toBe("Player Two");
      expect(history[1].games).toEqual([]);
    });
  });

  describe("isFirstDuel", () => {
    beforeEach(() => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);
    });

    it("should return true when no duels have been played", () => {
      expect(match.isFirstDuel()).toBe(true);
    });

    it("should return false after a duel has been played", () => {
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.isFirstDuel()).toBe(false);
    });

    it("should return false when scores are non-zero", () => {
      match.duelWinner(1, 15, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.isFirstDuel()).toBe(false);
    });
  });

  describe("duelWinner - Team 0 wins", () => {
    beforeEach(() => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);
    });

    it("should increment player score when team 0 wins", () => {
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.score).toEqual({ team0: 1, team1: 0 });
    });

    it("should add winner result to team 0 player games", () => {
      match.duelWinner(0, 12, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      const history = match.playersHistory;
      expect(history[0].games).toHaveLength(1);
      expect(history[0].games[0].result).toBe("winner");
      expect(history[0].games[0].turns).toBe(12);
      expect(history[0].games[0].ipAddress).toBe("127.0.0.1");
    });

    it("should add loser result to team 1 player games", () => {
      match.duelWinner(0, 8, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      const history = match.playersHistory;
      expect(history[1].games).toHaveLength(1);
      expect(history[1].games[0].result).toBe("loser");
      expect(history[1].games[0].turns).toBe(8);
      expect(history[1].games[0].ipAddress).toBe("127.0.0.2");
    });
  });

  describe("duelWinner - Team 1 wins", () => {
    beforeEach(() => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);
    });

    it("should increment opponent score when team 1 wins", () => {
      match.duelWinner(1, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.score).toEqual({ team0: 0, team1: 1 });
    });

    it("should add winner result to team 1 player games", () => {
      match.duelWinner(1, 15, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      const history = match.playersHistory;
      expect(history[1].games).toHaveLength(1);
      expect(history[1].games[0].result).toBe("winner");
      expect(history[1].games[0].turns).toBe(15);
      expect(history[1].games[0].ipAddress).toBe("127.0.0.2");
    });

    it("should add loser result to team 0 player games", () => {
      match.duelWinner(1, 20, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      const history = match.playersHistory;
      expect(history[0].games).toHaveLength(1);
      expect(history[0].games[0].result).toBe("loser");
      expect(history[0].games[0].turns).toBe(20);
      expect(history[0].games[0].ipAddress).toBe("127.0.0.1");
    });
  });

  describe("duelWinner - Draw (DRAW = 2)", () => {
    beforeEach(() => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);
    });

    it("should increment both scores when draw occurs", () => {
      match.duelWinner(2, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.score).toEqual({ team0: 1, team1: 1 });
    });

    it("should add deuce result to all players", () => {
      match.duelWinner(2, 18, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      const history = match.playersHistory;
      expect(history[0].games).toHaveLength(1);
      expect(history[0].games[0].result).toBe("deuce");
      expect(history[0].games[0].turns).toBe(18);
      expect(history[1].games).toHaveLength(1);
      expect(history[1].games[0].result).toBe("deuce");
      expect(history[1].games[0].turns).toBe(18);
    });

    it("should handle null IP addresses in draw", () => {
      match.duelWinner(2, 10, [
        { name: "Player One", ipAddress: null },
        { name: "Player Two", ipAddress: null },
      ]);

      const history = match.playersHistory;
      expect(history[0].games[0].ipAddress).toBeNull();
      expect(history[1].games[0].ipAddress).toBeNull();
    });
  });

  describe("isFinished", () => {
    it("should return false for best of 1 when no games played", () => {
      match = new Match({ bestOf: 1 });
      match.initializeHistoricalData(players);

      expect(match.isFinished()).toBe(false);
    });

    it("should return true for best of 1 when team 0 wins", () => {
      match = new Match({ bestOf: 1 });
      match.initializeHistoricalData(players);
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.isFinished()).toBe(true);
    });

    it("should return true for best of 1 when team 1 wins", () => {
      match = new Match({ bestOf: 1 });
      match.initializeHistoricalData(players);
      match.duelWinner(1, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.isFinished()).toBe(true);
    });

    it("should return false for best of 3 when score is 1-0", () => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.isFinished()).toBe(false);
    });

    it("should return true for best of 3 when team 0 reaches 2 wins", () => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      match.duelWinner(0, 12, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.isFinished()).toBe(true);
    });

    it("should return true for best of 3 when team 1 reaches 2 wins", () => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);
      match.duelWinner(1, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      match.duelWinner(1, 15, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.isFinished()).toBe(true);
    });

    it("should return true for best of 5 when team 0 reaches 3 wins", () => {
      match = new Match({ bestOf: 5 });
      match.initializeHistoricalData(players);
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      match.duelWinner(0, 12, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      match.duelWinner(0, 8, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.isFinished()).toBe(true);
    });

    it("should not increment scores after match is finished", () => {
      match = new Match({ bestOf: 1 });
      match.initializeHistoricalData(players);
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.isFinished()).toBe(true);

      // Try to add another win
      match.duelWinner(1, 15, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      // Score should remain unchanged
      expect(match.score).toEqual({ team0: 1, team1: 0 });
    });

    it("should still add game history even after match is finished", () => {
      match = new Match({ bestOf: 1 });
      match.initializeHistoricalData(players);
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      // Try to add another game
      match.duelWinner(1, 15, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      const history = match.playersHistory;
      // Game history should still be recorded
      expect(history[0].games).toHaveLength(2);
      expect(history[1].games).toHaveLength(2);
    });
  });

  describe("playersHistory", () => {
    beforeEach(() => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);
    });

    it("should return correct winner flag for team 0 winning match", () => {
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      match.duelWinner(0, 12, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      const history = match.playersHistory;
      expect(history[0].winner).toBe(true);
      expect(history[1].winner).toBe(false);
    });

    it("should return correct winner flag for team 1 winning match", () => {
      match.duelWinner(1, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      match.duelWinner(1, 12, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      const history = match.playersHistory;
      expect(history[0].winner).toBe(false);
      expect(history[1].winner).toBe(true);
    });

    it("should return correct scores for each player", () => {
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      match.duelWinner(1, 12, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      const history = match.playersHistory;
      expect(history[0].score).toBe(1); // team0 score
      expect(history[1].score).toBe(1); // team1 score
    });

    it("should handle missing IP addresses", () => {
      match.duelWinner(0, 10, [{ name: "Player One", ipAddress: null }]);

      const history = match.playersHistory;
      expect(history[0].games[0].ipAddress).toBeNull();
      expect(history[1].games[0].ipAddress).toBeNull();
    });

    it("should handle IP address not found in the list", () => {
      match.duelWinner(0, 10, [
        { name: "Unknown Player", ipAddress: "127.0.0.1" },
      ]);

      const history = match.playersHistory;
      expect(history[0].games[0].ipAddress).toBeNull();
      expect(history[1].games[0].ipAddress).toBeNull();
    });
  });

  describe("Complex match scenarios", () => {
    it("should handle a full best of 3 match with alternating wins", () => {
      match = new Match({ bestOf: 3 });
      match.initializeHistoricalData(players);

      // Team 0 wins
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      expect(match.score).toEqual({ team0: 1, team1: 0 });
      expect(match.isFinished()).toBe(false);

      // Team 1 wins
      match.duelWinner(1, 15, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      expect(match.score).toEqual({ team0: 1, team1: 1 });
      expect(match.isFinished()).toBe(false);

      // Team 0 wins
      match.duelWinner(0, 8, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      expect(match.score).toEqual({ team0: 2, team1: 1 });
      expect(match.isFinished()).toBe(true);

      const history = match.playersHistory;
      expect(history[0].games).toHaveLength(3);
      expect(history[0].winner).toBe(true);
      expect(history[1].games).toHaveLength(3);
      expect(history[1].winner).toBe(false);
    });

    it("should handle a match with multiple draws", () => {
      match = new Match({ bestOf: 5 });
      match.initializeHistoricalData(players);

      // Draw
      match.duelWinner(2, 20, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      expect(match.score).toEqual({ team0: 1, team1: 1 });

      // Draw again
      match.duelWinner(2, 25, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      expect(match.score).toEqual({ team0: 2, team1: 2 });

      // Team 0 wins
      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      expect(match.score).toEqual({ team0: 3, team1: 2 });
      expect(match.isFinished()).toBe(true);

      const history = match.playersHistory;
      expect(history[0].games.filter((g) => g.result === "deuce")).toHaveLength(
        2,
      );
      expect(history[1].games.filter((g) => g.result === "deuce")).toHaveLength(
        2,
      );
    });

    it("should handle best of 5 where team wins 3-0", () => {
      match = new Match({ bestOf: 5 });
      match.initializeHistoricalData(players);

      match.duelWinner(0, 10, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      match.duelWinner(0, 12, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);
      match.duelWinner(0, 15, [
        { name: "Player One", ipAddress: "127.0.0.1" },
        { name: "Player Two", ipAddress: "127.0.0.2" },
      ]);

      expect(match.score).toEqual({ team0: 3, team1: 0 });
      expect(match.isFinished()).toBe(true);

      const history = match.playersHistory;
      expect(
        history[0].games.filter((g) => g.result === "winner"),
      ).toHaveLength(3);
      expect(history[1].games.filter((g) => g.result === "loser")).toHaveLength(
        3,
      );
    });
  });
});
