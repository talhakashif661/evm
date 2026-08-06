import nodemailer from 'nodemailer';
import logger from './logger.js';

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const missingSmtpConfig = () =>
  ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'].filter((key) => !process.env[key]);

const sendWithSmtp = async ({ to, subject, html }) => {
  const missing = missingSmtpConfig();
  if (missing.length > 0) {
    logger.warn(`SMTP email is not configured. Skipping email to ${to} ("${subject}")`);
    const detail = `SMTP email is not configured; missing ${missing.join(', ')}`;
    return { success: false, error: detail };
  }

  const info = await createTransporter().sendMail({
    to,
    from: process.env.EMAIL_FROM,
    subject,
    html,
  });

  return { success: true, messageId: info.messageId };
};

export const sendEmail = async ({ to, subject, html }) => {
  try {
    const result = await sendWithSmtp({ to, subject, html });

    if (result.success) {
      logger.info(`Email sent to ${to}: ${result.messageId}`);
    }
    return result;
  } catch (error) {
    // Never throw from here - email failures should never crash a request.
    // The caller treats this as fire-and-forget; we just log and move on.
    const detail = error.response?.body?.errors?.map((e) => e.message).join('; ') || error.message;
    logger.error(`Failed to send email to ${to}:`, detail);
    return { success: false, error: detail };
  }
};

import { html, raw } from './escapeHtml.js';

export const emailTemplates = {
  welcome: (name) => ({
    subject: '⚡ Welcome to ChargeEV',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#1A1A1A">Welcome, ${name}! ⚡</h1>
        <p>Your account has been created successfully on ChargeEV.</p>
        <p>Start exploring nearby charging stations and manage your EV with ease.</p>
        <a
          href="${process.env.CLIENT_URL}"
          style="background:#1A1A1A;color:#FDF8F0;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold"
          >Get Started</a
        >
        <p style="color:#8A8A8A;margin-top:20px">The ChargeEV Team</p>
      </div>
    `,
  }),

  bookingConfirmed: (name, slotInfo) => ({
    subject: '✅ Booking Confirmed - ChargeEV',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#1A1A1A">Booking Confirmed! ✅</h1>
        <p>Hi ${name}, your charging slot has been booked successfully.</p>
        <div style="background:#ffffff;padding:20px;border-radius:8px;margin:20px 0">
          <p><strong>Station:</strong> ${slotInfo.stationName}</p>
          <p><strong>Slot:</strong> #${slotInfo.slotNumber}</p>
          <p><strong>Time:</strong> ${slotInfo.startTime}</p>
        </div>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  stationApproved: (ownerName, stationName) => ({
    subject: '🎉 Station Approved - ChargeEV',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#1A1A1A">Station Approved! 🎉</h1>
        <p>Hi ${ownerName}, your charging station "${stationName}" has been approved.</p>
        <p>You can now start receiving bookings from EV users.</p>
        <a
          href="${process.env.CLIENT_URL}"
          style="background:#1A1A1A;color:#FDF8F0;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold"
          >Manage Station</a
        >
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  stationRejected: (ownerName, stationName) => ({
    subject: 'Station Application Update - ChargeEV',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#B33A3A">Station Not Approved</h1>
        <p>
          Hi ${ownerName}, your charging station "${stationName}" was not approved in its current
          form.
        </p>
        <p>
          You can update its details and resubmit it for another review any time from your station
          dashboard.
        </p>
        <a
          href="${process.env.CLIENT_URL}"
          style="background:#1A1A1A;color:#FDF8F0;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold"
          >Edit Station</a
        >
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  stationUpdateApproved: (ownerName, stationName) => ({
    subject: '✅ Station Change Approved - ChargeEV',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#1A1A1A">Change Approved</h1>
        <p>
          Hi ${ownerName}, your requested address/price change for "${stationName}" has been
          approved and is now live.
        </p>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  stationUpdateRejected: (ownerName, stationName, adminNote) => ({
    subject: 'Station Change Request Update - ChargeEV',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#B33A3A">Change Not Approved</h1>
        <p>
          Hi ${ownerName}, your requested address/price change for "${stationName}" was not
          approved.
        </p>
        ${adminNote ? raw(html`<p><strong>Admin note:</strong> ${adminNote}</p>`) : ''}
        <p>Your station's current address and price are unchanged. You can submit a new request any time.</p>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  passwordReset: (name, resetUrl) => ({
    subject: '🔑 Reset Your Password - ChargeEV',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#1A1A1A">Reset Your Password</h1>
        <p>Hi ${name}, we received a request to reset your password.</p>
        <p>
          This link expires in 30 minutes. If you didn't request this, you can safely ignore this
          email.
        </p>
        <a
          href="${resetUrl}"
          style="background:#1A1A1A;color:#FDF8F0;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold"
          >Reset Password</a
        >
        <p style="color:#8A8A8A;margin-top:16px">Or copy this link: ${resetUrl}</p>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  auctionWon: (name, slotInfo) => ({
    subject: '🏆 Auction Won - ChargeEV',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#1A1A1A">You Won the Auction! 🏆</h1>
        <p>Congratulations ${name}! Your bid was successful.</p>
        <div style="background:#ffffff;padding:20px;border-radius:8px;margin:20px 0">
          <p><strong>Station:</strong> ${slotInfo.stationName}</p>
          <p><strong>Slot:</strong> #${slotInfo.slotNumber}</p>
          <p><strong>Your Bid:</strong> Rs. ${slotInfo.bidAmount}</p>
        </div>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  auctionLost: (name, slotInfo) => ({
    subject: 'Auction Results - ChargeEV',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#1A1A1A">Auction Closed</h1>
        <p>
          Hi ${name}, the auction for Slot #${slotInfo.slotNumber} at
          <strong>${slotInfo.stationName}</strong> has closed and another bid was selected this
          time.
        </p>
        <p style="color:#8A8A8A">
          Keep an eye out for the next auction on this slot, or book it directly when it's not in
          auction mode.
        </p>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  bookingNoShow: (name, slotInfo) => ({
    subject: '⏱️ Booking Cancelled - No Show',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#B33A3A">Booking Cancelled</h1>
        <p>
          Hi ${name}, your booking at <strong>${slotInfo.stationName}</strong> (Slot
          #${slotInfo.slotNumber}) was cancelled because you didn't check in within
          ${slotInfo.noShowMinutes} minutes of the start time.
        </p>
        <p style="color:#8A8A8A">Feel free to book another slot any time.</p>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  ownerBookingExpired: (name, slotInfo) => ({
    subject: 'Booking Expired - Slot Updated',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#B33A3A">Booking Expired</h1>
        <p>
          Hi ${name}, ${slotInfo.customerName}'s booking for Slot #${slotInfo.slotNumber} at
          <strong>${slotInfo.stationName}</strong> expired because they did not check in on time.
        </p>
        <p>
          ${
            slotInfo.slotReleased
              ? 'The slot is available for other customers now.'
              : 'The slot kept its offline, faulted, or maintenance status and was not made available.'
          }
        </p>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  auctionWinExpired: (name, slotInfo) => ({
    subject: '⏱️ Auction Win Expired - Not Claimed',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#B33A3A">Auction Win Expired</h1>
        <p>
          Hi ${name}, your winning auction bid at <strong>${slotInfo.stationName}</strong> (Slot
          #${slotInfo.slotNumber}) was cancelled because it wasn't claimed (checked in) in time.
        </p>
        <p style="color:#8A8A8A">
          The slot has been freed up. Feel free to bid on the next auction any time.
        </p>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  bookingPaymentTimeout: (name, slotInfo) => ({
    subject: '⏱️ Booking Cancelled - Payment Not Received',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#B33A3A">Booking Cancelled</h1>
        <p>
          Hi ${name}, your checked-in booking at <strong>${slotInfo.stationName}</strong> (Slot
          #${slotInfo.slotNumber}) was cancelled because payment wasn't completed in time.
        </p>
        <p style="color:#8A8A8A">Feel free to book another slot any time.</p>
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  chargingEmergencyStopped: (name, info) => ({
    subject: '🛑 Charging Session Stopped Early',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#B33A3A">Charging Session Stopped</h1>
        <p>
          Hi ${name}, the station stopped your charging session at
          <strong>${info.stationName}</strong> (Slot #${info.slotNumber}) before it finished.
        </p>
        <p><strong>Reason given:</strong> ${info.reason}</p>
        <p><strong>Amount billed for actual usage:</strong> Rs. ${info.finalBill}</p>
        ${info.refundAmount
          ? raw(
              `<p><strong>Rs. ${info.refundAmount} of your original payment has been refunded</strong> to your original payment method and should appear within a few business days.</p>`
            )
          : ''}
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),

  bookingOwnerCancelled: (name, slotInfo) => ({
    subject: '❌ Booking Cancelled by Station',
    html: html`
      <div
        style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px"
      >
        <h1 style="color:#B33A3A">Booking Cancelled</h1>
        <p>
          Hi ${name}, your booking at <strong>${slotInfo.stationName}</strong> (Slot
          #${slotInfo.slotNumber}) was cancelled by the station.
        </p>
        ${slotInfo.finalBill != null
          ? raw(`<p><strong>Amount billed for actual usage:</strong> Rs. ${slotInfo.finalBill}</p>`)
          : ''}
        ${slotInfo.refundAmount
          ? raw(
              `<p><strong>Rs. ${slotInfo.refundAmount} of your payment has been refunded</strong> to your original payment method and should appear within a few business days.</p>`
            )
          : ''}
        <p style="color:#8A8A8A">The ChargeEV Team</p>
      </div>
    `,
  }),
};
