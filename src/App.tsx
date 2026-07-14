import React, { useState, useEffect } from 'react';
import { useAuth } from './components/AuthProvider';
import { LoginForm } from './components/LoginForm';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { PublicSurvey } from './components/PublicSurvey';
import { EnhancedDataImport } from './components/EnhancedDataImport';
import { EnhancedCTTAnalysis } from './components/EnhancedCTTAnalysis';
import ValidityAnalysisTabs from './components/ValidityAnalysisTabs';
import { EnhancedIRTAnalysis } from './components/EnhancedIRTAnalysis';
import { ReportGenerator } from './components/ReportGenerator';
import { Settings } from './components/Settings';
import { EnhancedAdaptiveTesting } from './components/EnhancedAdaptiveTesting';
import { EnhancedPsychometricsSandbox } from './components/PublicationGradeSandbox';
import { CulturalAdaptation } from './components/CulturalAdaptation';
import { Help } from './components/Help';
import { EnhancedPathAnalysis } from './components/EnhancedPathAnalysis';
import { CommunityForum } from './components/CommunityForum';
import { PLSSEM } from './components/PLSSEM';
import { NetworkAnalysis } from './components/NetworkAnalysis';
import { RAnalysisDashboard } from './components/RAnalysisDashboard';

export type ViewType = 'dashboard' | 'data-import' | 'ctt-analysis' | 'validity-analysis' | 'irt-analysis' | 'path-analysis' | 'pls-sem' | 'adaptive-testing' | 'network-analysis' | 'r-backend' | 'sandbox' | 'cultural-adaptation' | 'forum' | 'reports' | 'settings' | 'help';

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
    return <PublicSurvey token={surveyMatch[1]} />;
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
      case 'r-backend':
        return <RAnalysisDashboard />;
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
            {renderCurrentView()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;