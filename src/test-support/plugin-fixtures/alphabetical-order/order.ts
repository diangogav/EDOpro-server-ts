// Shared capture module for the alphabetical-order plugin fixtures — each
// fixture pushes its own name here from register() so the test can assert
// the exact registration order bootstrapPlugins produced.
export const registrationOrder: string[] = [];

export function resetRegistrationOrder(): void {
	registrationOrder.length = 0;
}
