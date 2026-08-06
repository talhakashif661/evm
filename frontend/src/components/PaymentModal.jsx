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
  const [cardholderName, setCardholderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    setSubmitting(true);
    setError(null);

    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: elements.getElement(CardElement),
        billing_details: { name: cardholderName },
      },
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
      <label
        htmlFor="cardholder-name"
        style={{
          display: 'block',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          marginBottom: 6,
        }}
      >
        Cardholder Name
      </label>
      <input
        id="cardholder-name"
        type="text"
        required
        placeholder="Name on card"
        value={cardholderName}
        onChange={(e) => setCardholderName(e.target.value)}
        className="mb-3"
        style={{
          width: '100%',
          padding: '12px 14px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          fontSize: '0.95rem',
        }}
      />
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

const formatCardNumber = (value) =>
  value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();

const formatExpiry = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
};

const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

// Local-dev mode: the backend (createPaymentIntent in booking.controller.js)
// already activated the booking server-side before this response came back —
// there's no real Stripe to confirm with, so this form's fields are never
// sent anywhere. It exists so the checkout still *looks and behaves* like a
// real card form (validation included) instead of skipping straight to a
// spinner; submitting it plays the same "confirming -> confirmed" feedback
// the real flow gives, on a short fixed delay instead of waiting on Stripe.
function MockPaymentPanel({ amount, onSuccess }) {
  const [name, setName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('form'); // 'form' | 'confirming' | 'confirmed'

  useEffect(() => {
    if (stage !== 'confirming') return undefined;
    const confirmTimer = setTimeout(() => setStage('confirmed'), 500);
    const closeTimer = setTimeout(() => onSuccess(), 1200);
    return () => {
      clearTimeout(confirmTimer);
      clearTimeout(closeTimer);
    };
  }, [stage, onSuccess]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter the name on the card.');
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length !== 16) return setError('Card number must be 16 digits.');
    const expiryMatch = /^(\d{2})\/(\d{2})$/.exec(expiry);
    if (!expiryMatch) return setError('Enter expiry as MM/YY.');
    const month = Number(expiryMatch[1]);
    const year = 2000 + Number(expiryMatch[2]);
    if (month < 1 || month > 12) return setError('Expiry month must be 01-12.');
    const now = new Date();
    if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
      return setError('Card has expired.');
    }
    if (!/^\d{3,4}$/.test(cvc)) return setError('CVC must be 3-4 digits.');

    setError(null);
    setStage('confirming');
  };

  if (stage !== 'form') {
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
            {stage === 'confirmed' ? 'Payment confirmed' : 'Processing payment...'}
          </p>
          {stage !== 'confirmed' && <div className="ev-spinner" style={{ width: 20, height: 20 }} />}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 16 }}>
        Amount due: <strong style={{ color: 'var(--gold)' }}>{toPKR(amount)}</strong>
      </p>

      <label htmlFor="mock-name" style={labelStyle}>
        Cardholder Name
      </label>
      <input
        id="mock-name"
        type="text"
        placeholder="Name on card"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-3"
        style={inputStyle}
      />

      <label htmlFor="mock-card-number" style={labelStyle}>
        Card Number
      </label>
      <input
        id="mock-card-number"
        type="text"
        inputMode="numeric"
        placeholder="4242 4242 4242 4242"
        value={cardNumber}
        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
        className="mb-3"
        style={inputStyle}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="mock-expiry" style={labelStyle}>
            Expiry
          </label>
          <input
            id="mock-expiry"
            type="text"
            inputMode="numeric"
            placeholder="MM/YY"
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="mock-cvc" style={labelStyle}>
            CVC
          </label>
          <input
            id="mock-cvc"
            type="text"
            inputMode="numeric"
            placeholder="123"
            value={cvc}
            onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
            style={inputStyle}
          />
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 12 }}>{error}</p>
      )}

      <button
        type="submit"
        className="btn-gold"
        style={{
          width: '100%',
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Lock size={15} /> {`Pay ${toPKR(amount)}`}
      </button>
    </form>
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
