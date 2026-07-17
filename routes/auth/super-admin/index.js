const express = require("express");
const {
    getAllSuperAdmins,
    createSuperAdmin,
    updateSuperAdmin,
    deleteSuperAdmin,
    getSingleSuperAdmin,
} = require("../../../controllers/auth/super-admin/index");
const { superAdmin } = require("../../../middleware/auth/adminMiddleware");

const router = express.Router();

// Apply superAdmin middleware to all routes
router.use(superAdmin);

router.get("/get-admin/:id", getSingleSuperAdmin);
router.patch("/update/:id", updateSuperAdmin);
router.delete("/delete/:id", deleteSuperAdmin);
router.get("/get-all", getAllSuperAdmins);
router.post("/register", createSuperAdmin);

module.exports = router;
