import { createHash, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";

import { config } from "../../config";

export function AuthAdminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const adminApiKey =
    (req.headers["admin-api-key"] as string) ??
    (req.query["admin-api-key"] as string);

  if (!adminApiKey || !config.adminApiKey) {
    res.status(401).json({});
    return;
  }

  const providedKeyHash = createHash("sha256").update(adminApiKey).digest();
  const expectedKeyHash = createHash("sha256")
    .update(config.adminApiKey)
    .digest();

  if (
    providedKeyHash.length !== expectedKeyHash.length ||
    !timingSafeEqual(providedKeyHash, expectedKeyHash)
  ) {
    res.status(401).json({});
  } else {
    next();
  }
}
