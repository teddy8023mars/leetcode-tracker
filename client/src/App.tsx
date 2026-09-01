import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/NotFound';
import { Route, Switch, Redirect } from 'wouter';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { LangProvider } from './contexts/LangContext';
import { AppShell } from './components/AppShell';
import { ProblemList } from './pages/ProblemList';
import { ProblemDetail } from './pages/ProblemDetail';
import { SyncStatus } from './pages/SyncStatus';
import { Settings } from './pages/Settings';
import { ReviewDashboard } from './pages/ReviewDashboard';
import { TodayPage } from './pages/TodayPage';
import { Roadmap } from './pages/Roadmap';

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/today" />
      </Route>
      <Route path="/today">
        <TodayPage />
      </Route>
      <Route path="/review">
        <ReviewDashboard />
      </Route>
      <Route path="/roadmap/:slug">{params => <Roadmap slug={params.slug} />}</Route>
      <Route path="/problems">
        <ProblemList />
      </Route>
      <Route path="/problems/:slug">{(p) => <ProblemDetail titleSlug={p.slug} />}</Route>
      <Route path="/sync">
        <SyncStatus />
      </Route>
      <Route path="/settings">
        <Settings />
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LangProvider>
          <TooltipProvider>
            <Toaster />
            <AppShell>
              <Router />
            </AppShell>
          </TooltipProvider>
        </LangProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
