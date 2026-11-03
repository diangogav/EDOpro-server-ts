import { PassThrough } from "stream";

import { parseLogFormat, Pino } from "./Pino";

function captureLines(stream: PassThrough): string[] {
	const lines: string[] = [];
	stream.on("data", (chunk: Buffer) => {
		lines.push(...chunk.toString().split("\n").filter(Boolean));
	});

	return lines;
}

describe("Pino", () => {
	it("writes one JSON object per line with the context fields in json format", async () => {
		const stream = new PassThrough();
		const lines = captureLines(stream);
		const logger = Pino.create("json", stream);

		logger.child({ roomId: 7 }).info("duel.resources", { cpuSeconds: 1.5 });
		await new Promise((resolve) => setImmediate(resolve));

		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0])).toMatchObject({
			level: 30,
			msg: "duel.resources",
			roomId: 7,
			cpuSeconds: 1.5,
		});
	});
});

describe("parseLogFormat", () => {
	it("returns json only for the json value", () => {
		expect(parseLogFormat("json")).toBe("json");
		expect(parseLogFormat(" JSON ")).toBe("json");
	});

	it("keeps the pretty format when unset or unknown", () => {
		expect(parseLogFormat(undefined)).toBe("pretty");
		expect(parseLogFormat("text")).toBe("pretty");
	});
});
