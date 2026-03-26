import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { getSettings, updateSettings } from "../controllers/userSettingsController";

const settingsRouter = Router();

settingsRouter.use(verifyJWT);

settingsRouter.get("/user", getSettings);
settingsRouter.patch("/user", updateSettings);

export default settingsRouter;
