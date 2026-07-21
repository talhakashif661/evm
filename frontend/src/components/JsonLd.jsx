import PropTypes from 'prop-types';
import { Helmet } from 'react-helmet-async';

/**
 * Renders one or more schema.org JSON-LD blocks via react-helmet-async.
 * Accepts a single schema object or an array of them (e.g. Product + its
 * nested reviews aren't always one object if you want them as siblings).
 */
export default function JsonLd({ data }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <Helmet>
      {items.map((item, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(item)}
        </script>
      ))}
    </Helmet>
  );
}

JsonLd.propTypes = {
  data: PropTypes.oneOfType([PropTypes.object, PropTypes.arrayOf(PropTypes.object)]).isRequired,
};
