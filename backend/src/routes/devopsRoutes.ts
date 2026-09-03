import { Router } from "express";
import {
  getDevOpsActions,
  proposeDevOpsAction,
  approveDevOpsAction,
  rejectDevOpsAction,
  executeDevOpsAction,
} from "../controllers/devopsController";

const router = Router();

router.route("/").get(getDevOpsActions);
router.route("/propose").post(proposeDevOpsAction);
router.route("/approve/:id").post(approveDevOpsAction);
router.route("/reject/:id").post(rejectDevOpsAction);
router.route("/execute/:id").post(executeDevOpsAction);

export default router;
