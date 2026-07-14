import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FlaskConical, Plus, Edit, Trash2, AlertCircle } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  items: any[];
  reliability: number | null;
  last_modified: string;
}

export function PsychometricsSandbox() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('sandbox_scale_projects')
        .select('*')
        .eq('user_id', user.id)
        .order('last_modified', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (name: string, description: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('sandbox_scale_projects').insert({
        user_id: user.id,
        name,
        description,
        items: [],
        status: 'draft',
      });

      if (error) throw error;
      loadProjects();
      setShowCreateModal(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      const { error } = await supabase.from('sandbox_scale_projects').delete().eq('id', id);
      if (error) throw error;
      loadProjects();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Psychometrics Sandbox</h1>
        <p className="text-gray-600 mt-1">Design, test, and validate new measurement scales</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        onClick={() => setShowCreateModal(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center gap-2"
      >
        <Plus className="w-5 h-5" />
        New Scale Project
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FlaskConical className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Projects Yet</h3>
          <p className="text-gray-600 mb-6">Create your first scale development project</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h3>
                  <p className="text-sm text-gray-600 line-clamp-2">{project.description}</p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                    <Edit className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Items:</span>
                  <span className="font-medium text-gray-900">{project.items.length}</span>
                </div>
                {project.reliability && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Reliability:</span>
                    <span className="font-medium text-gray-900">{project.reliability.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Status:</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      project.status === 'validated'
                        ? 'bg-green-100 text-green-700'
                        : project.status === 'testing'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {project.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Create New Project</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                createProject(
                  formData.get('name') as string,
                  formData.get('description') as string
                );
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
