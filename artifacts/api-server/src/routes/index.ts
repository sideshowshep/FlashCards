import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cardsRouter from "./cards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cardsRouter);

export default router;
