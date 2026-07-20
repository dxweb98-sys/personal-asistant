import type { RequestHandler } from "express";
import { HttpError } from "../common/http-error.js";
import {
  getFeature,
  isFeatureActive,
  type FeatureKey,
} from "../config/features.js";

export function featureUnavailableError(feature: FeatureKey): HttpError {
  const definition = getFeature(feature);
  return new HttpError(
    423,
    `Fitur ${definition.label} dinonaktifkan sementara`,
    {
      code: "FEATURE_COMING_SOON",
      feature: {
        key: definition.key,
        label: definition.label,
        status: definition.status,
        locked: true,
        lockIcon: "lock",
        badge: "Segera Hadir",
      },
    },
  );
}

export function assertFeatureActive(feature: FeatureKey): void {
  if (!isFeatureActive(feature)) throw featureUnavailableError(feature);
}

export function requireFeature(feature: FeatureKey): RequestHandler {
  return (_req, _res, next) => {
    try {
      assertFeatureActive(feature);
      next();
    } catch (error) {
      next(error);
    }
  };
}
