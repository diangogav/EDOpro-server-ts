import fs from "fs";

export async function checkFileExists(path: string): Promise<boolean> {
	try {
		await fs.promises.mkdir(path, { recursive: true });

		return true;
	} catch (error) {
		return false;
	}
}
