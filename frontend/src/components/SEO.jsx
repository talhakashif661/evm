import PropTypes from 'prop-types';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

/**
 * Shared meta-tag component — every page renders one of these instead of
 * hand-writing the same 13 tags. Keeping it in one place means a template
 * change (or fixing a mistake) happens once, not across 24 files.
 *
 * `title` should be the PAGE-SPECIFIC part only (e.g. "My EV Charging
 * Bookings") — this component adds the "ChargeEV - ... | EV Charging Made
 * Simple" wrapper, so don't repeat "ChargeEV" in the prop or it'll appear twice.
 *
 * og:url / og:image / canonical are computed from the real current origin
 * (window.location.origin) rather than a hardcoded domain — this app hasn't
 * been deployed to a permanent domain yet, so a fixed URL here would be a
 * guess. This way it's automatically correct in dev, staging, or production,
 * whatever domain it ends up on.
 *
 * `noIndex`: set true for authenticated/private app pages (dashboards,
 * bookings, profile, payments, admin, auth-flow utility pages). There's no
 * public search value in indexing someone's private booking list, and
 * indexing thin/duplicate-looking authenticated shells is a well-known way
 * to hurt a site's overall search quality signals — so this defaults to
 * false (indexable) and is only flipped on for pages that are genuinely
 * private or add no value as a search result.
 */
export default function SEO({ title, description, noIndex = false, image }) {
  const location = useLocation();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}${location.pathname}`;
  const ogImage = image || `${origin}/og-image.png`;
  const fullTitle = `ChargeEV - ${title} | EV Charging Made Simple`;

  return (
    <Helmet>
      {/* Primary */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      <meta property="og:title" content={`ChargeEV - ${title}`} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={`ChargeEV - ${title}`} />
      <meta name="twitter:description" content={description} />

      {/* Additional */}
      <meta name="robots" content={noIndex ? 'noindex, nofollow' : 'index, follow'} />
      <link rel="canonical" href={url} />
    </Helmet>
  );
}

SEO.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  noIndex: PropTypes.bool,
  image: PropTypes.string,
};
