import { Logger } from "@shared/logger/domain/Logger";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import {
	AccountVerificationInput,
	AccountVerifier,
} from "@shared/user-profile/domain/AccountVerifier";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Resolves whether a joining client's account is verified, without touching
 * the client or its socket. Admission never waits for it, so a slow or broken
 * database only ever makes a client count as unverified.
 */
export class VerifyAccount implements AccountVerifier {
	constructor(
		private readonly userAuth: UserAuth,
		private readonly cutoff: Date | null,
		private readonly logger: Logger | null = null,
		private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
	) {}

	public async verify(input: AccountVerificationInput): Promise<boolean> {
		let timer: NodeJS.Timeout | undefined;
		const timeout = new Promise<boolean>((resolve) => {
			timer = setTimeout(() => resolve(false), this.timeoutMs);
			timer.unref?.();
		});

		try {
			return await Promise.race([this.lookup(input), timeout]);
		} catch (error) {
			this.logger?.warn("Account verification failed", {
				error: error instanceof Error ? error.message : String(error),
			});

			return false;
		} finally {
			clearTimeout(timer);
		}
	}

	private async lookup({ userId, playerInfo }: AccountVerificationInput): Promise<boolean> {
		let result: UserProfile | unknown = null;
		if (userId) {
			result = await this.userAuth.runForVerifiedUser(userId);
		} else if (playerInfo?.password) {
			result = await this.userAuth.run(playerInfo);
		}

		return result instanceof UserProfile && result.isVerified(this.cutoff);
	}
}
