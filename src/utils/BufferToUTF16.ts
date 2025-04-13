export function BufferToUTF16(data: Buffer, maxByteCount: number): string {
	const str: string[] = [];
	if (maxByteCount === 0) {
		return str.join("");
	}
	const view = new Uint8Array(data);
	for (let i = 0; i < maxByteCount; i += 2) {
		const toAppend = view[i] | (view[i + 1] << 8);
		if (isNaN(toAppend) || toAppend === 0x0000) {
			break;
		}
		str.push(String.fromCharCode(toAppend));
	}

	return str.join("");
}
