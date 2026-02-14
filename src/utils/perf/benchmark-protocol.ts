const iterations = Number(process.env.BENCH_ITERATIONS ?? 200_000);
const payloadBytes = Number(process.env.BENCH_PAYLOAD_BYTES ?? 256);

const payload = {
	command: "RESPONSE",
	data: {
		replier: 0,
		message: "ab|cd|ef",
		blob: "x".repeat(payloadBytes),
	},
};

const measure = (name: string, fn: () => void) => {
	const started = process.hrtime.bigint();
	fn();
	const elapsed = process.hrtime.bigint() - started;
	const opsSec = iterations / (Number(elapsed) / 1e9);
	return {
		name,
		elapsedMs: Number(elapsed) / 1e6,
		opsPerSec: opsSec,
	};
};

const jsonResult = measure("json_stringify_parse", () => {
	for (let i = 0; i < iterations; i += 1) {
		const serialized = JSON.stringify(payload);
		const parsed = JSON.parse(serialized) as { command: string };
		if (parsed.command !== "RESPONSE") {
			throw new Error("invalid parse");
		}
	}
});

const framedResult = measure("length_prefixed_json_encode_decode", () => {
	for (let i = 0; i < iterations; i += 1) {
		const serialized = JSON.stringify(payload);
		const body = Buffer.from(serialized, "utf8");
		const header = Buffer.allocUnsafe(4);
		header.writeUInt32LE(body.length, 0);
		const frame = Buffer.concat([header, body]);

		const size = frame.readUInt32LE(0);
		const decoded = JSON.parse(frame.subarray(4, size + 4).toString("utf8")) as {
			data: { replier: number };
		};
		if (decoded.data.replier !== 0) {
			throw new Error("invalid framed parse");
		}
	}
});

process.stdout.write(
	`${JSON.stringify(
		{
			iterations,
			payloadBytes,
			results: [jsonResult, framedResult],
		},
		null,
		2
	)}\n`
);
