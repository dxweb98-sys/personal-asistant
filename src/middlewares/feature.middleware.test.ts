import { describe, expect, it } from "vitest";
import { HttpError } from "../common/http-error.js";
import { Feature } from "../config/features.js";
import {
  assertFeatureActive,
  featureUnavailableError,
} from "./feature.middleware.js";

describe("feature API guard", () => {
  it("allows active debt features", () => {
    expect(() => assertFeatureActive(Feature.DEBTS)).not.toThrow();
  });

  it("returns a locked coming-soon error for disabled features", () => {
    const error = featureUnavailableError(Feature.INVESTMENTS);

    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(423);
    expect(error.details).toMatchObject({
      code: "FEATURE_COMING_SOON",
      feature: {
        key: Feature.INVESTMENTS,
        locked: true,
        badge: "Segera Hadir",
      },
    });
    expect(() => assertFeatureActive(Feature.INVESTMENTS)).toThrow(error.message);
  });
});
