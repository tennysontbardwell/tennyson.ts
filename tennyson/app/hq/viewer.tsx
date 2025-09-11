import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { fetchFileSystem } from "./ItemDisplay";
import type { RangerItem } from "./Ranger";
import { Ranger, RangerOfItems } from "./Ranger";

export function ViewerApp() {
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

  /* return <Ranger items={items} />; */
  return <RangerOfItems items={items} initPath={[]} />;
}
