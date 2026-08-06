import prisma from '../utils/prisma.js';
import { audit } from '../utils/audit.js';
import { verifyToken } from '../utils/jwt.js';
import { paginationMeta } from '../utils/pagination.js';

/**
 * POST /api/complaints — public.
 *
 * Anyone (guest or logged-in) can file a complaint from the Contact page.
 * If a valid Bearer token happens to be present we record the account id as
 * bonus metadata, but we NEVER require it — that's why this does its own
 * lightweight token peek instead of using the `authenticate` middleware
 * (which would 401 guests).
 */
export const createComplaint = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    let userId = null;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const decoded = verifyToken(header.slice(7));
        userId = decoded.id ?? null;
      } catch {
        // Invalid/expired token -> treat as guest, don't block the complaint.
      }
    }

    const complaint = await prisma.complaint.create({
      data: {
        userId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        subject: subject.trim(),
        message: message.trim(),
      },
    });

    res.status(201).json({
      success: true,
      message: 'Complaint received — the admin team will get back to you.',
      data: complaint,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/complaints — admin inbox, newest first, paginated.
export const getComplaints = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const take = Math.min(parseInt(limit) || 10, 50);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.complaint.count(),
    ]);

    res.json({
      success: true,
      data: complaints,
      pagination: paginationMeta(total, Math.max(parseInt(page) || 1, 1), take),
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/complaints/:id — admin, after handling it. Audited.
export const deleteComplaint = async (req, res, next) => {
  try {
    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    await prisma.complaint.delete({ where: { id: req.params.id } });

    audit(
      req,
      'COMPLAINT_DELETED',
      `Deleted complaint "${complaint.subject}" from ${complaint.email}`
    );

    res.json({ success: true, message: 'Complaint deleted' });
  } catch (error) {
    next(error);
  }
};
