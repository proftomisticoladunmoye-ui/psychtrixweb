import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, AlertCircle, ChevronRight, BarChart3, Clock } from 'lucide-react';

interface ScaleItem {
  id: string;
  content: string;
  reversed: boolean;
  subscale?: string;
}

interface ResponseScale {
  type: 'likert' | 'binary';
  min: number;
  max: number;
  labels: string[];
}

interface SurveyProject {
  id: string;
  name: string;
  description: string;
  items: ScaleItem[];
  response_scale: ResponseScale;
}

interface PublicSurveyProps {
  token: string;
}

type SurveyState = 'loading' | 'not_found' | 'intro' | 'responding' | 'submitting' | 'done' | 'error';

// On narrow screens (< ~480px) a 5-point scale needs a stacked layout.
// Threshold: if each option would be narrower than 56px, switch to vertical.
function useLikertLayout(numOptions: number): 'horizontal' | 'vertical' {
  const [layout, setLayout] = React.useState<'horizontal' | 'vertical'>('horizontal');
  React.useEffect(() => {
    const check = () => {
      // 16px padding on each side of the container (max-w-2xl minus p-4 = ~672px usable)
      const usable = Math.min(window.innerWidth - 32, 640);
      const perOption = usable / numOptions;
      setLayout(perOption < 58 ? 'vertical' : 'horizontal');
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [numOptions]);
  return layout;
}

export function PublicSurvey({ token }: PublicSurveyProps) {
  const [state, setState] = useState<SurveyState>('loading');
  const [project, setProject] = useState<SurveyProject | null>(null);
  const [answers, setAnswers] = useState<{ [itemId: string]: number }>({});
  const [currentItem, setCurrentItem] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const submittedRef = React.useRef(false);

  useEffect(() => {
    loadSurvey();
  }, [token]);

  const loadSurvey = async () => {
    try {
      const { data, error } = await supabase
        .from('sandbox_scale_projects')
        .select('id, name, description, items, response_scale')
        .eq('shareable_link', token)
        .maybeSingle();

      if (error) throw error;
      if (!data) { setState('not_found'); return; }

      setProject(data as SurveyProject);
      setState('intro');
    } catch (err: any) {
      setErrorMsg(err.message);
      setState('error');
    }
  };

  const handleAnswer = (itemId: string, value: number) => {
    const updated = { ...answers, [itemId]: value };
    setAnswers(updated);

    if (!project) return;
    if (currentItem < project.items.length - 1) {
      setTimeout(() => setCurrentItem(i => i + 1), 300);
    }
  };

  const submitSurvey = async () => {
    if (!project || submittedRef.current) return;
    const unanswered = project.items.filter(item => answers[item.id] === undefined);
    if (unanswered.length > 0) {
      setErrorMsg(`Please answer all items (${unanswered.length} remaining)`);
      return;
    }

    submittedRef.current = true;
    setState('submitting');
    try {
      const responseArray = project.items.map(item => answers[item.id]);
      const totalScore = responseArray.reduce((s, v) => s + v, 0);
      const respondentId = 'anon_' + Math.random().toString(36).substring(2, 12);

      const { error } = await supabase.from('scale_responses').insert({
        project_id: project.id,
        respondent_id: respondentId,
        responses: responseArray,
        total_score: totalScore,
        completed: true,
      });

      if (error) throw error;
      setState('done');
    } catch (err: any) {
      setErrorMsg(err.message);
      setState('error');
    }
  };

  const answeredCount = project ? project.items.filter(i => answers[i.id] !== undefined).length : 0;
  const progress = project ? (answeredCount / project.items.length) * 100 : 0;

  // ─── Loading ────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading survey...</p>
        </div>
      </div>
    );
  }

  // ─── Not Found ──────────────────────────────────────────────────────────
  if (state === 'not_found') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Survey Not Found</h2>
          <p className="text-gray-500">This survey link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Something Went Wrong</h2>
          <p className="text-gray-500 mb-6">{errorMsg}</p>
          <button onClick={loadSurvey} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">Try Again</button>
        </div>
      </div>
    );
  }

  // ─── Done ───────────────────────────────────────────────────────────────
  if (state === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Thank You!</h2>
          <p className="text-gray-600 mb-2">Your responses have been recorded successfully.</p>
          <p className="text-sm text-gray-400">You may close this page.</p>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const rs = project.response_scale;

  // ─── Intro ──────────────────────────────────────────────────────────────
  if (state === 'intro') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-10 text-white">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="w-8 h-8 opacity-80" />
              <span className="text-sm font-medium opacity-80 uppercase tracking-wide">Research Survey</span>
            </div>
            <h1 className="text-3xl font-bold mb-3">{project.name}</h1>
            {project.description && (
              <p className="text-blue-100 leading-relaxed">{project.description}</p>
            )}
          </div>
          <div className="px-8 py-6 space-y-4">
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500" />
                <span>{project.items.length} questions</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>~{Math.ceil(project.items.length * 0.3)} minutes</span>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-600 space-y-1">
              <p className="font-medium text-gray-700">Before you begin:</p>
              <p>Your responses are completely anonymous and will only be used for research purposes.</p>
              <p>Please answer honestly — there are no right or wrong answers.</p>
            </div>
            <button
              onClick={() => setState('responding')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition flex items-center justify-center gap-2 text-lg"
            >
              Start Survey <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Responding ─────────────────────────────────────────────────────────
  const item = project.items[currentItem];
  const isLastItem = currentItem === project.items.length - 1;
  const numOptions = rs.max - rs.min + 1;
  const likertLayout = useLikertLayout(numOptions);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700 truncate mr-3">{project.name}</span>
            <span className="text-sm text-gray-500 flex-shrink-0">{answeredCount} / {project.items.length}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center p-3 sm:p-4 pt-6">
        <div className="max-w-2xl w-full space-y-4">
          {/* Error message */}
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{errorMsg}</p>
            </div>
          )}

          {/* Item navigation tabs — min 44px touch targets */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {project.items.map((it, idx) => (
              <button
                key={it.id}
                onClick={() => setCurrentItem(idx)}
                style={{ minWidth: 44, minHeight: 44 }}
                className={`flex-shrink-0 w-11 h-11 rounded-lg text-sm font-medium transition flex items-center justify-center ${
                  idx === currentItem
                    ? 'bg-blue-600 text-white shadow-sm'
                    : answers[it.id] !== undefined
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-white text-gray-500 border border-gray-200'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          {/* Current Question Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-8">
            <div className="flex items-start gap-3 mb-6">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">
                {currentItem + 1}
              </span>
              <p className="text-base sm:text-lg text-gray-900 font-medium leading-relaxed">{item.content}</p>
            </div>

            {rs.type === 'likert' ? (
              likertLayout === 'horizontal' ? (
                /* Horizontal layout for wider screens */
                <div className="space-y-2">
                  {rs.labels && rs.labels.length > 0 && (
                    <div
                      className="grid gap-1.5 text-xs text-center text-gray-500"
                      style={{ gridTemplateColumns: `repeat(${numOptions}, 1fr)` }}
                    >
                      {Array.from({ length: numOptions }, (_, i) => (
                        <div key={i} className="leading-tight px-0.5">{rs.labels[i] || ''}</div>
                      ))}
                    </div>
                  )}
                  <div
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${numOptions}, 1fr)` }}
                  >
                    {Array.from({ length: numOptions }, (_, i) => {
                      const val = rs.min + i;
                      const selected = answers[item.id] === val;
                      return (
                        <button
                          key={val}
                          onClick={() => handleAnswer(item.id, val)}
                          style={{ minHeight: 52 }}
                          className={`rounded-xl border-2 text-sm font-semibold transition active:scale-95 ${
                            selected
                              ? 'border-blue-600 bg-blue-600 text-white shadow-md'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Vertical layout for narrow screens — each option is a full-width row */
                <div className="space-y-2">
                  {Array.from({ length: numOptions }, (_, i) => {
                    const val = rs.min + i;
                    const label = rs.labels[i] || String(val);
                    const selected = answers[item.id] === val;
                    return (
                      <button
                        key={val}
                        onClick={() => handleAnswer(item.id, val)}
                        style={{ minHeight: 52 }}
                        className={`w-full flex items-center gap-4 px-4 rounded-xl border-2 text-sm font-medium transition active:scale-95 ${
                          selected
                            ? 'border-blue-600 bg-blue-600 text-white shadow-md'
                            : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <span className={`w-8 h-8 flex-shrink-0 rounded-full border-2 flex items-center justify-center font-bold text-base ${selected ? 'border-white bg-white text-blue-600' : 'border-gray-300 bg-white text-gray-700'}`}>
                          {val}
                        </span>
                        <span className="text-left">{label}</span>
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {['Yes', 'No'].map((label, i) => {
                  const val = i === 0 ? 1 : 0;
                  const selected = answers[item.id] === val;
                  return (
                    <button
                      key={label}
                      onClick={() => handleAnswer(item.id, val)}
                      style={{ minHeight: 56 }}
                      className={`rounded-xl border-2 text-base font-semibold transition active:scale-95 ${
                        selected ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Navigation — min 48px touch targets */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setCurrentItem(i => Math.max(0, i - 1))}
              disabled={currentItem === 0}
              style={{ minHeight: 48 }}
              className="flex-1 sm:flex-none px-5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm font-medium"
            >
              Previous
            </button>

            {isLastItem ? (
              <button
                onClick={submitSurvey}
                disabled={state === 'submitting'}
                style={{ minHeight: 48 }}
                className="flex-1 sm:flex-none px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl transition font-semibold flex items-center justify-center gap-2"
              >
                {state === 'submitting' ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" />Submit</>
                )}
              </button>
            ) : (
              <button
                onClick={() => setCurrentItem(i => Math.min(project.items.length - 1, i + 1))}
                style={{ minHeight: 48 }}
                className="flex-1 sm:flex-none px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition text-sm font-medium flex items-center justify-center gap-1.5"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {answeredCount < project.items.length && (
            <p className="text-center text-xs text-gray-400">
              {project.items.length - answeredCount} question{project.items.length - answeredCount !== 1 ? 's' : ''} remaining
            </p>
          )}
        </div>
      </div>

      <div className="text-center py-4 text-xs text-gray-400 border-t border-gray-100 bg-white">
        Powered by Psychtrix · Responses are anonymous
      </div>
    </div>
  );
}
