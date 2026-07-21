import { validationResult } from 'express-validator';

// Drop this after any array of express-validator check(...) rules. It never
// touches the rules themselves — it just turns their accumulated errors into
// a single, consistent 400 response instead of each controller re-implementing
// its own ad-hoc `if (!field)` checks.
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};
