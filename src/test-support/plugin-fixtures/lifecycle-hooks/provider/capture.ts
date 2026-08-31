// Records every onMatchStarted invocation the fixture hook receives, so the
// bootstrapPlugins test suite can assert the plugin's declared hook actually
// reached the shared MatchLifecycleHooks runner.
export const startedCalls: string[] = [];

export function resetStartedCalls(): void {
	startedCalls.length = 0;
}
