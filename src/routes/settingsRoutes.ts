import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import {
  getSettings,
  updateSettings,
  saveRecallApiKey,
} from "../controllers/userSettingsController";

const settingsRouter = Router();

settingsRouter.use(verifyJWT);

settingsRouter.get("/user", getSettings);
settingsRouter.patch("/user", updateSettings);
settingsRouter.put("/recall-api-key", saveRecallApiKey);

export default settingsRouter;
