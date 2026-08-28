import React from 'react';
import { generateSportsMatchSchema } from '../../utils/sportsSchemaJsonLd';

export default function MatchStructuredData({ match }) {
  if (!match) return null;
  const schema = generateSportsMatchSchema(match);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
