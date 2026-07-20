import type { Request } from "express";
import { env } from "../config/env.js";

export function getUserId(req: Request): string {
  const value = req.header("x-user-id");
  return value && value.length > 0 ? value : env.DEFAULT_USER_ID;
}
