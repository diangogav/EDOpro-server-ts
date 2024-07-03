import { NextFunction, Request, Response } from "express";

import { config } from "../../config";

export function AuthMiddleware(req: Request, res: Response, next: NextFunction): void {
	const adminApiKey = req.headers["admin-api-key"] ?? req.query["admin-api-key"];
	if (adminApiKey !== config.adminApiKey) {
		res.status(401).json({});
	} else {
		next();
	}
}
