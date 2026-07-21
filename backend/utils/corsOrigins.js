// Shared by app.js (Express CORS) and server.js (Socket.IO CORS) so the two
// allow-lists can't drift apart. localhost:3000 is only included outside
// production — previously it was hardcoded into both files unconditionally,
// which meant a production deploy still accepted requests whose Origin
// header claimed to be http://localhost:3000.
export const getAllowedOrigins = () => {
  const origins = [process.env.CLIENT_URL].filter(Boolean);
  if (process.env.NODE_ENV !== 'production') origins.push('http://localhost:3000');
  return origins;
};
