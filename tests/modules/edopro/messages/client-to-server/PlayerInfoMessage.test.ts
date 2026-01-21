import { PlayerInfoMessage } from "../../../../../src/edopro/messages/client-to-server/PlayerInfoMessage";

describe("PlayerInfoMessage", () => {
  it("should parse name only", () => {
    const name = "Player1";
    const buffer = Buffer.from(name, "utf16le");
    const message = new PlayerInfoMessage(buffer, buffer.length);

    expect(message.name).toBe(name);
    expect(message.password).toBeNull();
  });

  it("should parse name and password", () => {
    const name = "Player1";
    const password = "Secret";
    const fullString = `${name}:${password}`;
    const buffer = Buffer.from(fullString, "utf16le");

    const message = new PlayerInfoMessage(buffer, buffer.length);

    expect(message.name).toBe(name);
    expect(message.password).toBe(password);
  });
});
