import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import * as tagController from "../controllers/tagController";

const router = Router();

router.use(verifyJWT);

// ────────────────────────────────────────────────────────────
// Tag CRUD
// ────────────────────────────────────────────────────────────

router.get("/", tagController.listTags);
router.post("/", tagController.createTag);
router.patch("/:tagId", tagController.updateTag);
router.delete("/:tagId", tagController.deleteTag);
router.get("/:tagId/items", tagController.getTagItems);

export default router;
