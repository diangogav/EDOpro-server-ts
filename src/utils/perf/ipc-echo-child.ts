import readline from "readline";

const rl = readline.createInterface({
	input: process.stdin,
	crlfDelay: Infinity,
});

const writeFramedJson = (payload: unknown) => {
	const json = JSON.stringify(payload);
	const body = Buffer.from(json, "utf8");
	const header = Buffer.allocUnsafe(4);
	header.writeUInt32LE(body.length, 0);
	process.stdout.write(Buffer.concat([header, body]));
};

rl.on("line", (line) => {
	if (!line) {
		return;
	}

	let parsed: { command?: string; id?: number; sentAtNs?: string; payload?: string };
	try {
		parsed = JSON.parse(line) as { command?: string; id?: number; sentAtNs?: string; payload?: string };
	} catch (_error) {
		writeFramedJson({
			type: "ERROR",
			error: "invalid_json",
		});
		return;
	}

	if (parsed.command === "PING") {
		writeFramedJson({
			type: "PONG",
			id: parsed.id,
			sentAtNs: parsed.sentAtNs,
			serverReceivedAtNs: process.hrtime.bigint().toString(),
			payloadSize: parsed.payload?.length ?? 0,
		});
		return;
	}

	if (parsed.command === "EXIT") {
		writeFramedJson({ type: "BYE" });
		process.exit(0);
	}

	writeFramedJson({
		type: "UNKNOWN_COMMAND",
		command: parsed.command,
	});
});
