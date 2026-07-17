/**
 * Email Helper Functions
 * Shared utilities for email templates
 */

/**
 * Helper to convert Decimal128 to number
 * @param {*} value - Value to convert
 * @returns {number} - Converted number
 */
const toNumber = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  // Handle Decimal128 object format: { '$numberDecimal': '150' }
  if (value.$numberDecimal) return parseFloat(value.$numberDecimal);
  // Handle regular toString
  if (value.toString && typeof value.toString === 'function') {
    const strValue = value.toString();
    if (strValue !== '[object Object]') {
      return parseFloat(strValue);
    }
  }
  return 0;
};

/**
 * Helper to format address, handling undefined values
 * @param {Object} address - Address object
 * @returns {string} - Formatted address HTML string
 */
const formatAddress = (address) => {
  if (!address) return '';
  
  const parts = [];
  
  // Add address line
  if (address.address) parts.push(address.address);
  
  // Add locality if exists
  if (address.locality) parts.push(address.locality);
  
  // Build city/state/pincode line
  const locationParts = [];
  if (address.city) locationParts.push(address.city);
  if (address.state) locationParts.push(address.state);
  if (address.pincode) locationParts.push(address.pincode);
  
  if (locationParts.length > 0) {
    parts.push(locationParts.join(', '));
  }
  
  return parts.filter(Boolean).join('<br>');
};

module.exports = {
  toNumber,
  formatAddress,
};

