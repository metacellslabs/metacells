import { Suspense, useState } from 'react';
import { HelpOverlay } from '../help/HelpOverlay.jsx';
import { buildAppRoutes } from './routes.jsx';
import { Routes } from './router.jsx';

export const App = () => {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <>
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <Suspense
        fallback={
          <main className="home-page">
            <section className="home-card">
              <p className="home-empty-note">Loading page...</p>
            </section>
          </main>
        }
      >
        <Routes>{buildAppRoutes(() => setIsHelpOpen(true))}</Routes>
      </Suspense>
    </>
  );
};
