import { Router } from "express";
import { verifyJWT, userRateLimit } from "../middleware/authMiddleware";
import * as searchController from "../controllers/searchController";

const router = Router();

router.use(verifyJWT);

router.get("/", userRateLimit(60, 60 * 60 * 1000, "search"), searchController.search);

export default router;
