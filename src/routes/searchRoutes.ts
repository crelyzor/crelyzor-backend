import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import * as searchController from "../controllers/searchController";

const router = Router();

router.use(verifyJWT);

router.get("/", searchController.search);

export default router;
