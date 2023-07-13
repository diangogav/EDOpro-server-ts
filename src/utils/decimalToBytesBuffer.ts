export function decimalToBytesBuffer(decimal: number, numBytes: number): Buffer {
	const buffer = Buffer.alloc(numBytes);
	buffer.writeUIntBE(decimal, 0, numBytes);
	const bytes = [...buffer].map((byte) => `0x${byte.toString(16).padStart(2, "0")}`).join(" ");

	return Buffer.from(
		bytes
			.split(" ")
			.reverse()
			.map((item) => Number(item))
	);
}

export function decimalToBytesBufferSigned(decimal: number, numBytes: number): Buffer {
	const buffer = Buffer.alloc(numBytes);
	if (decimal >= 0) {
		buffer.writeUInt32BE(decimal, 0);
	} else {
		buffer.writeInt32BE(decimal, 0);
	}

	return buffer;
}
