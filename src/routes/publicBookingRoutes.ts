import { Router } from "express";
import { publicBookingController } from "../controllers/publicBookingController";

const publicBookingRouter = Router();

// All routes are public (no auth required)

/** GET /api/v1/public/book/:username/:eventSlug — booking page data */
publicBookingRouter.get("/book/:username/:eventSlug", (req, res) =>
  publicBookingController.getBookingPage(req, res),
);

/** GET /api/v1/public/book/:username/:eventSlug/slots — available slots */
publicBookingRouter.get("/book/:username/:eventSlug/slots", (req, res) =>
  publicBookingController.getBookingSlots(req, res),
);

/** POST /api/v1/public/book/:username/:eventSlug — submit booking */
publicBookingRouter.post("/book/:username/:eventSlug", (req, res) =>
  publicBookingController.createBooking(req, res),
);

export default publicBookingRouter;
