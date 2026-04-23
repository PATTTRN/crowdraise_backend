/**
 * Generates a random 6-digit OTP string.
 * @returns {string} A 6-digit numeric OTP.
 */
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = generateOtp;
