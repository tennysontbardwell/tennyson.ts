import React from "react";
import ReactDOM from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRouter,
  createRoute,
  createRootRoute,
  Link,
} from "@tanstack/react-router";

import { ViewerApp } from "tennyson/app/hq/viewer";

const rootRoute = createRootRoute({
  component: () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{ flex: 0, display: "flex", gap: "0.5rem", padding: "0.5rem" }}
      >
        <Link to="/" activeProps={{ style: { fontWeight: "bold" } }}>
          Home
        </Link>
        <Link to="/about" activeProps={{ style: { fontWeight: "bold" } }}>
          About
        </Link>
        <Link to="/imgviewer" activeProps={{ style: { fontWeight: "bold" } }}>
          ImageViewer
        </Link>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "0.5rem" }}>
        <Outlet />
      </div>
    </div>
  ),
});

const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: function Index() {
      return <h3>Welcome Home!</h3>;
    },
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/about",
    component: function About() {
      return <h3>This is the About page.</h3>;
    },
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/imgviewer",
    component: ViewerApp,
  }),
]);

// 4. Create the Router
// This router instance will manage your application's state.
const router = createRouter({ routeTree });

// Register the router for maximum type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// 5. Render the App
// Use the `<RouterProvider>` component to provide the router to your app.
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
}
