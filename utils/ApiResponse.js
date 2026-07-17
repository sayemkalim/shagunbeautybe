class ApiResponse {
  constructor(statusCode, data, message = "Success", success = true) {
    this.data = data;
    this.message = message;
    this.success = success;
    this.statusCode = statusCode;
  }
}

module.exports = ApiResponse;
