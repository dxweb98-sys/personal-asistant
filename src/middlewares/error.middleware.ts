import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../common/http-error.js";

export const errorMiddleware: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  if (error instanceof ZodError) {
    res
      .status(422)
      .json({
        success: false,
        message: "Validation failed",
        errors: error.issues,
      });
    return;
  }
  if (error instanceof HttpError) {
    res
      .status(error.statusCode)
      .json({ success: false, message: error.message, details: error.details });
    return;
  }
  console.error(error);
  res.status(500).json({ success: false, message: "Internal server error" });
};
