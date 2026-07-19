import React from 'react';
import {
  LayoutDashboard,
  Upload,
  BarChart3,
  Target,
  LineChart,
  GitBranch,
  Network,
  Zap,
  FlaskConical,
  Globe,
  FileText,
  Settings,
  HelpCircle,
  ChevronLeft,
  MessageCircle,
  Share2
} from 'lucide-react';
import { ViewType } from '../App';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: ViewType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'data-import', icon: Upload, label: 'Data Import' },
  { id: 'ctt-analysis', icon: BarChart3, label: 'CTT Analysis' },
  { id: 'validity-analysis', icon: Target, label: 'Validity Analysis' },
  { id: 'irt-analysis', icon: LineChart, label: 'IRT Analysis' },
  { id: 'path-analysis', icon: GitBranch, label: 'Path Analysis' },
  { id: 'pls-sem', icon: Network, label: 'PLS-SEM' },
  { id: 'adaptive-testing', icon: Zap, label: 'Adaptive Testing' },
  { id: 'network-analysis', icon: Share2, label: 'Network Analysis' },
  { id: 'sandbox', icon: FlaskConical, label: 'Scale Sandbox' },
  { id: 'cultural-adaptation', icon: Globe, label: 'Cultural Adaptation' },
  { id: 'forum', icon: MessageCircle, label: 'Community Forum' },
  { id: 'reports', icon: FileText, label: 'Reports' },
];

export function Sidebar({ currentView, onViewChange, collapsed, onToggleCollapse }: SidebarProps) {
  const handleNavClick = (view: ViewType) => {
    onViewChange(view);
    // Auto-close sidebar on mobile after navigation
    if (window.innerWidth < 1024 && !collapsed) {
      onToggleCollapse();
    }
  };

  return (
    <>
      {/* Backdrop overlay for mobile/tablet */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggleCollapse}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full bg-gray-900 border-r border-gray-800 transition-all duration-300 z-50 flex flex-col ${
          collapsed ? 'w-16 -translate-x-full lg:translate-x-0' : 'w-64 translate-x-0'
        } lg:w-${collapsed ? '16' : '64'}`}
      >
        <div className="h-16 flex-shrink-0 flex items-center justify-between px-4 border-b border-gray-800">
          {!collapsed && (
            <span className="text-lg font-semibold text-white">Navigation</span>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-2 hover:bg-gray-800 rounded-lg transition"
          >
            <ChevronLeft className={`w-5 h-5 text-gray-400 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Scrollable nav — flex-1 so it never runs underneath the pinned footer */}
        <nav className="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                  isActive
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom section with Settings and Help — in normal flow, no overlap */}
        <div className="flex-shrink-0 p-3 space-y-1 border-t border-gray-800 bg-gray-900">
          <button
            onClick={() => handleNavClick('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
              currentView === 'settings'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            } ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Settings' : undefined}
          >
            <Settings className={`w-5 h-5 flex-shrink-0 ${currentView === 'settings' ? 'text-white' : 'text-gray-400'}`} />
            {!collapsed && <span>Settings</span>}
          </button>
          <button
            onClick={() => handleNavClick('help')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
              currentView === 'help'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            } ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Help' : undefined}
          >
            <HelpCircle className={`w-5 h-5 flex-shrink-0 ${currentView === 'help' ? 'text-white' : 'text-gray-400'}`} />
            {!collapsed && <span>Help</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
