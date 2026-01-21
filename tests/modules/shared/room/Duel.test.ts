import { Duel } from "../../../../src/shared/room/Duel";
import { Team } from "../../../../src/shared/room/Team";

describe("Duel", () => {
  let duel: Duel;

  describe("Constructor", () => {
    it("should create a duel with initial turn and lps", () => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");

      expect(duel.turn).toBe(0);
      expect(duel.lps).toEqual([8000, 8000]);
      expect(duel.banListName).toBe("TCG 2024.01");
      expect(duel.isFinished).toBe(false);
    });

    it("should handle null ban list name", () => {
      duel = new Duel(1, [8000, 8000], null);

      expect(duel.banListName).toBe("N/A");
    });

    it("should create a duel with custom starting lps", () => {
      duel = new Duel(0, [16000, 16000], "OCG 2024.01");

      expect(duel.lps).toEqual([16000, 16000]);
      expect(duel.banListName).toBe("OCG 2024.01");
    });

    it("should create a duel with different lps for each team", () => {
      duel = new Duel(5, [4000, 6000], "Custom");

      expect(duel.turn).toBe(5);
      expect(duel.lps).toEqual([4000, 6000]);
    });
  });

  describe("increaseTurn", () => {
    beforeEach(() => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");
    });

    it("should increment turn by 1", () => {
      duel.increaseTurn();

      expect(duel.turn).toBe(1);
    });

    it("should increment turn multiple times", () => {
      duel.increaseTurn();
      duel.increaseTurn();
      duel.increaseTurn();

      expect(duel.turn).toBe(3);
    });

    it("should continue incrementing from non-zero initial turn", () => {
      duel = new Duel(10, [8000, 8000], "TCG 2024.01");
      duel.increaseTurn();

      expect(duel.turn).toBe(11);
    });
  });

  describe("decreaseLps - Team.PLAYER", () => {
    beforeEach(() => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");
    });

    it("should decrease player lps by specified value", () => {
      duel.decreaseLps(Team.PLAYER, 1000);

      expect(duel.lps).toEqual([7000, 8000]);
    });

    it("should decrease player lps multiple times", () => {
      duel.decreaseLps(Team.PLAYER, 1000);
      duel.decreaseLps(Team.PLAYER, 500);
      duel.decreaseLps(Team.PLAYER, 200);

      expect(duel.lps).toEqual([6300, 8000]);
    });

    it("should set player lps to 0 when damage exceeds current lps", () => {
      duel.decreaseLps(Team.PLAYER, 10000);

      expect(duel.lps).toEqual([0, 8000]);
    });

    it("should not go below 0 for player lps", () => {
      duel.decreaseLps(Team.PLAYER, 8000);
      duel.decreaseLps(Team.PLAYER, 5000);

      expect(duel.lps).toEqual([0, 8000]);
    });

    it("should handle exact lps depletion", () => {
      duel.decreaseLps(Team.PLAYER, 8000);

      expect(duel.lps).toEqual([0, 8000]);
    });
  });

  describe("decreaseLps - Team.OPPONENT", () => {
    beforeEach(() => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");
    });

    it("should decrease opponent lps by specified value", () => {
      duel.decreaseLps(Team.OPPONENT, 2000);

      expect(duel.lps).toEqual([8000, 6000]);
    });

    it("should decrease opponent lps multiple times", () => {
      duel.decreaseLps(Team.OPPONENT, 1500);
      duel.decreaseLps(Team.OPPONENT, 2500);

      expect(duel.lps).toEqual([8000, 4000]);
    });

    it("should set opponent lps to 0 when damage exceeds current lps", () => {
      duel.decreaseLps(Team.OPPONENT, 15000);

      expect(duel.lps).toEqual([8000, 0]);
    });

    it("should not go below 0 for opponent lps", () => {
      duel.decreaseLps(Team.OPPONENT, 8000);
      duel.decreaseLps(Team.OPPONENT, 1000);

      expect(duel.lps).toEqual([8000, 0]);
    });
  });

  describe("decreaseLps - Invalid team", () => {
    beforeEach(() => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");
    });

    it("should not decrease lps for Team.SPECTATOR", () => {
      duel.decreaseLps(Team.SPECTATOR, 1000);

      expect(duel.lps).toEqual([8000, 8000]);
    });

    it("should not decrease lps for invalid team number", () => {
      duel.decreaseLps(99 as Team, 5000);

      expect(duel.lps).toEqual([8000, 8000]);
    });
  });

  describe("increaseLps - Team.PLAYER", () => {
    beforeEach(() => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");
    });

    it("should increase player lps by specified value", () => {
      duel.increaseLps(Team.PLAYER, 1000);

      expect(duel.lps).toEqual([9000, 8000]);
    });

    it("should increase player lps multiple times", () => {
      duel.increaseLps(Team.PLAYER, 500);
      duel.increaseLps(Team.PLAYER, 300);
      duel.increaseLps(Team.PLAYER, 200);

      expect(duel.lps).toEqual([9000, 8000]);
    });

    it("should increase player lps from reduced value", () => {
      duel.decreaseLps(Team.PLAYER, 3000);
      duel.increaseLps(Team.PLAYER, 1500);

      expect(duel.lps).toEqual([6500, 8000]);
    });

    it("should allow lps to exceed initial value", () => {
      duel.increaseLps(Team.PLAYER, 10000);

      expect(duel.lps).toEqual([18000, 8000]);
    });
  });

  describe("increaseLps - Team.OPPONENT", () => {
    beforeEach(() => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");
    });

    it("should increase opponent lps by specified value", () => {
      duel.increaseLps(Team.OPPONENT, 2000);

      expect(duel.lps).toEqual([8000, 10000]);
    });

    it("should increase opponent lps multiple times", () => {
      duel.increaseLps(Team.OPPONENT, 1000);
      duel.increaseLps(Team.OPPONENT, 1500);

      expect(duel.lps).toEqual([8000, 10500]);
    });

    it("should increase opponent lps from reduced value", () => {
      duel.decreaseLps(Team.OPPONENT, 4000);
      duel.increaseLps(Team.OPPONENT, 2000);

      expect(duel.lps).toEqual([8000, 6000]);
    });

    it("should allow opponent lps to exceed initial value", () => {
      duel.increaseLps(Team.OPPONENT, 20000);

      expect(duel.lps).toEqual([8000, 28000]);
    });
  });

  describe("increaseLps - Invalid team", () => {
    beforeEach(() => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");
    });

    it("should not increase lps for Team.SPECTATOR", () => {
      duel.increaseLps(Team.SPECTATOR, 1000);

      expect(duel.lps).toEqual([8000, 8000]);
    });

    it("should not increase lps for invalid team number", () => {
      duel.increaseLps(-1 as Team, 5000);

      expect(duel.lps).toEqual([8000, 8000]);
    });
  });

  describe("finished", () => {
    beforeEach(() => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");
    });

    it("should mark duel as finished", () => {
      expect(duel.isFinished).toBe(false);

      duel.finished();

      expect(duel.isFinished).toBe(true);
    });

    it("should remain finished after calling multiple times", () => {
      duel.finished();
      duel.finished();
      duel.finished();

      expect(duel.isFinished).toBe(true);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle a complete duel simulation", () => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");

      // Turn 1: Player takes damage
      duel.increaseTurn();
      duel.decreaseLps(Team.PLAYER, 2000);
      expect(duel.turn).toBe(1);
      expect(duel.lps).toEqual([6000, 8000]);

      // Turn 2: Opponent takes damage
      duel.increaseTurn();
      duel.decreaseLps(Team.OPPONENT, 3000);
      expect(duel.turn).toBe(2);
      expect(duel.lps).toEqual([6000, 5000]);

      // Turn 3: Player gains lps
      duel.increaseTurn();
      duel.increaseLps(Team.PLAYER, 1000);
      expect(duel.turn).toBe(3);
      expect(duel.lps).toEqual([7000, 5000]);

      // Turn 4: Opponent loses
      duel.increaseTurn();
      duel.decreaseLps(Team.OPPONENT, 5000);
      expect(duel.turn).toBe(4);
      expect(duel.lps).toEqual([7000, 0]);

      duel.finished();
      expect(duel.isFinished).toBe(true);
    });

    it("should handle both teams taking and gaining lps in same turn", () => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");

      duel.decreaseLps(Team.PLAYER, 1000);
      duel.decreaseLps(Team.OPPONENT, 1500);
      duel.increaseLps(Team.PLAYER, 500);
      duel.increaseLps(Team.OPPONENT, 300);

      expect(duel.lps).toEqual([7500, 6800]);
    });

    it("should handle lps going to 0 and continuing", () => {
      duel = new Duel(0, [8000, 8000], "TCG 2024.01");

      duel.decreaseLps(Team.PLAYER, 8000);
      expect(duel.lps).toEqual([0, 8000]);

      // Try to decrease further
      duel.decreaseLps(Team.PLAYER, 1000);
      expect(duel.lps).toEqual([0, 8000]);

      // Try to increase from 0
      duel.increaseLps(Team.PLAYER, 2000);
      expect(duel.lps).toEqual([2000, 8000]);
    });

    it("should preserve ban list name throughout duel", () => {
      duel = new Duel(0, [8000, 8000], "OCG 2024.04");

      duel.increaseTurn();
      duel.decreaseLps(Team.PLAYER, 1000);
      duel.increaseLps(Team.OPPONENT, 500);
      duel.finished();

      expect(duel.banListName).toBe("OCG 2024.04");
    });

    it("should handle very high lps values", () => {
      duel = new Duel(0, [99999, 99999], "Custom");

      duel.decreaseLps(Team.PLAYER, 50000);
      duel.increaseLps(Team.PLAYER, 25000);

      expect(duel.lps).toEqual([74999, 99999]);
    });
  });

  describe("Getters", () => {
    beforeEach(() => {
      duel = new Duel(5, [4000, 6000], "Master Duel");
    });

    it("should return correct lps", () => {
      expect(duel.lps).toEqual([4000, 6000]);
    });

    it("should return correct turn", () => {
      expect(duel.turn).toBe(5);
    });

    it("should return correct ban list name", () => {
      expect(duel.banListName).toBe("Master Duel");
    });

    it("should return correct finished state", () => {
      expect(duel.isFinished).toBe(false);
      duel.finished();
      expect(duel.isFinished).toBe(true);
    });
  });
});
