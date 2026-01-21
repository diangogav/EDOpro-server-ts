import { CreateGameMessage } from "../../../../../src/edopro/messages/client-to-server/CreateGameMessage";

describe("CreateGameMessage", () => {
  it("should parse correctly", () => {
    const buffer = Buffer.alloc(CreateGameMessage.MAX_BYTES_LENGTH);

    buffer.writeInt32LE(1, 0); // banList
    buffer.writeUInt8(2, 4); // allowed
    buffer.writeUInt8(3, 5); // mode
    buffer.writeUInt8(4, 6); // duelRule
    buffer.writeUInt8(5, 7); // dontCheckDeckContent
    buffer.writeUInt8(6, 8); // dontShuffleDeck
    // offset 9-12 (3 bytes)
    buffer.writeUInt16LE(8000, 12); // lp
    buffer.writeInt8(5, 16); // startingHandCount
    buffer.writeInt8(1, 17); // drawCount
    buffer.writeUInt16LE(300, 18); // timeLimit
    buffer.writeUInt32LE(123, 20); // duelFlagsHight
    buffer.writeUInt32LE(456, 24); // handshake
    buffer.writeUInt32LE(789, 28); // clientVersion
    buffer.writeInt32LE(10, 32); // t0Count
    buffer.writeInt32LE(10, 36); // t1Count
    buffer.writeInt32LE(3, 40); // bestOf
    buffer.writeUInt32LE(321, 44); // duelFlagsLow
    buffer.writeUInt32LE(999, 48); // forbidden
    buffer.writeUInt16LE(888, 52); // extraRules
    buffer.writeUInt16LE(40, 54); // mainDeckMin
    buffer.writeUInt16LE(60, 56); // mainDeckMax
    buffer.writeUInt16LE(0, 58); // extraDeckMin
    buffer.writeUInt16LE(15, 60); // extraDeckMax
    buffer.writeUInt16LE(0, 62); // sideDeckMin
    buffer.writeUInt16LE(15, 64); // sideDeckMax

    // name 66-106 (40 bytes)
    buffer.write("RoomName", 66, "utf16le");

    // password 108-148 (40 bytes)
    buffer.write("Pass", 108, "utf16le");

    // notes 148-548 (400 bytes)
    buffer.write("Notes", 148, "utf16le");

    const message = new CreateGameMessage(buffer);

    expect(message.banList).toBe(1);
    expect(message.allowed).toBe(2);
    expect(message.mode).toBe(3);
    expect(message.duelRule).toBe(4);
    expect(message.dontCheckDeckContent).toBe(5);
    expect(message.dontShuffleDeck).toBe(6);
    expect(message.lp).toBe(8000);
    expect(message.startingHandCount).toBe(5);
    expect(message.drawCount).toBe(1);
    expect(message.timeLimit).toBe(300);
    expect(message.duelFlagsHight).toBe(123);
    expect(message.handshake).toBe(456);
    expect(message.clientVersion).toBe(789);
    expect(message.t0Count).toBe(10);
    expect(message.t1Count).toBe(10);
    expect(message.bestOf).toBe(3);
    expect(message.duelFlagsLow).toBe(321);
    expect(message.forbidden).toBe(999);
    expect(message.extraRules).toBe(888);
    expect(message.mainDeckMin).toBe(40);
    expect(message.mainDeckMax).toBe(60);
    expect(message.extraDeckMin).toBe(0);
    expect(message.extraDeckMax).toBe(15);
    expect(message.sideDeckMin).toBe(0);
    expect(message.sideDeckMax).toBe(15);

    // Name parsing depends on TextVO. If it reads as utf16le directly from buffer range.
    expect(message.name).toContain("RoomName");
  });
});
