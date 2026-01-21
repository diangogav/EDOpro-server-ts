import { BufferToUTF16 } from "../../../src/utils/BufferToUTF16";

describe("BufferToUTF16", () => {
  it("should convert buffer to UTF16 string correctly", () => {
    const str = "Hello";
    const buffer = Buffer.from(str, "utf16le");
    // Length in bytes = 5 * 2 = 10
    const result = BufferToUTF16(buffer, buffer.length);
    expect(result).toBe(str);
  });

  it("should stop at null terminator", () => {
    const str = "Hello\0World";
    const buffer = Buffer.from(str, "utf16le");
    const result = BufferToUTF16(buffer, buffer.length);
    expect(result).toBe("Hello");
  });

  it("should handle empty maxByteCount", () => {
    const buffer = Buffer.from("Hello", "utf16le");
    const result = BufferToUTF16(buffer, 0);
    expect(result).toBe("");
  });

  it("should break if value is NaN (though difficult with Uint8Array sources)", () => {
    // Just to cover the break condition logic in loop if necessary
    // view[i] | (view[i+1] << 8) shouldn't be NaN unless view[i] is undefined
    // If we pass maxByteCount larger than buffer length
    const buffer = Buffer.from("A", "utf16le"); // 2 bytes: 65, 0
    const result = BufferToUTF16(buffer, 4); // Ask for 4 bytes
    // i=0: read 65, 0. char 'A'
    // i=2: read undefined, undefined. undefined | (undefined << 8) -> NaN | NaN -> 0? No, undefined | x is 0 in JS bitwise?
    // undefined | (undefined << 8) -> 0 | 0 = 0 in JS bitwise operations usually coerce to 0.
    // Let's verify environment behavior.
    // If it results in 0, it breaks.
    expect(result).toBe("A");
  });
});
