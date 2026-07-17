const { asyncHandler } = require("../../../common/asyncHandler");
const Admin = require("../../../models/adminModel");
const ApiResponse = require("../../../utils/ApiResponse");
const { generateAccessToken } = require("../../../utils/auth");

const getAllSuperAdmins = asyncHandler(async (req, res) => {
    const { search = "", page = 1, per_page = 50 } = req.query;

    const query = { role: "super_admin" };

    if (search) {
        query.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
        ];
    }

    const skip = (page - 1) * per_page;

    const superAdmins = await Admin.find(query)
        .select("-password")
        .skip(skip)
        .limit(parseInt(per_page, 10));

    const totalSuperAdmins = await Admin.countDocuments(query);

    res.json(
        new ApiResponse(
            200,
            { data: superAdmins, total: totalSuperAdmins },
            "Super Admins fetched successfully",
            true
        )
    );
});

const createSuperAdmin = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    const adminExists = await Admin.findOne({ email });

    if (adminExists) {
        return res
            .status(400)
            .json(new ApiResponse(400, null, "Admin already exists", false));
    }

    const superAdmin = await Admin.create({
        name,
        email,
        password,
        role: "super_admin",
    });

    const data = {
        id: superAdmin.id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role,
    };

    res.json(
        new ApiResponse(201, data, "New super admin created successfully", true)
    );
});

const updateSuperAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, password } = req.body;

    const superAdmin = await Admin.findOne({ _id: id, role: "super_admin" });

    if (!superAdmin) {
        return res
            .status(404)
            .json(new ApiResponse(404, null, "Super Admin not found", false));
    }

    if (name) superAdmin.name = name;
    if (email) superAdmin.email = email;
    if (password) superAdmin.password = password; // Pre-save hook will hash it

    await superAdmin.save();

    const updatedSuperAdmin = await Admin.findById(id).select("-password");

    res.json(
        new ApiResponse(
            200,
            updatedSuperAdmin,
            "Super Admin updated successfully",
            true
        )
    );
});

const deleteSuperAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Prevent deleting the currently logged-in super admin (optional but good practice)
    if (req.admin._id.toString() === id) {
        return res
            .status(400)
            .json(new ApiResponse(400, null, "You cannot delete yourself", false));
    }

    const superAdmin = await Admin.findOne({ _id: id, role: "super_admin" });

    if (!superAdmin) {
        return res
            .status(404)
            .json(new ApiResponse(404, null, "Super Admin not found", false));
    }

    await superAdmin.deleteOne();

    res.json(
        new ApiResponse(200, null, "Super Admin deleted successfully", true)
    );
});

const getSingleSuperAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const superAdmin = await Admin.findOne({ _id: id, role: "super_admin" }).select("-password");;
    if (!superAdmin) {
        return res
            .status(404)
            .json(new ApiResponse(404, null, "Super Admin not found", false));
    }
    res.json(new ApiResponse(200, superAdmin, "Super Admin fetched successfully", true));
});

module.exports = {
    getAllSuperAdmins,
    createSuperAdmin,
    updateSuperAdmin,
    deleteSuperAdmin,
    getSingleSuperAdmin
};
