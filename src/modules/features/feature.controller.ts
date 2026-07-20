import { Router } from "express";
import {
  listFeatures,
  listNavigationFeatures,
} from "../../config/features.js";

export const featureRouter = Router();

featureRouter.get("/", (_req, res) => {
  res.json({
    success: true,
    data: {
      focus: "debt_and_credit",
      features: listFeatures(),
      navigation: listNavigationFeatures(),
    },
  });
});
