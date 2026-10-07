module.exports = {
  email: process.env.SHIPROCKET_EMAIL || "",
  password: process.env.SHIPROCKET_PASSWORD || "",
  baseUrl: (process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in/v1/external").replace(/\/+$/, ""),
  pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || "Shagun Beauty",
  webhookToken: process.env.SHIPROCKET_WEBHOOK_TOKEN || "",
  defaultDimensions: {
    length: parseFloat(process.env.SHIPROCKET_DEFAULT_LENGTH || "10"),
    breadth: parseFloat(process.env.SHIPROCKET_DEFAULT_BREADTH || "10"),
    height: parseFloat(process.env.SHIPROCKET_DEFAULT_HEIGHT || "5"),
    weight: parseFloat(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || "0.5"),
  },
};
