import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuth } from './components/AuthProvider';
import { LoginForm } from './components/LoginForm';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';

// Route-level code splitting: each module loads on first visit instead of
// shipping one 1.6 MB bundle before the login screen can even paint.
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const PublicSurvey = lazy(() => import('./components/PublicSurvey').then(m => ({ default: m.PublicSurvey })));
const EnhancedDataImport = lazy(() => import('./components/EnhancedDataImport').then(m => ({ default: m.EnhancedDataImport })));
const EnhancedCTTAnalysis = lazy(() => import('./components/EnhancedCTTAnalysis').then(m => ({ default: m.EnhancedCTTAnalysis })));
const ValidityAnalysisTabs = lazy(() => import('./components/ValidityAnalysisTabs'));
const EnhancedIRTAnalysis = lazy(() => import('./components/EnhancedIRTAnalysis').then(m => ({ default: m.EnhancedIRTAnalysis })));
const ReportGenerator = lazy(() => import('./components/ReportGenerator').then(m => ({ default: m.ReportGenerator })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const EnhancedAdaptiveTesting = lazy(() => import('./components/EnhancedAdaptiveTesting').then(m => ({ default: m.EnhancedAdaptiveTesting })));
const EnhancedPsychometricsSandbox = lazy(() => import('./components/PublicationGradeSandbox').then(m => ({ default: m.EnhancedPsychometricsSandbox })));
const CulturalAdaptation = lazy(() => import('./components/CulturalAdaptation').then(m => ({ default: m.CulturalAdaptation })));
const Help = lazy(() => import('./components/Help').then(m => ({ default: m.Help })));
const EnhancedPathAnalysis = lazy(() => import('./components/EnhancedPathAnalysis').then(m => ({ default: m.EnhancedPathAnalysis })));
const CommunityForum = lazy(() => import('./components/CommunityForum').then(m => ({ default: m.CommunityForum })));
const PLSSEM = lazy(() => import('./components/PLSSEM').then(m => ({ default: m.PLSSEM })));
const NetworkAnalysis = lazy(() => import('./components/NetworkAnalysis').then(m => ({ default: m.NetworkAnalysis })));

const ViewLoader = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

export type ViewType = 'dashboard' | 'data-import' | 'ctt-analysis' | 'validity-analysis' | 'irt-analysis' | 'path-analysis' | 'pls-sem' | 'adaptive-testing' | 'network-analysis' | 'sandbox' | 'cultural-adaptation' | 'forum' | 'reports' | 'settings' | 'help';

function App() {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    const handleNavigate = (event: any) => {
      setCurrentView(event.detail as ViewType);
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  // Public survey route: /survey/:token — no auth required
  const surveyMatch = window.location.pathname.match(/^\/survey\/([^/]+)$/);
  if (surveyMatch) {
    return (
      <Suspense fallback={<ViewLoader />}>
        <PublicSurvey token={surveyMatch[1]} />
      </Suspense>
    );
  }

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Psychtrix Web...</p>
        </div>
      </div>
    );
  }

  // Always require authentication to use Supabase database
  if (!user) {
    return <LoginForm onSuccess={() => setShowLogin(false)} />;
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentView} />;
      case 'data-import':
        return <EnhancedDataImport />;
      case 'ctt-analysis':
        return <EnhancedCTTAnalysis />;
      case 'validity-analysis':
        return <ValidityAnalysisTabs />;
      case 'irt-analysis':
        return <EnhancedIRTAnalysis />;
      case 'path-analysis':
        return <EnhancedPathAnalysis />;
      case 'pls-sem':
        return <PLSSEM />;
      case 'adaptive-testing':
        return <EnhancedAdaptiveTesting />;
      case 'network-analysis':
        return <NetworkAnalysis />;
      case 'sandbox':
        return <EnhancedPsychometricsSandbox />;
      case 'cultural-adaptation':
        return <CulturalAdaptation />;
      case 'forum':
        return <CommunityForum />;
      case 'reports':
        return <ReportGenerator />;
      case 'settings':
        return <Settings />;
      case 'help':
        return <Help />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className={`min-h-screen flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'ml-0 lg:ml-16' : 'ml-0 lg:ml-64'
      }`}>
        <Header
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          sidebarCollapsed={sidebarCollapsed}
          onNavigate={setCurrentView}
          user={user}
          onShowLogin={() => setShowLogin(true)}
          currentView={currentView}
        />

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 overflow-auto">
          <div className="max-w-screen-2xl mx-auto">
            <Suspense fallback={<ViewLoader />}>
              {renderCurrentView()}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;