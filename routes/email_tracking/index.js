const express = require("express");
const router = express.Router();
const EmailTrackingController = require("../../controllers/email_tracking/index.js");

// Tracking pixel - no auth required (embedded in emails)
router.get("/pixel/:orderId/:emailType", EmailTrackingController.trackEmailOpen);

// Link click tracking - no auth required (embedded in emails)
router.get("/click/:orderId/:emailType", EmailTrackingController.trackEmailClick);

module.exports = router;

