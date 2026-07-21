// All monetary values (pricePerKwh, totalCost, totalRevenue, bid amounts) are
// stored and entered directly in PKR - this just formats for display, no
// currency conversion.
export const toPKR = (amount) => {
  if (amount === null || amount === undefined || amount === '') return '—';
  return `Rs. ${Math.round(parseFloat(amount)).toLocaleString('en-PK')}`;
};
