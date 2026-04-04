import React from "react";
import { useNavigate } from "@tanstack/react-router";

export const storageKey = "HQ_TOKEN";
const redirectTo = "/";

export function AuthPairing() {
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const hashParams = new URLSearchParams(hash);
    const token = hashParams.get("token");

    if (!token) {
      setError(`Missing "#token=" in URL.`);
      return;
    }

    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState({}, "", url.toString());

    document.cookie = `${storageKey}=${token}; path=/;`;
    navigate({ to: redirectTo, replace: true });
  }, [navigate]);

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Login failed</h2>
        <p>{error}</p>
        <p>
          Expected URL like <code>/login#token=...</code>
        </p>
      </div>
    );
  }

  return <div style={{ padding: 16 }}>Logging you in…</div>;
}
