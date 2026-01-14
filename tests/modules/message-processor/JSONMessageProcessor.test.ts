
import { JSONMessageProcessor } from "../../../src/edopro/messages/JSONMessageProcessor";

describe("JSONMessageProcessor", () => {
    it("Should process a simple message with 4-byte header", () => {
        const processor = new JSONMessageProcessor();
        const json = JSON.stringify({ command: "TEST", data: {} });
        const jsonBuffer = Buffer.from(json, "utf-8");
        const size = jsonBuffer.length;

        // Create 4-byte header (uint32LE)
        const header = Buffer.alloc(4);
        header.writeUInt32LE(size, 0);

        const packet = Buffer.concat([header, jsonBuffer]);

        processor.read(packet);
        expect(processor.isMessageReady()).toBe(true);
        processor.process();

        expect(processor.payload.data).toBe(json);
        expect(processor.payload.size).toBe(size);
        expect(processor.isMessageReady()).toBe(false);
    });

    it("Should handle split packets (header then body)", () => {
        const processor = new JSONMessageProcessor();
        const json = JSON.stringify({ command: "SPLIT", data: {} });
        const jsonBuffer = Buffer.from(json, "utf-8");
        const size = jsonBuffer.length;

        const header = Buffer.alloc(4);
        header.writeUInt32LE(size, 0);

        // Send header first
        processor.read(header);
        expect(processor.isMessageReady()).toBe(false); // Body missing

        // Send body
        processor.read(jsonBuffer);
        expect(processor.isMessageReady()).toBe(true);
        processor.process();

        expect(processor.payload.data).toBe(json);
        expect(processor.isMessageReady()).toBe(false);
    });

    it("Should handle multiple messages in one chunk", () => {
        const processor = new JSONMessageProcessor();

        // Msg 1
        const json1 = JSON.stringify({ id: 1 });
        const buf1 = Buffer.from(json1);
        const head1 = Buffer.alloc(4);
        head1.writeUInt32LE(buf1.length, 0);

        // Msg 2
        const json2 = JSON.stringify({ id: 2 });
        const buf2 = Buffer.from(json2);
        const head2 = Buffer.alloc(4);
        head2.writeUInt32LE(buf2.length, 0);

        const chunk = Buffer.concat([head1, buf1, head2, buf2]);

        processor.read(chunk);

        // Process 1st
        processor.process();
        expect(processor.payload.data).toBe(json1);

        // Process 2nd
        processor.process();
        expect(processor.payload.data).toBe(json2);
    });
});
