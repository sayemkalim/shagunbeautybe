const ContactForm = require("../../models/contactUsModel");

const createNewForm = async (name, email, subject) => {
  return await ContactForm.create({
    name,
    email,
    subject,
  });
};

const getAllUserQueries = (filter = {}, skip = 0, limit = 10) =>
  ContactForm.find(filter).skip(skip).limit(limit);

const countUserQueries = (filter = {}) => ContactForm.countDocuments(filter);

const deleteUserQueries = async (id) => {
  return await ContactForm.findByIdAndDelete(id);
};

module.exports = {
  createNewForm,
  getAllUserQueries,
  deleteUserQueries,
  countUserQueries,
};
