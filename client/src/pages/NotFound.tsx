import React from 'react';
import { Link } from 'react-router-dom';

const NotFound: React.FC = () => (
  <section className="not-found" aria-labelledby="not-found-title">
    <div className="not-found__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9.5 13.5l5-5M9.5 8.5l5 5" />
      </svg>
    </div>
    <span className="eyebrow">404 · Page not found</span>
    <h1 id="not-found-title">This paste went missing.</h1>
    <p>The address may be incomplete, or the page may no longer exist.</p>
    <Link to="/" className="btn btn-primary">Back to Instant Paste</Link>
  </section>
);

export default NotFound;
