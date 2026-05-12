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
import { Lists } from './pages/Lists';
import { ListDetail } from './pages/ListDetail';
import { Companies } from './pages/Companies';
import { CompanyDetail } from './pages/CompanyDetail';
import { SyncStatus } from './pages/SyncStatus';
import { Settings } from './pages/Settings';

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/problems" />
      </Route>
      <Route path="/problems">
        <ProblemList />
      </Route>
      <Route path="/problems/:slug">{(p) => <ProblemDetail titleSlug={p.slug} />}</Route>
      <Route path="/lists">
        <Lists />
      </Route>
      <Route path="/lists/:slug">{(p) => <ListDetail slug={p.slug} />}</Route>
      <Route path="/companies">
        <Companies />
      </Route>
      <Route path="/companies/:slug">{(p) => <CompanyDetail slug={p.slug} />}</Route>
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
      <ThemeProvider defaultTheme="light">
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
