const Razorpay = require('razorpay');

let instance = null;

function getRazorpayInstance() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (key_id && key_secret) {
    if (!instance || instance.key_id !== key_id) {
      instance = new Razorpay({ key_id, key_secret });
    }
    return instance;
  }
  return null;
}

const razorpayProxy = new Proxy({}, {
  get(target, prop) {
    const rzp = getRazorpayInstance();
    if (!rzp) {
      console.warn(`[Razorpay] Warning: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not configured. Accessed property: ${prop}`);
      return new Proxy({}, {
        get(innerTarget, innerProp) {
          return async () => {
            throw new Error(
              "Razorpay credentials missing. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file."
            );
          };
        }
      });
    }
    return rzp[prop];
  }
});

module.exports = razorpayProxy;

