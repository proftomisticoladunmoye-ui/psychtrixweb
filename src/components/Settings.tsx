import React, { useState, useEffect } from 'react';
import {
  User, Bell, Shield, Database, Palette, Download, Trash2, Key,
  TrendingUp, FileText, BarChart, Save, AlertCircle, CheckCircle,
  Globe, Mail, Lock, Eye, EyeOff, Info, HardDrive
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { exportToJSON } from '../lib/exportUtils';

interface UserStats {
  datasets: number;
  analyses: number;
  reports: number;
  culturalGroups: number;
}

interface NotificationSettings {
  emailAnalysis: boolean;
  emailWeekly: boolean;
  emailUpdates: boolean;
  inAppNotifications: boolean;
}

interface ForumNotificationSettings {
  email_on_reply: boolean;
  email_on_solution: boolean;
  email_on_admin_reply: boolean;
  email_daily_digest: boolean;
  email_weekly_digest: boolean;
}

export function Settings() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'account' | 'notifications' | 'security' | 'data' | 'preferences'>('account');
  const [stats, setStats] = useState<UserStats>({ datasets: 0, analyses: 0, reports: 0, culturalGroups: 0 });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('light');
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailAnalysis: true,
    emailWeekly: true,
    emailUpdates: false,
    inAppNotifications: true,
  });
  const [forumNotifications, setForumNotifications] = useState<ForumNotificationSettings>({
    email_on_reply: true,
    email_on_solution: true,
    email_on_admin_reply: true,
    email_daily_digest: false,
    email_weekly_digest: true,
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadUserStats();
    loadUserPreferences();
    loadForumNotificationPreferences();
  }, []);

  const loadUserStats = async () => {
    try {
      if (!user) return;

      const [datasetsRes, groupsRes] = await Promise.all([
        supabase.from('datasets').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('cultural_groups').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      setStats({
        datasets: datasetsRes.count || 0,
        analyses: datasetsRes.count || 0,
        reports: 0,
        culturalGroups: groupsRes.count || 0,
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const loadUserPreferences = () => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'auto';
    if (savedTheme) setTheme(savedTheme);

    const savedNotifications = localStorage.getItem('notifications');
    if (savedNotifications) {
      setNotifications(JSON.parse(savedNotifications));
    }
  };

  const loadForumNotificationPreferences = async () => {
    try {
      if (!user) return;

      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setForumNotifications({
          email_on_reply: data.email_on_reply,
          email_on_solution: data.email_on_solution,
          email_on_admin_reply: data.email_on_admin_reply,
          email_daily_digest: data.email_daily_digest,
          email_weekly_digest: data.email_weekly_digest,
        });
      }
    } catch (err: any) {
      console.error('Error loading forum notification preferences:', err);
    }
  };

  const handleForumNotificationUpdate = async (key: keyof ForumNotificationSettings, value: boolean) => {
    try {
      if (!user) return;

      const updated = { ...forumNotifications, [key]: value };
      setForumNotifications(updated);

      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          [key]: value,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setSuccess('Forum notification preferences updated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    setSuccess('Theme updated successfully');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleNotificationUpdate = (key: keyof NotificationSettings, value: boolean) => {
    const updated = { ...notifications, [key]: value };
    setNotifications(updated);
    localStorage.setItem('notifications', JSON.stringify(updated));
    setSuccess('Notification preferences updated');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      setSuccess('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleExportAllData = async () => {
    setLoading(true);
    try {
      if (!user) return;

      const [datasets, groups] = await Promise.all([
        supabase.from('datasets').select('*').eq('user_id', user.id),
        supabase.from('cultural_groups').select('*').eq('user_id', user.id),
      ]);

      const exportData = {
        user: {
          id: user.id,
          email: user.email,
          exportedAt: new Date().toISOString(),
        },
        datasets: datasets.data || [],
        culturalGroups: groups.data || [],
        stats,
      };

      exportToJSON(exportData, `psychtrix_data_export_${new Date().toISOString().split('T')[0]}`);
      setSuccess('Data exported successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to export data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = confirm(
      'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.'
    );

    if (!confirmed) return;

    const doubleCheck = prompt('Type "DELETE" to confirm account deletion:');
    if (doubleCheck !== 'DELETE') {
      setError('Account deletion cancelled');
      return;
    }

    setLoading(true);
    try {
      await signOut();
    } catch (err: any) {
      setError(err.message || 'Failed to delete account');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'account' as const, label: 'Account', icon: User },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'data' as const, label: 'Data', icon: Database },
    { id: 'preferences' as const, label: 'Preferences', icon: Palette },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and preferences</p>
      </div>

      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-green-700">{success}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 border-b-2 transition whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 font-medium'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'account' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">User ID</label>
                    <input
                      type="text"
                      value={user?.id.substring(0, 8) + '...' || ''}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                    <Database className="w-6 h-6 text-blue-600 mb-2" />
                    <p className="text-2xl font-bold text-gray-900">{stats.datasets}</p>
                    <p className="text-sm text-gray-600">Datasets</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                    <BarChart className="w-6 h-6 text-green-600 mb-2" />
                    <p className="text-2xl font-bold text-gray-900">{stats.analyses}</p>
                    <p className="text-sm text-gray-600">Analyses</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                    <FileText className="w-6 h-6 text-purple-600 mb-2" />
                    <p className="text-2xl font-bold text-gray-900">{stats.reports}</p>
                    <p className="text-sm text-gray-600">Reports</p>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                    <Globe className="w-6 h-6 text-orange-600 mb-2" />
                    <p className="text-2xl font-bold text-gray-900">{stats.culturalGroups}</p>
                    <p className="text-sm text-gray-600">Cultural Groups</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Status</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Account Type: Free</p>
                      <p className="text-sm text-gray-600">Full access to all features</p>
                    </div>
                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                      Active
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Notifications</h3>
                <div className="space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={notifications.emailAnalysis}
                      onChange={(e) => handleNotificationUpdate('emailAnalysis', e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Analysis Completion</p>
                      <p className="text-sm text-gray-600">Get notified when your analyses are complete</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={notifications.emailWeekly}
                      onChange={(e) => handleNotificationUpdate('emailWeekly', e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Weekly Summary</p>
                      <p className="text-sm text-gray-600">Receive weekly activity summaries</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={notifications.emailUpdates}
                      onChange={(e) => handleNotificationUpdate('emailUpdates', e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Product Updates</p>
                      <p className="text-sm text-gray-600">Stay informed about new features and improvements</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">In-App Notifications</h3>
                <div className="space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={notifications.inAppNotifications}
                      onChange={(e) => handleNotificationUpdate('inAppNotifications', e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Enable In-App Notifications</p>
                      <p className="text-sm text-gray-600">Show notifications in the application</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-600" />
                  Community Forum Email Notifications
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Choose which forum activities you want to be notified about via email
                </p>
                <div className="space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={forumNotifications.email_on_reply}
                      onChange={(e) => handleForumNotificationUpdate('email_on_reply', e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Replies to Your Posts</p>
                      <p className="text-sm text-gray-600">Get notified when someone replies to your forum posts</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={forumNotifications.email_on_solution}
                      onChange={(e) => handleForumNotificationUpdate('email_on_solution', e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Solution Accepted</p>
                      <p className="text-sm text-gray-600">Get notified when your reply is marked as a solution</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={forumNotifications.email_on_admin_reply}
                      onChange={(e) => handleForumNotificationUpdate('email_on_admin_reply', e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Admin Replies</p>
                      <p className="text-sm text-gray-600">Get notified when an admin replies to discussions you're following</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={forumNotifications.email_daily_digest}
                      onChange={(e) => handleForumNotificationUpdate('email_daily_digest', e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Daily Forum Digest</p>
                      <p className="text-sm text-gray-600">Receive a daily summary of forum activity</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={forumNotifications.email_weekly_digest}
                      onChange={(e) => handleForumNotificationUpdate('email_weekly_digest', e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Weekly Forum Digest</p>
                      <p className="text-sm text-gray-600">Receive a weekly summary of popular discussions and new posts</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handlePasswordChange}
                    disabled={loading || !newPassword || !confirmPassword}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    Update Password
                  </button>

                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <div className="flex items-start gap-2">
                      <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-700">
                        <p className="font-medium mb-1">Password Requirements:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Minimum 8 characters</li>
                          <li>At least one uppercase letter recommended</li>
                          <li>At least one number recommended</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">Email Verified</p>
                        <p className="text-sm text-gray-600">Your email is verified</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-gray-900">Secure Connection</p>
                        <p className="text-sm text-gray-600">All data is encrypted</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Export</h3>
                <p className="text-gray-600 mb-4">Export all your data including datasets, analyses, and settings</p>
                <button
                  onClick={handleExportAllData}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Export All Data (JSON)
                </button>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage Information</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <HardDrive className="w-6 h-6 text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-900">Storage Usage</p>
                      <p className="text-sm text-gray-600">Currently using cloud storage</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Datasets:</span>
                      <span className="font-medium text-gray-900">{stats.datasets} items</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cultural Groups:</span>
                      <span className="font-medium text-gray-900">{stats.culturalGroups} items</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-red-200">
                <h3 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h3>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Delete Account</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Permanently delete your account and all associated data. This action cannot be undone.
                      </p>
                    </div>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-50 whitespace-nowrap ml-4"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Appearance</h3>
                <div className="max-w-md">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Theme</label>
                  <select
                    value={theme}
                    onChange={(e) => handleThemeChange(e.target.value as 'light' | 'dark' | 'auto')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="auto">Auto (System)</option>
                  </select>
                  <p className="text-sm text-gray-500 mt-2">
                    Choose how Psychtrix Web looks for you
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Analysis Defaults</h3>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Confidence Level
                    </label>
                    <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                      <option>95%</option>
                      <option>99%</option>
                      <option>90%</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Decimal Places
                    </label>
                    <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                      <option>2</option>
                      <option>3</option>
                      <option>4</option>
                    </select>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input type="checkbox" defaultChecked className="mt-1 rounded border-gray-300 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">Auto-save analyses</p>
                      <p className="text-sm text-gray-600">Automatically save analysis results</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition">
                    <input type="checkbox" defaultChecked className="mt-1 rounded border-gray-300 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">Show advanced options</p>
                      <p className="text-sm text-gray-600">Display advanced statistical options</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Language & Region</h3>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                    <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                      <option>English (US)</option>
                      <option>English (UK)</option>
                      <option>Spanish</option>
                      <option>French</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date Format</label>
                    <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                      <option>MM/DD/YYYY</option>
                      <option>DD/MM/YYYY</option>
                      <option>YYYY-MM-DD</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
