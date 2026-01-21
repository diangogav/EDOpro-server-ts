import { JSONMessageProcessor } from "../../../../src/edopro/messages/JSONMessageProcessor";

describe("JSONMessageProcessor", () => {
  let processor: JSONMessageProcessor;

  beforeEach(() => {
    processor = new JSONMessageProcessor();
  });

  it("should initialize with empty buffer", () => {
    expect(processor.currentBuffer.length).toBe(0);
    expect(processor.bufferLength).toBe(0);
  });

  it("should accumulate data in buffer", () => {
    processor.read(Buffer.from("abc"));
    expect(processor.bufferLength).toBe(3);
    processor.read(Buffer.from("def"));
    expect(processor.bufferLength).toBe(6);
  });

  it("should identify when a message is ready", () => {
    // Size (4 bytes LE) + Data
    const data = Buffer.from("test");
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length, 0);

    // Not enough for size header
    processor.read(size.subarray(0, 2));
    expect(processor.isMessageReady()).toBe(false);

    // Size header complete, but not enough data
    processor.read(size.subarray(2));
    expect(processor.isMessageReady()).toBe(false);

    // Full message
    processor.read(data);
    expect(processor.isMessageReady()).toBe(true);
  });

  it("should process a valid message", () => {
    const payload = "test message";
    const data = Buffer.from(payload, "utf-8");
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length, 0);

    processor.read(size);
    processor.read(data);

    processor.process();

    expect(processor.size).toBe(data.length);
    expect(processor.payload.data).toBe(payload);
    expect(processor.bufferLength).toBe(0);
  });

  it("should handle partial message processing", () => {
    const payload = "short";
    const data = Buffer.from(payload, "utf-8");
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length, 0);

    processor.read(size);
    // Don't read full data yet
    processor.read(data.subarray(0, 2));

    processor.process();

    // Message not ready, nothing should happen
    expect(processor.size).toBeUndefined();
    expect(processor.payload.data).toBe("");

    // Read rest
    processor.read(data.subarray(2));
    processor.process();

    expect(processor.size).toBe(data.length);
    expect(processor.payload.data).toBe(payload);
  });

  it("should handle multiple messages in stream", () => {
    const msg1 = "message1";
    const msg2 = "message2";

    const buf1 = Buffer.concat([
      (() => {
        const b = Buffer.alloc(4);
        b.writeUInt32LE(msg1.length);
        return b;
      })(),
      Buffer.from(msg1),
    ]);

    const buf2 = Buffer.concat([
      (() => {
        const b = Buffer.alloc(4);
        b.writeUInt32LE(msg2.length);
        return b;
      })(),
      Buffer.from(msg2),
    ]);

    processor.read(buf1);
    processor.read(buf2);

    expect(processor.isMessageReady()).toBe(true);
    processor.process();
    expect(processor.payload.data).toBe(msg1);

    expect(processor.isMessageReady()).toBe(true);
    processor.process();
    expect(processor.payload.data).toBe(msg2);

    expect(processor.bufferLength).toBe(0);
  });

  it("should clear state", () => {
    processor.read(Buffer.from([1, 2, 3]));
    processor.clear();
    expect(processor.bufferLength).toBe(0);
    expect(processor.size).toBe(0);
    expect(processor.payload.data).toBe("");
  });

  it("should handle previous message (though logic is currently commented out or minimal)", () => {
    // This test is to cover lines 30-32 if they were active, but currently they are mostly empty.
    // We'll simulate processing twice to ensure stability.
    const msg = "test";
    const buf = Buffer.concat([
      (() => {
        const b = Buffer.alloc(4);
        b.writeUInt32LE(msg.length);
        return b;
      })(),
      Buffer.from(msg),
    ]);

    processor.read(buf);
    processor.process();

    // Mocking a second read/process to hit the line 30 `if (this._data.length)` path potentially
    processor.read(buf);
    processor.process();

    expect(processor.payload.data).toBe(msg);
  });
});
