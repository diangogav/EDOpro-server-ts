process.on("uncaughtException", (error: Error) => {
	console.error("Excepción no capturada:", error);
});
