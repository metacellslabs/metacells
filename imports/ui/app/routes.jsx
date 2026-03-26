import { lazy } from 'react';
import { Navigate, Route } from './router.jsx';

const HomePage = lazy(() =>
  import('./pages/HomePage.jsx').then((module) => ({
    default: module.HomePage,
  })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage.jsx').then((module) => ({
    default: module.SettingsPage,
  })),
);
const SheetPage = lazy(() =>
  import('./pages/SheetPage.jsx').then((module) => ({
    default: module.SheetPage,
  })),
);
const TestPage = lazy(() =>
  import('./pages/TestPage.jsx').then((module) => ({
    default: module.TestPage,
  })),
);
const StatsPage = lazy(() =>
  import('./pages/StatsPage.jsx').then((module) => ({
    default: module.StatsPage,
  })),
);
const StatesPage = lazy(() =>
  import('./pages/StatesPage.jsx').then((module) => ({
    default: module.StatesPage,
  })),
);

function NotFoundPage() {
  return (
    <main className="home-page">
      <section className="home-card">
        <div className="home-section-head">
          <h2>Page not found</h2>
        </div>
        <p className="home-empty-note">
          The requested route does not exist in this app.
        </p>
      </section>
    </main>
  );
}

export function AppRoutes({ onOpenHelp }) {
  return buildAppRoutes(onOpenHelp);
}

export function buildAppRoutes(onOpenHelp) {
  return (
    <>
      <Route
        path="/report/:sheetId/:tabId"
        element={<SheetPage onOpenHelp={onOpenHelp} publishedMode={true} />}
      />
      <Route
        path="/metacell/:sheetId/:tabId"
        element={<SheetPage onOpenHelp={onOpenHelp} />}
      />
      <Route
        path="/metacell/:sheetId"
        element={<SheetPage onOpenHelp={onOpenHelp} />}
      />
      <Route
        path="/sheet/:sheetId/:tabId"
        element={<SheetPage onOpenHelp={onOpenHelp} />}
      />
      <Route path="/sheet/:sheetId" element={<SheetPage onOpenHelp={onOpenHelp} />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/stats" element={<StatsPage />} />
      <Route path="/states" element={<StatesPage />} />
      <Route path="/test" element={<TestPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/home" element={<Navigate to="/" replace={true} />} />
      <Route path="*" element={<NotFoundPage />} />
    </>
  );
}
