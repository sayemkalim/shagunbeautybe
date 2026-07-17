const ContactForm = require("../../models/contactUsModel.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const ContactRepositories = require("../../repositories/contact/index.js")

const submitUserForm = async (name, email, subject) => {
    let userform = await ContactRepositories.createNewForm(name, email, subject)
    if(!userform) {
        throw new ApiResponse(400, null, "Form not submitted", false);
    }
    return userform;
}

module.exports = {
    submitUserForm
}