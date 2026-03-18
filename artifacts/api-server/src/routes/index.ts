import { Router, type IRouter } from "express";
import healthRouter from "./health";
import roundRouter from "./round";
import playersRouter from "./players";
import matchesRouter from "./matches";
import availabilityRouter from "./availability";
import lineupRouter from "./lineup";
import adminRouter from "./admin";
import historyRouter from "./history";
import { adminAuthMiddleware } from "../middlewares/adminAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(roundRouter);
router.use(playersRouter);
router.use(matchesRouter);
router.use(availabilityRouter);
router.use(lineupRouter);
router.use(historyRouter);
router.use(adminAuthMiddleware, adminRouter);

export default router;
