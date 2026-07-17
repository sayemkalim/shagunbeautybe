const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const ConatactService = require("../../services/contact_us/index.js");
const ContactRepositories = require("../../repositories/contact/index.js");

const postUserQuery = asyncHandler(async (req, res) => {
  const { name, email, subject } = req.body;

  if (!name || !email || !subject) {
    throw new ApiResponse(404, null, "Required Filled are missing", false);
  }
  const userMessage = await ConatactService.submitUserForm(
    name,
    email,
    subject
  );
  return res.json(
    new ApiResponse(201, userMessage, "Form submitted successfully", true)
  );
});

const getUserQueries = asyncHandler(async (req, res) => {
  const {
    search = "",
    page = 1,
    per_page = 10,
    start_date,
    end_date,
  } = req.query;
  const trimmedSearch = search.trim();

  const filter = {
    ...(trimmedSearch
      ? {
          $or: [
            { name: { $regex: trimmedSearch, $options: "i" } },
            { email: { $regex: trimmedSearch, $options: "i" } },
            { subject: { $regex: trimmedSearch, $options: "i" } },
          ],
        }
      : {}),
    ...(start_date || end_date
      ? {
          createdAt: {
            ...(start_date && { $gte: new Date(start_date) }),
            ...(end_date && { $lte: new Date(end_date) }),
          },
        }
      : {}),
  };

  const skip = (parseInt(page, 10) - 1) * parseInt(per_page, 10);
  const limit = parseInt(per_page, 10);

  const [userQueries, total] = await Promise.all([
    ContactRepositories.getAllUserQueries(filter, skip, limit),
    ContactRepositories.countUserQueries(filter),
  ]);

  return res.json(
    new ApiResponse(
      200,
      { data: userQueries, total },
      "Form queries fetched successfully",
      true
    )
  );
});
const deleteUserQueries = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!id) {
    throw new ApiResponse(404, null, "Required Filled are missing", false);
  }
  const userMessage = await ContactRepositories.deleteUserQueries(id);
  return res.json(
    new ApiResponse(201, userMessage, "Form submitted successfully", true)
  );
});

module.exports = {
  postUserQuery,
  getUserQueries,
  deleteUserQueries,
};
