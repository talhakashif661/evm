// Single source of truth for developer/support contact details.
// Shown in the Footer, the Contact page, and the About page.
export const CONTACT = {
  name: 'Talha Kashif',
  phone: '+92 316 8804471',
  email: 'talhakashif131@gmail.com',
  location: 'Punjab University, Lahore, Pakistan',
};

export const waLink = (phone, text = '') =>
  `https://wa.me/${phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
