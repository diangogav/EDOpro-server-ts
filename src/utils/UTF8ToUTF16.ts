export function UTF8ToUTF16(str: string, length: number): Buffer {
	const utf8Bytes = Buffer.from(str, "utf-8");
	const utf16Array = new Uint16Array(length);

	for (let i = 0; i < utf8Bytes.length; i++) {
		utf16Array[i] = utf8Bytes[i];
	}

	return Buffer.from(utf16Array.buffer, 0, length);
}
