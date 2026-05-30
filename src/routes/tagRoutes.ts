import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveTeamContext } from "../middleware/resolveTeamContext";
import * as tagController from "../controllers/tagController";

const router = Router();

router.use(verifyJWT);
// Phase 6 P5.5.a — populate req.teamContext from X-Team-Id for all Tag
// CRUD routes. listTags / createTag / updateTag / deleteTag / getTagItems
// all thread it through to scope by team or personal pool.
router.use(resolveTeamContext);

// ────────────────────────────────────────────────────────────
// Tag CRUD
// ────────────────────────────────────────────────────────────

router.get("/", tagController.listTags);
router.post("/", tagController.createTag);
router.patch("/:tagId", tagController.updateTag);
router.delete("/:tagId", tagController.deleteTag);
router.get("/:tagId/items", tagController.getTagItems);

export default router;
