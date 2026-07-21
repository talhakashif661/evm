import express from 'express';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { isValidImageDataUrl } from '../utils/validateImageBytes.js';

const router = express.Router();

// 50KB cap on the decoded avatar image keeps documents small and friendly
// to MongoDB's free tier (M0) storage limits.
const MAX_AVATAR_BYTES = 50 * 1024;

router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { name, phone, avatar } = req.body;
    const data = {};
    if (name) data.name = name;
    if (phone !== undefined) data.phone = phone;

    if (avatar !== undefined) {
      if (avatar === null || avatar === '') {
        data.avatar = null; // allow removing the avatar
      } else {
        if (!isValidImageDataUrl(avatar)) {
          return res
            .status(400)
            .json({ success: false, message: 'Avatar must be a valid image (JPEG, PNG, or WebP)' });
        }
        const base64Part = avatar.split(',')[1] || '';
        const byteLength = Math.floor((base64Part.length * 3) / 4);
        if (byteLength > MAX_AVATAR_BYTES) {
          return res.status(413).json({
            success: false,
            message: `Avatar too large (${Math.round(byteLength / 1024)}KB). Please use an image under 50KB.`,
          });
        }
        data.avatar = avatar;
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatar: true,
        isVerified: true,
      },
    });
    res.json({ success: true, message: 'Profile updated', data: updated });
  } catch (e) {
    next(e);
  }
});

export default router;
