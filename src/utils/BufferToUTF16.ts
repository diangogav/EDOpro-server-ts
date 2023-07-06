export function BufferToUTF16(data: ArrayBuffer, maxByteCount: number): string {
	const str: string[] = [];
	if (maxByteCount === 0) {
		return str.join("");
	}
	const view = new Uint8Array(data);
	const tg = maxByteCount / 2;
	for (let i = 0; i <= tg; i += 2) {
		const toAppend = view[i] | (view[i + 1] << 8);
		if (!toAppend || toAppend === 0x000a || toAppend === 0x000d) {
			break;
		}
		str.push(String.fromCharCode(toAppend));
	}

	return str.join("");
}
