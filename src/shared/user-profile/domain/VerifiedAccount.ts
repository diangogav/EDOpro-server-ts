export type VerificationFacts = {
	emailVerifiedAt: Date | null;
	discordId: string | null;
	createdAt: Date | null;
};

/**
 * An account is verified when its owner confirmed the email address, linked a
 * Discord account (Discord already confirmed the email), or registered before the
 * cutoff. The cutoff keeps accounts from before verification was required as they
 * were, without writing a fake confirmation date on them.
 */
export function isVerifiedAccount(account: VerificationFacts, cutoff: Date | null): boolean {
	if (account.emailVerifiedAt !== null || account.discordId !== null) {
		return true;
	}

	if (cutoff === null || account.createdAt === null) {
		return false;
	}

	return account.createdAt.getTime() < cutoff.getTime();
}
