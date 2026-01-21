import { MessageProcessor } from "../../../../src/edopro/messages/MessageProcessor";
import { Commands } from "../../../../src/edopro/messages/domain/Commands";

describe("MessageProcessor", () => {
  let processor: MessageProcessor;

  beforeEach(() => {
    processor = new MessageProcessor();
  });

  it("should initialize correctly", () => {
    expect(processor.currentBuffer.length).toBe(0);
    expect(processor.bufferLength).toBe(0);
  });

  it("should accumulate data", () => {
    processor.read(Buffer.from([0x01]));
    expect(processor.bufferLength).toBe(1);
  });

  it("should detect when message is NOT ready (empty)", () => {
    expect(processor.isMessageReady()).toBe(false);
  });

  it("should detect when message is NOT ready (header only)", () => {
    // Size: 2 bytes. 5 bytes message.
    const sizeBuf = Buffer.alloc(2);
    sizeBuf.writeInt16LE(5);
    processor.read(sizeBuf);

    // We expect 5 bytes of body, but have 0.
    expect(processor.isMessageReady()).toBe(false);
  });

  it("should process a complete message", () => {
    const command = 0x10; // JOIN_GAME for example
    const body = Buffer.from([0xaa, 0xbb, 0xcc]);
    // Size = command (1) + body (3) = 4
    const size = 4;

    const header = Buffer.alloc(2);
    header.writeInt16LE(size);

    const fullMsg = Buffer.concat([header, Buffer.from([command]), body]);

    processor.read(fullMsg);

    expect(processor.isMessageReady()).toBe(true);

    processor.process();

    expect(processor.size).toBe(size);
    expect(processor.command).toBe(command);
    expect(processor.payload.data).toEqual(body);
    expect(processor.payload.raw).toEqual(fullMsg);
    expect(processor.bufferLength).toBe(0);
  });

  it("should process multiple messages", () => {
    const msg1Body = Buffer.from([0x11]);
    const msg2Body = Buffer.from([0x22]);

    const createMsg = (cmd: number, body: Buffer) => {
      const size = 1 + body.length;
      const head = Buffer.alloc(2);
      head.writeInt16LE(size);
      return Buffer.concat([head, Buffer.from([cmd]), body]);
    };

    const msg1 = createMsg(0x01, msg1Body);
    const msg2 = createMsg(0x02, msg2Body);

    processor.read(Buffer.concat([msg1, msg2]));

    // First message
    expect(processor.isMessageReady()).toBe(true);
    processor.process();
    expect(processor.command).toBe(0x01);
    expect(processor.payload.data).toEqual(msg1Body);

    // Second message
    expect(processor.isMessageReady()).toBe(true);
    processor.process();
    expect(processor.command).toBe(0x02);
    expect(processor.payload.data).toEqual(msg2Body);

    expect(processor.bufferLength).toBe(0);
  });

  it("should store previous message", () => {
    const createMsg = (cmd: number, body: Buffer) => {
      const size = 1 + body.length;
      const head = Buffer.alloc(2);
      head.writeInt16LE(size);
      return Buffer.concat([head, Buffer.from([cmd]), body]);
    };

    const msg1 = createMsg(0x01, Buffer.from([0xaa]));
    const msg2 = createMsg(0x02, Buffer.from([0xbb]));

    processor.read(msg1);
    processor.process();

    // At this point previous message is undefined/empty because it's the first one
    expect(processor.payload.previousMessage).toBeUndefined();

    processor.read(msg2);
    processor.process();

    // Now previous message should be the data of msg1
    // msg1 data is body (0xAA)
    // Wait, look at code: this._data = this.buffer.subarray(3, this._size + 2);
    // It captures strictly the data part excluding command?
    // Code: this._command = this.buffer.subarray(2).readInt8();
    // this._data = this.buffer.subarray(3, this._size + 2);
    // Yes, data starts at index 3 (2 bytes size + 1 byte command).

    expect(processor.payload.previousMessage).toEqual(Buffer.from([0xaa]));
    expect(processor.payload.previousRawMessage).toEqual(msg1);
  });

  it("should return early if process called but message not ready", () => {
    // Just a partial header
    processor.read(Buffer.from([0x01]));
    processor.process();
    // Nothing should change, size should be undefined (or default)
    expect(processor.size).toBeUndefined();
  });
});
