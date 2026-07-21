// Prisma's `contains`/`startsWith` compile to a MongoDB $regex on this
// connector — any regex metacharacters in user-supplied search text (e.g.
// "a+", "(", "a{50,}") would otherwise reach it unescaped. Used everywhere a
// raw user string flows into a `contains` filter.
export const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
