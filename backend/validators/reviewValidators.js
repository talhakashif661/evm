import { body } from 'express-validator';

export const createReviewRules = [
  body('stationId')
    .notEmpty()
    .withMessage('stationId is required')
    .isMongoId()
    .withMessage('stationId must be a valid id'),
  body('rating')
    .notEmpty()
    .withMessage('Rating is required')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be an integer from 1 to 5'),
  body('comment')
    .optional({ values: 'falsy' })
    .isLength({ max: 1000 })
    .withMessage('Comment must be at most 1000 characters'),
];
