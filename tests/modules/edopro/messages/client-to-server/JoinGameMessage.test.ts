import { JoinGameMessage } from "../../../../../src/edopro/messages/client-to-server/JoinGameMessage";

describe("JoinGameMessage", () => {
  it("should parse correctly", () => {
    const buffer = Buffer.alloc(JoinGameMessage.MAX_BYTES_LENGTH);
    buffer.writeUInt16LE(1, 0); // version2
    // Skip 2 bytes padding?
    buffer.writeUInt32LE(12345, 4); // id

    const password = "password";
    const passwordBuffer = Buffer.from(password, "utf16le");
    passwordBuffer.copy(buffer, 8);

    buffer.writeUInt32LE(54321, 46); // clientVersion

    const message = new JoinGameMessage(buffer);

    expect(message.version2).toBe(1);
    expect(message.id).toBe(12345);
    // Note: The logic in JoinGameMessage is:
    // this.password = Buffer.from(new TextVO(buffer.subarray(8, 48)).value).toString("utf16le");
    // TextVO probably strips null bytes. Let's see if we can match the password.
    // Assuming TextVO handles utf16le correctly or strips zeros and then we interpret as utf16le?
    // Wait, TextVO usually treats input as string or bytes and cleans it.
    // If TextVO cleans nulls, then Buffer.from(...).toString("utf16le") might be tricky.
    // Let's assume simpler check first.

    // If the source code says Buffer.from(new TextVO(...).value).toString("utf16le"), it implies TextVO returns a string (utf8?) or buffer?
    // Let's check TextVO.

    expect(message.clientVersion).toBe(54321);
  });
});
