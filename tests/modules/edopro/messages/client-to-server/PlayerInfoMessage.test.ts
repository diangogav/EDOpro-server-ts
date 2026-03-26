import { PlayerInfoMessage } from "../../../../../src/edopro/messages/client-to-server/PlayerInfoMessage";

describe("PlayerInfoMessage", () => {
  it("should parse name only", () => {
    const name = "Player1";
    const buffer = Buffer.from(name, "utf16le");
    const message = new PlayerInfoMessage(buffer, buffer.length);

    expect(message.name).toBe(name);
    expect(message.password).toBeNull();
    expect(message.hasMercurySignature).toBe(false);
  });

  it("should parse name and password", () => {
    const name = "Player1";
    const password = "1234";
    const fullString = `${name}:${password}`;
    const buffer = Buffer.from(fullString, "utf16le");

    const message = new PlayerInfoMessage(buffer, buffer.length);

    expect(message.name).toBe(name);
    expect(message.password).toBe(password);
    expect(message.hasMercurySignature).toBe(false);
  });

  it("should ignore extra characters after the first 4 password characters", () => {
    const name = "Player1";
    const fullString = `${name}:1234$5678`;
    const buffer = Buffer.from(fullString, "utf16le");

    const message = new PlayerInfoMessage(buffer, buffer.length);

    expect(message.name).toBe(name);
    expect(message.password).toBe("1234");
    expect(message.hasMercurySignature).toBe(true);
  });

  it("should ignore extra characters in the name when no password is provided", () => {
    const buffer = Buffer.from("Player1$5678", "utf16le");

    const message = new PlayerInfoMessage(buffer, buffer.length);

    expect(message.name).toBe("Player1");
    expect(message.password).toBeNull();
    expect(message.hasMercurySignature).toBe(true);
  });
});
