import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { ISocket } from "@shared/socket/domain/ISocket";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { ServerErrorMessage } from "@shared/user-auth/domain/ServerErrorMessage";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { mock } from "jest-mock-extended";

import { AuthenticatePlayer } from "./AuthenticatePlayer";
import { CheckIfUseCanJoin } from "./CheckIfUserCanJoin";

const playerInfo = { name: "Jaden", password: "1234" } as PlayerInfoMessage;

// 0xF3 server error frame: 2-byte LE size, 0xF3, 0x04, 1 zero byte, 40 zero
// bytes, then the message as UTF-16LE padded to 512 code units.
function decodeServerErrorFrame(frame: Buffer): { size: number; header: number[]; text: string } {
	return {
		size: frame.readUInt16LE(0),
		header: [...frame.subarray(2, 5)],
		text: frame.subarray(45).toString("utf16le").replace(/\0+$/, ""),
	};
}

function makeUserAuth(result: UserProfile | ServerErrorMessage) {
	const userAuth = mock<UserAuth>();
	userAuth.run.mockResolvedValue(result);

	return userAuth;
}

describe("AuthenticatePlayer", () => {
	it("returns the profile and sends nothing when the user is valid", async () => {
		const profile = UserProfile.from({
			id: "user-1",
			username: "Jaden",
			password: "hash",
			email: "jaden@example.com",
			avatar: null,
		});
		const socket = mock<ISocket>();

		const user = await new AuthenticatePlayer(makeUserAuth(profile)).run(playerInfo, socket);

		expect(user).toBe(profile);
		expect(socket.send).not.toHaveBeenCalled();
	});

	it.each([
		ServerErrorMessage.USER_NOT_FOUND,
		ServerErrorMessage.USER_BANNED,
		ServerErrorMessage.INVALID_PASSWORD,
	])("sends the 0xF3 server error frame and returns null for %s", async (error) => {
		const socket = mock<ISocket>();

		const user = await new AuthenticatePlayer(makeUserAuth(error)).run(playerInfo, socket);

		expect(user).toBeNull();
		expect(socket.send).toHaveBeenCalledTimes(1);
		const frame = socket.send.mock.calls[0][0];
		expect(decodeServerErrorFrame(frame)).toEqual({
			size: frame.length - 2,
			header: [0xf3, 0x04, 0x00],
			text: error,
		});
	});
});

describe("CheckIfUseCanJoin", () => {
	it("returns false and sends the server error frame when authentication fails", async () => {
		const socket = mock<ISocket>();

		const canJoin = await new CheckIfUseCanJoin(
			makeUserAuth(ServerErrorMessage.INVALID_PASSWORD),
		).check(playerInfo, socket);

		expect(canJoin).toBe(false);
		expect(socket.send).toHaveBeenCalledTimes(1);
		expect(decodeServerErrorFrame(socket.send.mock.calls[0][0]).text).toBe(
			ServerErrorMessage.INVALID_PASSWORD,
		);
	});
});
