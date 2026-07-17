const { asyncHandler } = require("../../../common/asyncHandler");
const Admin = require("../../../models/adminModel");
const ApiResponse = require("../../../utils/ApiResponse");
const {
  generateAccessToken,
  // generateRefreshToken,
} = require("../../../utils/auth");

const getAllAdmins = asyncHandler(async (req, res) => {
  const { search = "", page = 1, per_page = 50 } = req.query;

  const superAdminId = req.admin._id;

  if (!superAdminId) {
    return res.json(new ApiResponse(404, null, "Not authorized"));
  }

  const query = { role: "admin" };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * per_page;

  const admins = await Admin.find(query)
    .select("-password")
    .skip(skip)
    .limit(parseInt(per_page, 10));

  const totalAdmins = await Admin.countDocuments(query);

  res.json(
    new ApiResponse(
      200,
      { data: admins, total: totalAdmins },
      "Admins fetched successfully",
      true
    )
  );
});

const registerAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const adminExists = await Admin.findOne({ email });

  if (adminExists) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Admin already exists", false));
  }

  const admin = await Admin.create({
    name,
    email,
    password,
    role,
  });

  const accessToken = generateAccessToken(admin._id);
  //   const refreshToken = generateRefreshToken(admin._id);

  const data = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    token: accessToken,
    role: admin.role,
  };

  res.json(new ApiResponse(201, data, "New admin created successfully", true));
});

const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email });
  if (!admin || !(await admin.matchPassword(password))) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Invalid credentials", false));
  }

  const accessToken = generateAccessToken(admin._id);
  //   const refreshToken = generateRefreshToken(admin._id);
  //   sendRefreshToken(res, refreshToken);

  const data = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    token: accessToken,
  };

  res.json(new ApiResponse(200, data, "Admin login successful", true));
});

const updateAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, role } = req.body;

  const admin = await Admin.findById(id);
  if (!admin) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Admin not found", false));
  }

  if (name) admin.name = name;
  if (email) admin.email = email;
  if (role) admin.role = role;

  await admin.save();

  const updatedAdmin = await Admin.findById(id);

  res.json(
    new ApiResponse(200, updatedAdmin, "Admin updated successfully", true)
  );
});

const deleteAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const admin = await Admin.findById(id);
  if (!admin) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Admin not found", false));
  }

  await admin.deleteOne();

  res.json(new ApiResponse(200, null, "Admin deleted successfully", true));
});

const getAllSubAdmins = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;

  const subAdmins = await Admin.find({
    role: "sub_admin",
    created_by: adminId,
  }).select("-password");

  res.json(
    new ApiResponse(200, subAdmins, "Sub Admins fetched successfully", true)
  );
});

const registerSubAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const reqAdmin = req.admin;
  const adminId = reqAdmin.id;

  if (reqAdmin.role !== "admin") {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Only admin can create sub admin", false)
      );
  }

  const admin = await Admin.findOne({ email });

  if (admin) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Sub Admin already exists", false));
  }

  const subAdmin = await Admin.create({
    name,
    email,
    password,
    role: "sub_admin",
    created_by: adminId,
  });

  const accessToken = generateAccessToken(subAdmin._id);

  const data = {
    id: subAdmin.id,
    name: subAdmin.name,
    email: subAdmin.email,
    token: accessToken,
    role: subAdmin.role,
    created_by: subAdmin.created_by,
  };

  res.json(
    new ApiResponse(201, data, "New sub admin created successfully", true)
  );
});

const getSingleAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const admin = await Admin.findById(id);
  if (!admin) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Admin not found", false));
  }
  res.json(new ApiResponse(200, admin, "Admin fetched successfully", true));
});

module.exports = {
  getAllAdmins,
  registerAdmin,
  loginAdmin,
  updateAdmin,
  deleteAdmin,
  getAllSubAdmins,
  registerSubAdmin,
  getSingleAdmin,
};
