import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.js';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4 text-fg">
      <h1 className="text-4xl font-black text-info">404</h1>
      <p className="text-sm text-fg-muted">Page not found in Qwesie TV.</p>
      <Link to="/">
        <Button variant="primary" size="sm">
          Return to Control Centre
        </Button>
      </Link>
    </div>
  );
};
