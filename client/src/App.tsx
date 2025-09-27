import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/providers/ThemeProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Landing from "@/pages/Landing";
import Calendar from "@/pages/calendar";
import Calendars from "@/pages/calendars";
import { TimeImpactAnalysis } from "@/pages/time-impact-analysis";
import { useAuth } from "@/hooks/useAuth";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Projects} />
          <Route path="/projects" component={Projects} />
          <Route path="/project/:id" component={ProjectDetail} />
          <Route path="/project/:projectId/tia" component={TimeImpactAnalysis} />
          <Route path="/calendar" component={Calendar} />
          <Route path="/calendars" component={Calendars} />
          <Route path="/project/:projectId/calendars" component={Calendars} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
