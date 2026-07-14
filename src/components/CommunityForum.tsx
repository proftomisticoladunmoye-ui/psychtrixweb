import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  MessageCircle, Plus, Search, TrendingUp, CheckCircle, Clock, Eye,
  MessageSquare, Pin, Lock, Send, Award, AlertCircle, Filter, X, ThumbsUp
} from 'lucide-react';

interface ForumPost {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  reply_count: number;
  is_pinned?: boolean;
  views_count?: number;
  last_activity_at: string;
  created_at: string;
  user_email?: string;
}

interface ForumReply {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  is_admin_reply: boolean;
  is_solution?: boolean;
  created_at: string;
  user_email?: string;
}

const CATEGORIES = [
  { id: 'general', label: 'General Discussion', icon: MessageCircle },
  { id: 'help', label: 'Help & Support', icon: AlertCircle },
  { id: 'feature_request', label: 'Feature Requests', icon: TrendingUp },
  { id: 'bug_report', label: 'Bug Reports', icon: AlertCircle },
  { id: 'discussion', label: 'Discussions', icon: MessageSquare },
];

export function CommunityForum() {
  const [activeView, setActiveView] = useState<'list' | 'post' | 'create'>('list');
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [newPost, setNewPost] = useState({
    title: '',
    body: '',
    category: 'general'
  });

  const [newReply, setNewReply] = useState('');

  useEffect(() => {
    checkAuth();
    loadPosts();
  }, [filterCategory]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    if (user) {
      const { data } = await supabase
        .from('forum_admins')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      setIsAdmin(!!data);
    }
  };

  const loadPosts = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('forum_posts')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('last_activity_at', { ascending: false });

      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }

      const { data, error } = await query;

      if (error) throw error;

      setPosts(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPostDetails = async (post: ForumPost) => {
    try {
      setSelectedPost(post);
      setActiveView('post');

      const { error: viewsError } = await supabase.rpc('increment_forum_post_views', { post_uuid: post.id });
      if (viewsError) {
        console.error('Failed to increment views:', viewsError);
      }

      const { data, error } = await supabase
        .from('forum_replies')
        .select('*')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setReplies(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createPost = async () => {
    if (!currentUser) {
      setError('Please login to create a post');
      return;
    }

    if (!newPost.title.trim() || !newPost.body.trim()) {
      setError('Title and body are required');
      return;
    }

    try {
      const { error } = await supabase
        .from('forum_posts')
        .insert([{
          user_id: currentUser.id,
          title: newPost.title,
          body: newPost.body,
          category: newPost.category
        }]);

      if (error) throw error;

      setNewPost({ title: '', body: '', category: 'general' });
      setActiveView('list');
      loadPosts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createReply = async () => {
    if (!currentUser || !selectedPost) return;

    if (!newReply.trim()) {
      setError('Reply cannot be empty');
      return;
    }

    try {
      const { error } = await supabase
        .from('forum_replies')
        .insert([{
          post_id: selectedPost.id,
          user_id: currentUser.id,
          body: newReply,
          is_admin_reply: isAdmin
        }]);

      if (error) throw error;

      await supabase
        .from('forum_posts')
        .update({
          reply_count: selectedPost.reply_count + 1,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', selectedPost.id);

      setNewReply('');
      loadPostDetails(selectedPost);
      loadPosts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const togglePinPost = async (postId: string, currentPinned: boolean) => {
    if (!isAdmin) return;

    try {
      const { error } = await supabase
        .from('forum_posts')
        .update({ is_pinned: !currentPinned })
        .eq('id', postId);

      if (error) throw error;
      loadPosts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const markAsSolution = async (replyId: string) => {
    if (!selectedPost || selectedPost.user_id !== currentUser?.id) return;

    try {
      await supabase
        .from('forum_replies')
        .update({ is_solution: false })
        .eq('post_id', selectedPost.id);

      const { error } = await supabase
        .from('forum_replies')
        .update({ is_solution: true })
        .eq('id', replyId);

      if (error) throw error;

      await supabase
        .from('forum_posts')
        .update({ status: 'answered' })
        .eq('id', selectedPost.id);

      loadPostDetails(selectedPost);
      loadPosts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredPosts = posts.filter(post =>
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryColor = (category: string) => {
    const colors: any = {
      general: 'bg-gray-100 text-gray-700',
      help: 'bg-blue-100 text-blue-700',
      feature_request: 'bg-green-100 text-green-700',
      bug_report: 'bg-red-100 text-red-700',
      discussion: 'bg-purple-100 text-purple-700',
    };
    return colors[category] || colors.general;
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      open: 'bg-yellow-100 text-yellow-700',
      answered: 'bg-green-100 text-green-700',
      closed: 'bg-gray-100 text-gray-700',
    };
    return colors[status] || colors.open;
  };

  if (activeView === 'create') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Create New Post</h2>
          <button
            onClick={() => setActiveView('list')}
            className="text-gray-600 hover:text-gray-900"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              value={newPost.category}
              onChange={(e) => setNewPost({ ...newPost, category: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <input
              type="text"
              value={newPost.title}
              onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
              placeholder="What's your question or topic?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={newPost.body}
              onChange={(e) => setNewPost({ ...newPost, body: e.target.value })}
              placeholder="Provide details about your question or topic..."
              rows={8}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={createPost}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" />
              Post to Community
            </button>
            <button
              onClick={() => setActiveView('list')}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeView === 'post' && selectedPost) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <button
          onClick={() => setActiveView('list')}
          className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
        >
          ← Back to Forum
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                {selectedPost.is_pinned && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                    <Pin className="w-3 h-3" />
                    Pinned
                  </span>
                )}
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(selectedPost.category)}`}>
                  {CATEGORIES.find(c => c.id === selectedPost.category)?.label}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedPost.status)}`}>
                  {selectedPost.status}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{selectedPost.title}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>By {selectedPost.user_email || 'Unknown User'}</span>
                <span>•</span>
                <span>{new Date(selectedPost.created_at).toLocaleDateString()}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {selectedPost.views_count || 0} views
                </span>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => togglePinPost(selectedPost.id, selectedPost.is_pinned || false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
                title={selectedPost.is_pinned ? 'Unpin post' : 'Pin post'}
              >
                <Pin className={`w-5 h-5 ${selectedPost.is_pinned ? 'text-yellow-600' : 'text-gray-400'}`} />
              </button>
            )}
          </div>

          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
            {selectedPost.body}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900">
            {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
          </h3>

          {replies.map(reply => (
            <div
              key={reply.id}
              className={`bg-white rounded-xl border p-6 ${
                reply.is_solution ? 'border-green-500 border-2' : 'border-gray-200'
              } ${reply.is_admin_reply ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">{reply.user_email || 'Unknown User'}</span>
                  {reply.is_admin_reply && (
                    <span className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium">
                      Admin
                    </span>
                  )}
                  {reply.is_solution && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                      <CheckCircle className="w-3 h-3" />
                      Solution
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {new Date(reply.created_at).toLocaleDateString()}
                  </span>
                  {selectedPost.user_id === currentUser?.id && !reply.is_solution && (
                    <button
                      onClick={() => markAsSolution(reply.id)}
                      className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                    >
                      <Award className="w-4 h-4" />
                      Mark as Solution
                    </button>
                  )}
                </div>
              </div>
              <div className="text-gray-700 whitespace-pre-wrap">{reply.body}</div>
            </div>
          ))}
        </div>

        {currentUser && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-medium text-gray-900 mb-3">Add Your Reply</h4>
            <textarea
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              placeholder="Share your thoughts or answer..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
            />
            <button
              onClick={createReply}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Post Reply
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Community Forum</h1>
          <p className="text-gray-600 mt-1">
            Ask questions, share ideas, and get guidance from the community
          </p>
        </div>
        {currentUser && (
          <button
            onClick={() => setActiveView('create')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Post
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={() => setError('')}
              className="text-sm text-red-600 hover:text-red-700 font-medium mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading posts...</p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No posts found. Be the first to start a discussion!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map(post => (
            <div
              key={post.id}
              onClick={() => loadPostDetails(post)}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {post.is_pinned && (
                      <Pin className="w-4 h-4 text-yellow-600" />
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(post.category)}`}>
                      {CATEGORIES.find(c => c.id === post.category)?.label}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(post.status)}`}>
                      {post.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 hover:text-blue-600">
                    {post.title}
                  </h3>
                  <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                    {post.body}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>By {post.user_email || 'Unknown User'}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-4 h-4" />
                      {post.reply_count} replies
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      {post.views_count || 0} views
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(post.last_activity_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!currentUser && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <MessageCircle className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Join the Discussion</h3>
          <p className="text-gray-600 mb-4">
            Login to create posts, reply to discussions, and connect with the community
          </p>
        </div>
      )}
    </div>
  );
}
