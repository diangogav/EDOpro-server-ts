import { Match } from "./Match";
import { Team } from "../../../Team";

describe("Match", () => {
    it("should NOT increment score for either player on a draw", () => {
        const match = new Match({ bestOf: 3 });
        match.initializeHistoricalData([
            { id: "1", name: "Player 0", team: 0 },
            { id: "2", name: "Player 1", team: 1 }
        ]);

        const DRAW = 2;
        match.duelWinner(DRAW, 10, [
            { name: "Player 0", ipAddress: "127.0.0.1" },
            { name: "Player 1", ipAddress: "127.0.0.2" }
        ]);

        expect(match.score.team0).toBe(0);
        expect(match.score.team1).toBe(0);
        expect(match.isFinished()).toBe(false);
    });

    it("should increment score correctly for winner", () => {
        const match = new Match({ bestOf: 3 });
        match.initializeHistoricalData([
            { id: "1", name: "Player 0", team: 0 },
            { id: "2", name: "Player 1", team: 1 }
        ]);

        match.duelWinner(0, 10, [
            { name: "Player 0", ipAddress: "127.0.0.1" },
            { name: "Player 1", ipAddress: "127.0.0.2" }
        ]);

        expect(match.score.team0).toBe(1);
        expect(match.score.team1).toBe(0);
        expect(match.isFinished()).toBe(false);
    });
});
