import { body } from 'express-validator';

export const createBookingRules = [
  body('evId')
    .notEmpty()
    .withMessage('An EV is required')
    .isMongoId()
    .withMessage('evId must be a valid id'),
  body('slotId')
    .notEmpty()
    .withMessage('A slot is required')
    .isMongoId()
    .withMessage('slotId must be a valid id'),
  body('startTime')
    .notEmpty()
    .withMessage('Start time is required')
    .isISO8601()
    .withMessage('Start time must be a valid date/time'),
  body('durationMinutes')
    .optional()
    .isInt({ min: 15, max: 1440 })
    .withMessage('Duration must be between 15 and 1440 minutes'),
];

export const placeBidRules = [
  body('slotId')
    .notEmpty()
    .withMessage('A slot is required')
    .isMongoId()
    .withMessage('slotId must be a valid id'),
  body('amount').isFloat({ gt: 0 }).withMessage('Bid amount must be a positive number'),
  body('batteryLevel')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Battery level must be between 0 and 100'),
];
