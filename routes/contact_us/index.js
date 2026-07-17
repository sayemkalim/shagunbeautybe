const express = require("express");
const router = express.Router();
const ContactController = require("../../controllers/contact_us/index");
const { adminOrSuperAdmin } = require("../../middleware/auth/adminMiddleware");

router.post("/", ContactController.postUserQuery);
router.get("/", adminOrSuperAdmin, ContactController.getUserQueries);
router.delete("/:id", adminOrSuperAdmin, ContactController.deleteUserQueries);

module.exports = router;
