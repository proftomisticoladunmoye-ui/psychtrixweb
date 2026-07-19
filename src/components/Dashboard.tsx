import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Upload,
  BarChart3,
  FileText,
  Database,
  TrendingUp,
  Activity,
  Users,
  Globe,
  Network
} from 'lucide-react';
import { ViewType } from '../App';

interface DashboardProps {
  onNavigate: (view: ViewType) => void;
}

interface Stats {
  datasets: number;
  datasetsThisWeek: number;
  analyses: number;
  analysesThisMonth: number;
  reports: number;
  reportsThisMonth: number;
  sandboxProjects: number;
  storageUsed: string;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<Stats>({
    datasets: 0,
    datasetsThisWeek: 0,
    analyses: 0,
    analysesThisMonth: 0,
    reports: 0,
    reportsThisMonth: 0,
    sandboxProjects: 0,
    storageUsed: '0KB',
  });
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserName(user.email?.split('@')[0] || 'User');

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [datasetsResult, datasetsWeekResult, analysesResult, analysesMonthResult, reportsResult, reportsMonthResult, sandboxResult, datasetsData] = await Promise.all([
        supabase.from('datasets').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('datasets').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', weekAgo),
        supabase.from('analyses').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('analyses').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', monthAgo),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', monthAgo),
        supabase.from('sandbox_scale_projects').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        // file_size only — downloading every dataset's full data blob just to
        // sum sizes made the dashboard load scale with total stored data.
        supabase.from('datasets').select('file_size').eq('user_id', user.id),
      ]);

      let totalSize = 0;
      if (datasetsData.data) {
        totalSize = datasetsData.data.reduce((acc, ds) => acc + (Number(ds.file_size) || 0), 0);
      }

      const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(2) + 'MB';
      };

      setStats({
        datasets: datasetsResult.count || 0,
        datasetsThisWeek: datasetsWeekResult.count || 0,
        analyses: analysesResult.count || 0,
        analysesThisMonth: analysesMonthResult.count || 0,
        reports: reportsResult.count || 0,
        reportsThisMonth: reportsMonthResult.count || 0,
        sandboxProjects: sandboxResult.count || 0,
        storageUsed: formatSize(totalSize),
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    {
      icon: Upload,
      title: 'Import Data',
      description: 'Upload and manage your datasets',
      color: 'bg-blue-500',
      view: 'data-import' as ViewType,
    },
    {
      icon: BarChart3,
      title: 'CTT Analysis',
      description: 'Classical test theory analysis',
      color: 'bg-green-500',
      view: 'ctt-analysis' as ViewType,
    },
    {
      icon: TrendingUp,
      title: 'IRT Analysis',
      description: 'Item response theory modeling',
      color: 'bg-purple-500',
      view: 'irt-analysis' as ViewType,
    },
    {
      icon: Activity,
      title: 'Scale Sandbox',
      description: 'Design and test new scales',
      color: 'bg-orange-500',
      view: 'sandbox' as ViewType,
    },
    {
      icon: Globe,
      title: 'Cultural Adaptation',
      description: 'Cross-cultural validation',
      color: 'bg-teal-500',
      view: 'cultural-adaptation' as ViewType,
    },
    {
      icon: Network,
      title: 'Network Analysis',
      description: 'Regularized network psychometrics',
      color: 'bg-cyan-500',
      view: 'network-analysis' as ViewType,
    },
    {
      icon: FileText,
      title: 'Generate Reports',
      description: 'Create professional reports',
      color: 'bg-red-500',
      view: 'reports' as ViewType,
    },
  ];

  const statCards = [
    {
      icon: Database,
      label: 'Active Datasets',
      value: stats.datasets,
      subtext: `${stats.datasetsThisWeek} this week`,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      icon: BarChart3,
      label: 'Completed Analyses',
      value: stats.analyses,
      subtext: `${stats.analysesThisMonth} this month`,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
    },
    {
      icon: FileText,
      label: 'Generated Reports',
      value: stats.reports,
      subtext: `${stats.reportsThisMonth} this month`,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      icon: TrendingUp,
      label: 'Storage Used',
      value: stats.storageUsed,
      subtext: '0.0% of limit',
      color: 'bg-blue-600',
      bgColor: 'bg-blue-50',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 text-white shadow-lg">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {userName}</h1>
        <p className="text-blue-100 mb-6">Your psychometric intelligence platform is ready. Continue your analysis or start a new project.</p>
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate('data-import')}
            className="bg-white text-blue-600 px-6 py-3 rounded-lg font-medium hover:bg-blue-50 transition flex items-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Import New Data
          </button>
          <button
            onClick={() => onNavigate('help')}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition border-2 border-blue-400"
          >
            View Tutorial
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <div
            key={index}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all hover:-translate-y-1"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`${stat.bgColor} p-3 rounded-xl`}>
                <stat.icon className={`w-6 h-6 text-white ${stat.color.replace('bg-', 'text-')}`} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</p>
              <p className="text-xs text-green-600 font-medium">{stat.subtext}</p>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickActions.map((action, index) => (
            <button
              key={index}
              onClick={() => onNavigate(action.view)}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition text-left group"
            >
              <div
                className={`w-12 h-12 ${action.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition`}
              >
                <action.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{action.title}</h3>
              <p className="text-sm text-gray-600">{action.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Getting Started</h2>
        <p className="mb-4 opacity-90">
          Upload your first dataset to begin conducting psychometric analyses with cutting-edge
          statistical methods.
        </p>
        <button
          onClick={() => onNavigate('data-import')}
          className="bg-white text-blue-600 px-6 py-2 rounded-lg font-medium hover:bg-gray-100 transition"
        >
          Upload Dataset
        </button>
      </div>
    </div>
  );
}
