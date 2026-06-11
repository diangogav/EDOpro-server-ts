/**
 * Exercises the real YGOProDuelingState.sendAllEvrp() — the private method that
 * serializes every duel record into the .evrp envelope and broadcasts the
 * chunked frames to every connected client after .yrp delivery.
 *
 * sendAllEvrp() only reads this.room and this.logger, so we invoke it on a
 * prototype instance with those two fields injected. This runs the production
 * method verbatim without the OCGCore spin-up the full constructor needs — and
 * unlike a hand-copied body, it breaks if the real method drifts.
 */

import { mock } from "jest-mock-extended";

import { Logger } from "@shared/logger/domain/Logger";
import { DuelRecordMother } from "@test-support/mothers/room/DuelRecordMother";

import { DuelRecord } from "../DuelRecord";
import { YGOProDuelingState } from "./YGOProDuelingState";

const HOST_INFO = {
  lflist: 0,
  rule: 1,
  start_lp: 8000,
  start_hand: 5,
  draw_count: 1,
};

type SendAllEvrp = { sendAllEvrp(): Promise<void> };

function makeClient() {
  return { sendMessageToClient: jest.fn() };
}

function makeRoom(overrides: Record<string, unknown> = {}) {
  return {
    players: [{ name: "P1" }, { name: "P2" }],
    hostInfo: HOST_INFO,
    duelRecords: [DuelRecordMother.create()],
    clients: [makeClient()],
    ...overrides,
  };
}

// Bind room + logger onto a prototype instance and expose the private method,
// skipping the OCGCore-heavy constructor entirely.
function buildState(room: object, logger: Logger): SendAllEvrp {
  const state = Object.create(YGOProDuelingState.prototype);
  Object.assign(state, { room, logger });
  return state as SendAllEvrp;
}

describe("YGOProDuelingState.sendAllEvrp()", () => {
  describe("broadcast", () => {
    it("delivers at least one EVRP frame to a connected client", async () => {
      const client = makeClient();
      const room = makeRoom({ clients: [client] });

      await buildState(room, mock<Logger>()).sendAllEvrp();

      expect(client.sendMessageToClient).toHaveBeenCalled();
    });

    it("keeps every delivered frame within the 65535-byte ceiling", async () => {
      const client = makeClient();
      const room = makeRoom({ clients: [client] });

      await buildState(room, mock<Logger>()).sendAllEvrp();

      const frames = client.sendMessageToClient.mock.calls.map(([frame]: [Buffer]) => frame);
      for (const frame of frames) {
        expect(frame.length).toBeLessThanOrEqual(65535);
      }
    });

    it("delivers the same frame count to every connected client", async () => {
      const client1 = makeClient();
      const client2 = makeClient();
      const room = makeRoom({ clients: [client1, client2] });

      await buildState(room, mock<Logger>()).sendAllEvrp();

      expect(client1.sendMessageToClient).toHaveBeenCalledTimes(
        client2.sendMessageToClient.mock.calls.length,
      );
    });
  });

  describe("failure isolation", () => {
    function makeRoomWithBrokenRecord() {
      const broken = DuelRecordMother.create();
      jest.spyOn(broken, "toEvrpFrames").mockImplementation(() => {
        throw new Error("serialization failure");
      });
      return makeRoom({ duelRecords: [broken as DuelRecord] });
    }

    it("swallows a serialization error instead of propagating it", async () => {
      await expect(
        buildState(makeRoomWithBrokenRecord(), mock<Logger>()).sendAllEvrp(),
      ).resolves.toBeUndefined();
    });

    it("logs the error when serialization throws", async () => {
      const logger = mock<Logger>();

      await buildState(makeRoomWithBrokenRecord(), logger).sendAllEvrp();

      expect(logger.error).toHaveBeenCalled();
    });

    it("delivers no frames when serialization throws", async () => {
      const client = makeClient();
      const room = makeRoomWithBrokenRecord();
      room.clients = [client];

      await buildState(room, mock<Logger>()).sendAllEvrp();

      expect(client.sendMessageToClient).not.toHaveBeenCalled();
    });
  });
});
