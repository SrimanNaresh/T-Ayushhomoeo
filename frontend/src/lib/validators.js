// Field checks shared by the master screens (as in Ayush ALL IN ONE src/utils/validators.js).
// Each returns true when the value is empty or valid, so optional fields pass when left blank.
export const isDigits = (v) => !v || /^\d+$/.test(String(v).replace(/\s/g, ''));
export const isEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const isPincode = (v) => !v || /^\d{6}$/.test(v);
export const isGstin = (v) => !v || /^[0-9A-Z]{15}$/.test(v);

/** Phone boxes: digits only (spaces allowed while typing), at most `max` digits. */
export const digitsOnly = (v, max = 15) => String(v).replace(/[^\d ]/g, '').slice(0, max + 3);
