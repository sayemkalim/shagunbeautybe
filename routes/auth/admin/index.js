const express = require("express");
const {
  getAllAdmins,
  registerAdmin,
  updateAdmin,
  deleteAdmin,
  loginAdmin,
  getAllSubAdmins,
  registerSubAdmin,
  getSingleAdmin,
} = require("../../../controllers/auth/admin/index");
const {
  admin,
  superAdmin,
} = require("../../../middleware/auth/adminMiddleware");

const router = express.Router();

router.get("/", superAdmin, getAllAdmins);
router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.get("/sub-admin", admin, getAllSubAdmins);
router.post("/sub-admin", admin, registerSubAdmin);
router.get("/:id", superAdmin, getSingleAdmin);

// DEVELOPMENT API's
router.patch("/edit/:id", updateAdmin);
router.delete("/delete/:id", deleteAdmin);

module.exports = router;
