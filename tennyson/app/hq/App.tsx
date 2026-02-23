import { ViewerApp } from "tennyson/app/hq/viewer";
import { HQQuickDev } from "tennyson/app/hq/hq-quickdev";
import {
  Outlet,
  createRoute,
  createRootRoute,
  Link,
} from "@tanstack/react-router";

export const tabs = [
  {
    name: "Home",
    path: "/",
    component: () => <h3>Welcome Home!</h3>,
  },
  {
    name: "About",
    path: "/about",
    component: () => <h3>This is the About page.</h3>,
  },
  {
    name: "ImageViewer",
    path: "/imgviewer",
    component: ViewerApp,
  },
  {
    name: "HQ QuickDev",
    path: "/hq-quickdev",
    component: HQQuickDev,
  },
];

export const routeTreeOfTabs = (ts: typeof tabs) => {
  const rootRoute = createRootRoute({
    component: () => (
      <div
        style={{ display: "flex", flexDirection: "column", height: "100vh" }}
      >
        <div
          style={{ flex: 0, display: "flex", gap: "0.5rem", padding: "0.5rem" }}
        >
          {ts.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              activeProps={{ style: { fontWeight: "bold" } }}
            >
              {tab.name}
            </Link>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: "0.5rem" }}>
          <Outlet />
        </div>
      </div>
    ),
  });

  const routeTree = rootRoute.addChildren([
    ...ts.map((tab) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path: tab.path,
        component: tab.component,
      }),
    ),
  ]);

  return routeTree;
};
