const fs = require("fs/promises");
const { cloudinary_js_config } = require("../../config/cloudinary");

exports.uploadSingleFile = async (filePath, folder = "") => {
  try {
    const result = await cloudinary_js_config.uploader.upload(filePath, { folder });
    await fs.unlink(filePath);

    return result.secure_url;
  } catch (error) {
    throw new Error(`Single File Upload Error: ${error.message}`);
  }
};

exports.uploadMultipleFiles = async (files, folder = "") => {
  try {
    const uploadedUrls = [];
    for (const file of files) {
      const result = await cloudinary_js_config.uploader.upload(file.path, { folder });
      uploadedUrls.push(result.secure_url);
      await fs.unlink(file.path);
    }
    return uploadedUrls;
  } catch (error) {
    throw new Error(`Multiple File Upload Error: ${error.message}`);
  }
};

exports.uploadVoiceNote = async (filePath, folder = "") => {
  try {
    const result = await cloudinary_js_config.uploader.upload(filePath, {
      folder,
      resource_type: "video",
    });
    await fs.unlink(filePath);
    return result.secure_url;
  } catch (error) {
    throw new Error(`Voice Note Upload Error: ${error.message}`);
  }
};

exports.uploadPDF = async (filePath, folder = "") => {
  try {
    const result = await cloudinary_js_config.uploader.upload(filePath, {
      folder,
      resource_type: "raw",
    });
    await fs.unlink(filePath);
    return result.secure_url;
  } catch (error) {
    throw new Error(`PDF Upload Error: ${error.message}`);
  }
};

exports.uploadFromUrl = async (imageUrl, folder = "") => {
  try {
    if (imageUrl.includes("res.cloudinary.com")) {
      return imageUrl;
    }

    const result = await cloudinary_js_config.uploader.upload(imageUrl, {
      folder,
      resource_type: "image",
    });
    return result.secure_url;
  } catch (error) {
    throw new Error(`URL Upload Error for ${imageUrl}: ${error.message}`);
  }
};

exports.migrateImagesToCloudinary = async (imageUrls, folder = "") => {
  try {
    const uploadedUrls = [];
    for (const url of imageUrls) {
      if (url && typeof url === "string") {
        const newUrl = await exports.uploadFromUrl(url, folder);
        uploadedUrls.push(newUrl);
      }
    }
    return uploadedUrls;
  } catch (error) {
    throw new Error(`Image Migration Error: ${error.message}`);
  }
};