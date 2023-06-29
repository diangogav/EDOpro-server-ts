export function UTF8ToUTF16(str: string): Buffer {
	const utf8Bytes = new TextEncoder().encode(str);
	const utf16Array = new Uint16Array(utf8Bytes.length);

	for (let i = 0; i < utf8Bytes.length; i++) {
		utf16Array[i] = utf8Bytes[i];
	}

	return Buffer.from(utf16Array.buffer);
}
