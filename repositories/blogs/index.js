const Blog = require("../../models/blogModel");

const createNewBlog = async (data) => {
  return await Blog.create(data);
};

const getAllBlogs = async ({ filters, page, per_page }) => {
  const skip = (page - 1) * per_page;

  const blogs = await Blog.find(filters)
    .populate("author", "-password")
    .skip(skip)
    .sort({ createdAt: -1 })
    .limit(per_page);

  return blogs;
};

const getSingleBlogById = async (id) => {
  return await Blog.findById(id);
};

const updateBlogById = async (id, data) => {
  return await Blog.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createNewBlog,
  getAllBlogs,
  getSingleBlogById,
  updateBlogById,
};
