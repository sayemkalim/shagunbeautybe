const { asyncHandler } = require("../../common/asyncHandler.js");
const mongoose = require("mongoose");
const ApiResponse = require("../../utils/ApiResponse.js");
const BlogService = require("../../services/blogs/index.js");
const BlogRepositories = require("../../repositories/blogs/index.js");
const { uploadSingleFile } = require("../../utils/upload/index.js");
const Blog = require("../../models/blogModel.js");

const postBlogs = asyncHandler(async (req, res) => {
  const adminId = req.admin.id;

  if (!adminId) {
    return res.json(new ApiResponse(404, null, "Not authorized"));
  }

  const { title, short_description, content, is_featured } = req.body;
  const bannerImageFile = req.file;

  if (!title || !short_description || !content || !bannerImageFile) {
    throw new ApiResponse(404, null, "Required Filled are missing", false);
  }

  const banner_image_url = await uploadSingleFile(
    bannerImageFile.path,
    "uploads/images"
  );

  const userMessage = await BlogService.addNewBlog(
    title,
    short_description,
    content,
    banner_image_url,
    is_featured,
    adminId
  );
  return res.json(
    new ApiResponse(201, userMessage, "Blog created successfully", true)
  );
});

const getBlogs = asyncHandler(async (req, res) => {
  const {
    search,
    page,
    per_page = 50,
    featured = false,
    published = false,
  } = req.query;

  const filters = {
    ...(search && { title: { $regex: search, $options: "i" } }),
    ...(featured && { isFeatured: featured === "true" }),
    ...(published && { published: published === "true" }),
  };

  const blogs = await BlogRepositories.getAllBlogs({
    filters,
    page: parseInt(page),
    per_page: parseInt(per_page),
  });

  if (!blogs || blogs.length === 0) {
    return res.json(new ApiResponse(201, [], "No Blogs Found", false));
  }

  return res.json(
    new ApiResponse(201, blogs, "Blogs Fetched successfully", true)
  );
});

const getSingleBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid blog ID format", false)
    );
  }
  const blog = await BlogRepositories.getSingleBlogById(id);
  if (!blog) {
    return res.json(new ApiResponse(404, null, "No Blog Found", false));
  }
  return res.json(
    new ApiResponse(201, blog, "Blog Fetched successfully", true)
  );
});

const updateBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid blog ID format", false)
    );
  }

  const bannerImageFile = req.file;
  let bannerImageUrl = null;

  if (bannerImageFile) {
    bannerImageUrl = await uploadSingleFile(
      bannerImageFile.path,
      "uploads/images"
    );
  }

  const data = {
    ...req.body,
  };
  
  if (bannerImageUrl) {
    data.banner_image_url = bannerImageUrl;
  }

  const blog = await BlogService.updateBlog(id, data);

  return res.json(
    new ApiResponse(201, blog, "Blog Updated successfully", true)
  );
});

const deleteBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid blog ID format", false)
    );
  }
  const blog = await Blog.findById(id);

  if (!blog) {
    return res.json(new ApiResponse(404, null, "No Blog Found", false));
  }
  await Blog.findByIdAndDelete(id);
  return res.json(
    new ApiResponse(201, null, "Blog Deleted successfully", true)
  );
});

module.exports = {
  postBlogs,
  getBlogs,
  getSingleBlog,
  updateBlog,
  deleteBlog,
};
