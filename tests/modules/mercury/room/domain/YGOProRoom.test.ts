import "reflect-metadata";

import { GameMode } from "ygopro-msg-encode";
import { YGOProRoomMother } from "../../../shared/mothers/room/YGOProRoomMother";
import MercuryBanListMemoryRepository from "../../../../../src/mercury/ban-list/infrastructure/MercuryBanListMemoryRepository";
import { YGOProBanList } from "../../../../../src/mercury/ban-list/domain/YGOProBanList";

function createBanList(name: string, hash: number): YGOProBanList {
  const banList = new YGOProBanList();
  banList.setName(name);
  banList.setHash(hash);
  return banList;
}

describe("YGOProRoom", () => {
  it("Should create a room with `mode` 1 (Match) when command has `m`", () => {
    const room = YGOProRoomMother.create({ command: "m#123" });
    expect(room.hostInfo.mode).toBe(GameMode.MATCH);
  });

  it("Should create a room with `mode` 2 (Tag) and `start_lp` 16000 when command has `t`", () => {
    const room = YGOProRoomMother.create({ command: "t#123" });
    expect(room.hostInfo.mode).toBe(GameMode.TAG);
    expect(room.hostInfo.start_lp).toBe(16000);
  });

  it("Should create a room with start_lp passing by `lp` command: example lp4000 should create a room with `start_lp` equal to 4000", () => {
    const room = YGOProRoomMother.create({ command: "lp4000#123" });
    expect(room.hostInfo.start_lp).toBe(4000);
  });

  it("Should create a room with Match mode and 6000 lps if command is lp6000,m#123", () => {
    const room = YGOProRoomMother.create({ command: "lp6000,m#123" });
    expect(room.hostInfo.start_lp).toBe(6000);
    expect(room.hostInfo.mode).toBe(GameMode.MATCH);
  });

  it("Should create a room with Tag mode and 12000 lps if command is t,lp12000#123", () => {
    const room = YGOProRoomMother.create({ command: "t,lp12000#123" });
    expect(room.hostInfo.start_lp).toBe(12000);
    expect(room.hostInfo.mode).toBe(GameMode.TAG);
  });

  it("Should create a room with Tag mode and 12000 lps if command is lp12000,t#123", () => {
    const room = YGOProRoomMother.create({ command: "lp12000,t#123" });
    expect(room.hostInfo.start_lp).toBe(12000);
    expect(room.hostInfo.mode).toBe(GameMode.TAG);
  });

  it("Should create a room with Match mode and duel rule 2 if command is mr2,m#123", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m#123" });
    expect(room.hostInfo.duel_rule).toBe(2);
    expect(room.hostInfo.mode).toBe(GameMode.MATCH);
  });

  it("Should create a room with Match mode and duel rule 2 if command is duelrule2,m#123", () => {
    const room = YGOProRoomMother.create({ command: "duelrule2,m#123" });
    expect(room.hostInfo.duel_rule).toBe(2);
    expect(room.hostInfo.mode).toBe(GameMode.MATCH);
  });

  it("Should create a single match room, allowing all cards from TCG and OCG (But the Forbidden/Limited List is still OCG's) sending rule 5 if command contains ot", () => {
    const room = YGOProRoomMother.create({ command: "ot#123" });
    expect(room.hostInfo.rule).toBe(5);
  });

  it("Should create a room with rule 5 if command contains tcg (alias of ot)", () => {
    const room = YGOProRoomMother.create({ command: "tcg#123" });
    expect(room.hostInfo.rule).toBe(5);
  });

  it("Should create a match room with rule 5 if command contains tcg,m", () => {
    const room = YGOProRoomMother.create({ command: "tcg,m#123" });
    expect(room.hostInfo.rule).toBe(5);
    expect(room.hostInfo.mode).toBe(GameMode.MATCH);
  });

  it("Should create a tag room, allowing all cards from TCG and OCG, with a life point total of 36000.", () => {
    const room = YGOProRoomMother.create({ command: "T,OT,LP36000#123" });
    expect(room.hostInfo.rule).toBe(5);
    expect(room.hostInfo.start_lp).toBe(36000);
    expect(room.hostInfo.mode).toBe(GameMode.TAG);
  });

  it("Should create room with timelimit of 300 segs (for values between 1 and 60 should be covert to seconds) if the command is tm5#123", () => {
    const room = YGOProRoomMother.create({ command: "tm5#123" });
    expect(room.hostInfo.time_limit).toBe(300);
    expect(room.hostInfo.start_lp).toBe(8000);
  });

  it("Should create room with timelimit of 300 segs (for values between 1 and 60 should be covert to seconds) if the command is time5#123", () => {
    const room = YGOProRoomMother.create({ command: "time5#123" });
    expect(room.hostInfo.time_limit).toBe(300);
    expect(room.hostInfo.start_lp).toBe(8000);
  });

  it("Should create room with timelimit of 500 segs if the command is tm500#123", () => {
    const room = YGOProRoomMother.create({ command: "tm500#123" });
    expect(room.hostInfo.time_limit).toBe(500);
    expect(room.hostInfo.start_lp).toBe(8000);
  });

  it("Should create room with timelimit passed by param if the param is greater than 60 and lower than 999, for example: tm1200#123", () => {
    const room = YGOProRoomMother.create({ command: "tm200#123" });
    expect(room.hostInfo.time_limit).toBe(200);
    expect(room.hostInfo.start_lp).toBe(8000);
  });

  it("Should create a room with the default timelimit if time command if not sent correctly", () => {
    const room = YGOProRoomMother.create({ command: "tm#123" });
    expect(room.hostInfo.time_limit).toBe(450);
    expect(room.hostInfo.start_lp).toBe(8000);
  });

  it("Should create a tag room with time params correctly", () => {
    const room = YGOProRoomMother.create({ command: "t,tm200#123" });
    expect(room.hostInfo.time_limit).toBe(200);
    expect(room.hostInfo.start_lp).toBe(16000);
    expect(room.hostInfo.mode).toBe(GameMode.TAG);
  });

  it("Should create a room without deck shuffling if ns param is send", () => {
    const room = YGOProRoomMother.create({ command: "m,ns#123" });
    expect(room.hostInfo.no_shuffle_deck).toBe(1);
  });

  it("Should create a room with deck shuffling if ns param is not send", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m#123" });
    expect(room.hostInfo.no_shuffle_deck).toBe(0);
  });

  it("Should create a room without deck checking if nc param is send", () => {
    const room = YGOProRoomMother.create({ command: "m,nc#123" });
    expect(room.hostInfo.no_check_deck).toBe(1);
  });

  it("Should create a room with deck checking if nc param is not send", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m#123" });
    expect(room.hostInfo.no_check_deck).toBe(0);
  });

  it("Should create a room with deck count 1 if dr param is not send", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m#123" });
    expect(room.hostInfo.draw_count).toBe(1);
  });

  it("Should create a room with deck count passed by params if dr param is send", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m,dr9#123" });
    expect(room.hostInfo.draw_count).toBe(9);
  });

  it("Should create a room with deck count passed by params if draw param is send", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m,draw9#123" });
    expect(room.hostInfo.draw_count).toBe(9);
  });

  it("Should create a room with deck count 35 if dr param value is greater than 35", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m,dr40#123" });
    expect(room.hostInfo.draw_count).toBe(35);
  });

  it("Should create a room with deck count 1 if dr param value is invalid", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m,dr#123" });
    expect(room.hostInfo.draw_count).toBe(1);
  });

  it("Should create a room with start hand count 1 if st param is not send", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m#123" });
    expect(room.hostInfo.start_hand).toBe(5);
  });

  it("Should create a room with start hand count passed by params if st param is send", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m,st10#123" });
    expect(room.hostInfo.start_hand).toBe(10);
  });

  it("Should create a room with start hand count 40 if st param value is greater than 40", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m,st50#123" });
    expect(room.hostInfo.start_hand).toBe(40);
  });

  it("Should create a room with start hand count 5 if st param value is invalid", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m,stundefined#123" });
    expect(room.hostInfo.start_hand).toBe(5);
  });

  it("Should create a room with start hand count 5 if st param value is lower than zero", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m,st0#123" });
    expect(room.hostInfo.start_hand).toBe(5);
  });

  it("Should create a room with start hand count passed by params if start param is send", () => {
    const room = YGOProRoomMother.create({ command: "mr2,m,start10#123" });
    expect(room.hostInfo.start_hand).toBe(10);
  });

  describe("LFList command", () => {
    beforeEach(() => {
      MercuryBanListMemoryRepository.clear();
      for (let i = 0; i < 10; i++) {
        MercuryBanListMemoryRepository.add(createBanList(`BanList ${i}`, (i + 1) * 100));
      }
    });

    afterEach(() => {
      MercuryBanListMemoryRepository.clear();
    });

    it("Should create a room with the banlist hash at index (lf value - 1) through lf command", () => {
      const room = YGOProRoomMother.create({ command: "lf2#123" });
      expect(room.hostInfo.lflist).toBe(200);
    });

    it("Should create a room with the banlist hash at index (lf value - 1) through lflist command", () => {
      const room = YGOProRoomMother.create({ command: "lf10#123" });
      expect(room.hostInfo.lflist).toBe(1000);
    });
  });

  it("Should create a room with OCG ban list and ocg only if command is oo", () => {
    const room = YGOProRoomMother.create({ command: "oor#123" });
    expect(room.hostInfo.rule).toBe(0);
    expect(room.hostInfo.lflist).toBe(0);
  });

  describe("Genesys Format", () => {
    it("Should create a room with Genesys format if command contains genesys and the default points should be 100", () => {
      const room = YGOProRoomMother.create({ command: "genesys#123" });

      expect(room.hostInfo.rule).toBe(1);
      expect(room.hostInfo.lflist).toBe(0);
      expect(room.hostInfo.time_limit).toBe(450);
      expect(room.hostInfo.duel_rule).toBe(5);
    });

    it("Should be create a room with Genesys format if command contains genesys250 with max deck points 250", () => {
      const room = YGOProRoomMother.create({ command: "genesys250#123" });

      expect(room.hostInfo.rule).toBe(1);
      expect(room.hostInfo.lflist).toBe(0);
      expect(room.hostInfo.time_limit).toBe(450);
      expect(room.hostInfo.duel_rule).toBe(5);
    });

    it("Should create a room with Genesys format if command contains g and the default points should be 100", () => {
      const room = YGOProRoomMother.create({ command: "g#123" });
      expect(room.hostInfo.rule).toBe(1);
      expect(room.hostInfo.lflist).toBe(0);
      expect(room.hostInfo.time_limit).toBe(450);
      expect(room.hostInfo.duel_rule).toBe(5);
    });

    it("Should be create a room with Genesys format if command contains g300 with max deck points 300", () => {
      const room = YGOProRoomMother.create({ command: "G300#123" });

      expect(room.hostInfo.rule).toBe(1);
      expect(room.hostInfo.lflist).toBe(0);
      expect(room.hostInfo.time_limit).toBe(450);
      expect(room.hostInfo.duel_rule).toBe(5);
    });
  });

  describe("Pre releases", () => {
    it("Should create a room with pre release format if command contains pr and the default points should be 100", () => {
      const room = YGOProRoomMother.create({ command: "PRE,NC,M,TM15#KIRITO" });

      expect(room.hostInfo.rule).toBe(5);
      expect(room.hostInfo.time_limit).toBe(900);
      expect(room.hostInfo.duel_rule).toBe(5);
      expect(room.hostInfo.no_check_deck).toBe(1);
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
    });
  });

  describe("Goat Format", () => {
    it("Should create a room with Goat format if command contains goat", () => {
      const room = YGOProRoomMother.create({ command: "goat#123" });
      expect(room.hostInfo.rule).toBe(5);
      expect(room.hostInfo.lflist).toBe(0);
      expect(room.hostInfo.time_limit).toBe(450);
      expect(room.hostInfo.duel_rule).toBe(4);
    });
  });

  describe("Mode Match Best of X", () => {
    it("Should create a room with Match mode Best of 3 if command contains bo0", () => {
      const room = YGOProRoomMother.create({ command: "bo0#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(3);
    });

    it("Should create a room with Single mode if command contains bo with a letter instead a number", () => {
      const room = YGOProRoomMother.create({ command: "boabc#123" });
      expect(room.hostInfo.mode).toBe(GameMode.SINGLE);
      expect(room.hostInfo.best_of).toBe(1);
    });

    it("Should create a room with Match mode Best of 3 if command contains bo3", () => {
      const room = YGOProRoomMother.create({ command: "bo3#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(3);
    });

    it("Should create a room with Match mode Best of 5 if command contains bo5", () => {
      const room = YGOProRoomMother.create({ command: "bo5#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(5);
    });

    it("Should create a room with Match mode Best of 7 if command contains bo7", () => {
      const room = YGOProRoomMother.create({ command: "bo7#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(7);
    });

    it("Should create a room with Match mode Best of 1 if command contains bo1", () => {
      const room = YGOProRoomMother.create({ command: "bo1#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(1);
    });

    it("Should create a room with Single mode if command not contains number", () => {
      const room = YGOProRoomMother.create({ command: "bo#123" });
      expect(room.hostInfo.mode).toBe(GameMode.SINGLE);
      expect(room.hostInfo.best_of).toBe(1);
    });

    it("Should create a room with Match mode Best of 3 if command contains bo2", () => {
      const room = YGOProRoomMother.create({ command: "bo2#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(3);
    });

    it("Should create a room with Match mode Best of 5 if command contains bo4", () => {
      const room = YGOProRoomMother.create({ command: "bo4#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(5);
    });

    it("Should create a room with Match mode Best of 7 if command contains bo6", () => {
      const room = YGOProRoomMother.create({ command: "bo6#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(7);
    });

    it("Should create a room with Match mode Best of 9 if command contains bo9", () => {
      const room = YGOProRoomMother.create({ command: "bo9#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(9);
    });

    it("Should create a room with Match mode Best of 3 if command contains m#123", () => {
      const room = YGOProRoomMother.create({ command: "m#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(3);
    });

    it("Should create a room with Match mode Best of 5 if command contains m,bo5#123", () => {
      const room = YGOProRoomMother.create({ command: "m,bo5#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(5);
    });

    it("Should create a room with Match mode Best of 5 if command contains bo5,m#123", () => {
      const room = YGOProRoomMother.create({ command: "bo5,m#123" });
      expect(room.hostInfo.mode).toBe(GameMode.MATCH);
      expect(room.hostInfo.best_of).toBe(5);
    });
  });
});
