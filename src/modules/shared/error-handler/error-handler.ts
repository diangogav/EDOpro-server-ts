import { Pino } from "../logger/infrastructure/Pino";

const logger = new Pino();

process.on("uncaughtException", (error: Error) => {
	console.error("Excepción no capturada:", error);
	logger.error(error);
	// Aquí puedes realizar acciones adicionales, como guardar registros de errores, limpiar recursos, etc.
});
