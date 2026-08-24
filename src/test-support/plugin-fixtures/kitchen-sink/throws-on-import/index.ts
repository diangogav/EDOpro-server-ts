// Simulates a plugin module that throws while it is being dynamically
// imported (before any export is ever evaluated by bootstrapPlugins).
throw new Error("throws-on-import: simulated import-time failure");
