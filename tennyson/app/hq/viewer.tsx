import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import {fetchFileSystem} from './ItemDisplay';
import { Ranger, RangerItem } from './Ranger';

export function RangerApp() {
  const [items, setItems] = useState<Array<RangerItem>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFileSystem()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div>Loading file system...</div>;
  }

  return <Ranger items={items} />;
}

const rootElement = document.getElementById('root');
if (rootElement) {
  // Create a React root and render the App component
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
    <RangerApp />
    </React.StrictMode>
  );
} else {
  console.error('Failed to find the root element');
}
