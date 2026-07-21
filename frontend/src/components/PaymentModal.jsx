import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Lock, Zap } from 'lucide-react';
import { Modal } from './Spinner';
import { toPKR } from '../utils/pkr';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: 'var(--text-primary)',
      '::placeholder': { color: 'var(--text-muted)' },
    },
    invalid: { color: 'var(--danger)' },
  },
};

function CheckoutForm({ clientSecret, amount, onSuccess, onClose }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    setSubmitting(true);
    setError(null);

    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) },
    });

    if (stripeError) {
      setError(stripeError.message);
      setSubmitting(false);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      onSuccess();
    } else {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 16 }}>
        Amount due: <strong style={{ color: 'var(--gold)' }}>{toPKR(amount)}</strong>
      </p>
      <div
        className="mb-3"
        style={{
          padding: 14,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-elevated)',
        }}
      >
        <CardElement options={cardElementOptions} />
      </div>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 12 }}>{error}</p>
      )}
      <button
        type="submit"
        className="btn-gold"
        disabled={!stripe || submitting}
        style={{
          width: '100%',
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: submitting ? 0.7 : 1,
        }}
      >
        <Lock size={15} /> {submitting ? 'Processing...' : `Pay ${toPKR(amount)}`}
      </button>
    </form>
  );
}

// Local-dev mode: the backend (createPaymentIntent in booking.controller.js)
// already activated the booking server-side before this response came back —
// no card entry needed, since there's no real Stripe to confirm with. This
// panel is purely the same "confirming -> confirmed" feedback the real flow
// gives, on a short fixed delay instead of waiting on Stripe/the webhook.
function MockPaymentPanel({ amount, onSuccess }) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const confirmTimer = setTimeout(() => setConfirmed(true), 500);
    const closeTimer = setTimeout(() => onSuccess(), 1200);
    return () => {
      clearTimeout(confirmTimer);
      clearTimeout(closeTimer);
    };
  }, [onSuccess]);

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 16 }}>
        Amount due: <strong style={{ color: 'var(--gold)' }}>{toPKR(amount)}</strong>
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          padding: '20px 14px',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          background: 'var(--bg-elevated)',
        }}
      >
        <Zap size={22} color="var(--gold)" />
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
          {confirmed ? 'Mock payment confirmed' : 'Simulating payment (local development mode)...'}
        </p>
        {!confirmed && <div className="ev-spinner" style={{ width: 20, height: 20 }} />}
      </div>
    </div>
  );
}

// Wraps Stripe Elements setup — clientSecret comes from
// POST /bookings/:id/payment-intent (see bookingSlice's createPaymentIntent).
// onSuccess fires once Stripe confirms the card charge; the booking itself
// only flips to ACTIVE once the webhook lands, which the caller listens for
// over the user:<id> socket room (see Bookings.jsx). In mock mode (no real
// Stripe key configured backend-side) that endpoint returns mock: true and
// no clientSecret — the booking is already ACTIVE by the time this renders.
export default function PaymentModal({ show, onClose, clientSecret, amount, mock, onSuccess }) {
  return (
    <Modal show={show} onClose={onClose} title="Complete Payment">
      {mock ? (
        <MockPaymentPanel amount={amount} onSuccess={onSuccess} />
      ) : clientSecret ? (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <CheckoutForm
            clientSecret={clientSecret}
            amount={amount}
            onSuccess={onSuccess}
            onClose={onClose}
          />
        </Elements>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <div className="ev-spinner" />
        </div>
      )}
    </Modal>
  );
}

CheckoutForm.propTypes = {
  clientSecret: PropTypes.string,
  amount: PropTypes.number.isRequired,
  onSuccess: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

MockPaymentPanel.propTypes = {
  amount: PropTypes.number.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

PaymentModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  clientSecret: PropTypes.string,
  amount: PropTypes.number.isRequired,
  mock: PropTypes.bool,
  onSuccess: PropTypes.func.isRequired,
};
