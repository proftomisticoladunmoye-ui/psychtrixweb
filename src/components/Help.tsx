import React, { useState } from 'react';
import {
  HelpCircle, Book, Video, MessageCircle, Mail, ExternalLink, ChevronRight,
  BarChart3, TrendingUp, Target, Network, Users, GitBranch, FileText, CheckCircle,
  Upload, Zap, FlaskConical, Globe, Download, PlayCircle, AlertCircle, Lightbulb
} from 'lucide-react';

type Section = 'overview' | 'getting-started' | 'data-import' | 'ctt' | 'irt' | 'validity' |
  'path-analysis' | 'adaptive' | 'sandbox' | 'cultural' | 'cfa' | 'sem' | 'plssem' |
  'interpretation' | 'troubleshooting' | 'community-forum' | 'references';

export function Help() {
  const [activeSection, setActiveSection] = useState<Section>('overview');

  const sections = [
    { id: 'overview' as Section, label: 'Overview', icon: Book },
    { id: 'getting-started' as Section, label: 'Getting Started', icon: PlayCircle },
    { id: 'data-import' as Section, label: 'Data Import', icon: Upload },
    { id: 'ctt' as Section, label: 'CTT Analysis', icon: BarChart3 },
    { id: 'irt' as Section, label: 'IRT Analysis', icon: TrendingUp },
    { id: 'validity' as Section, label: 'Validity Testing', icon: Target },
    { id: 'path-analysis' as Section, label: 'Path Analysis', icon: GitBranch },
    { id: 'adaptive' as Section, label: 'Adaptive Testing', icon: Zap },
    { id: 'sandbox' as Section, label: 'Scale Sandbox', icon: FlaskConical },
    { id: 'cultural' as Section, label: 'Cultural Adaptation', icon: Globe },
    { id: 'cfa' as Section, label: 'CFA & Path Diagrams', icon: Network },
    { id: 'sem' as Section, label: 'Structural Equation Modeling', icon: GitBranch },
    { id: 'plssem' as Section, label: 'PLS-SEM & Diagrams', icon: TrendingUp },
    { id: 'interpretation' as Section, label: 'Interpretation Guidelines', icon: CheckCircle },
    { id: 'troubleshooting' as Section, label: 'Troubleshooting', icon: AlertCircle },
    { id: 'community-forum' as Section, label: 'Community Forum', icon: MessageCircle },
    { id: 'references' as Section, label: 'References & Resources', icon: FileText },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-64 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 p-4 lg:sticky lg:top-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Documentation</h3>
          <nav className="space-y-1">
            {sections.map(section => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                    activeSection === section.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-left">{section.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex-1 space-y-6">
        {activeSection === 'overview' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Psychtrix Web User Guide</h1>
              <p className="text-gray-600 mt-2">
                Comprehensive documentation for advanced psychometric analysis
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">What is Psychtrix Web?</h2>
              <div className="prose prose-sm text-gray-700 space-y-3">
                <p>
                  <strong>Psychtrix Web</strong> is a professional web-based platform for conducting advanced psychometric
                  analyses. It provides researchers, psychometricians, and educators with powerful tools for test development,
                  validation, and quality assessment.
                </p>
                <p>
                  The platform implements state-of-the-art statistical methods based on Classical Test Theory (CTT),
                  Item Response Theory (IRT), and Structural Equation Modeling (SEM) frameworks.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Features</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex gap-3">
                  <BarChart3 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Classical Test Theory</h3>
                    <p className="text-sm text-gray-600">Reliability analysis, item statistics, internal consistency</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Item Response Theory</h3>
                    <p className="text-sm text-gray-600">1PL/2PL/3PL models, ICCs, person abilities</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Target className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Validity Analysis</h3>
                    <p className="text-sm text-gray-600">Content, construct, criterion validity</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <GitBranch className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Path Analysis</h3>
                    <p className="text-sm text-gray-600">Mediation, moderation, structural models</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Zap className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Adaptive Testing</h3>
                    <p className="text-sm text-gray-600">CAT simulation and optimization</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <FlaskConical className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Scale Sandbox</h3>
                    <p className="text-sm text-gray-600">Design, test, and validate new scales</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Globe className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Cultural Adaptation</h3>
                    <p className="text-sm text-gray-600">Cross-cultural validation and DIF analysis</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Network className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">SEM & CFA</h3>
                    <p className="text-sm text-gray-600">Full structural equation modeling</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl border-l-4 border-blue-600 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">System Requirements</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Modern web browser (Chrome, Firefox, Safari, Edge)</li>
                <li>• Stable internet connection</li>
                <li>• CSV files with properly formatted data (rows = respondents, columns = items)</li>
                <li>• Numerical data for quantitative analyses</li>
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'getting-started' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Getting Started</h1>
              <p className="text-gray-600 mt-2">Step-by-step guide to using Psychtrix Web</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Start Guide</h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Create an Account</h3>
                    <p className="text-sm text-gray-600">Sign up with your email and create a secure password</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Import Your Data</h3>
                    <p className="text-sm text-gray-600">Upload CSV files with your test responses or create sample data</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Choose Your Analysis</h3>
                    <p className="text-sm text-gray-600">Select the appropriate analysis based on your research goals</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">4</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Review Results</h3>
                    <p className="text-sm text-gray-600">Examine visualizations, tables, and interpretation guides</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">5</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Export & Report</h3>
                    <p className="text-sm text-gray-600">Generate professional reports in PDF, CSV, or JSON formats</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl border-l-4 border-amber-500 p-6">
              <div className="flex gap-3">
                <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Pro Tips</h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Start with CTT analysis for initial quality checks</li>
                    <li>• Use at least 200 respondents for stable IRT estimates</li>
                    <li>• Always check data quality before running analyses</li>
                    <li>• Save your datasets with descriptive names</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'data-import' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Data Import</h1>
              <p className="text-gray-600 mt-2">How to prepare and upload your data</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Format Requirements</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">CSV File Structure</h3>
                  <ul className="text-sm text-gray-700 space-y-2">
                    <li><strong>First row:</strong> Column headers (variable names)</li>
                    <li><strong>Each row:</strong> One respondent/participant</li>
                    <li><strong>Each column:</strong> One item/variable</li>
                    <li><strong>Values:</strong> Numerical data (1-5, 0-100, etc.)</li>
                    <li><strong>Missing data:</strong> Leave blank or use consistent code (e.g., -99, NA)</li>
                  </ul>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-sm text-gray-900 mb-2">Example: 5-Point Likert Scale</h4>
                  <pre className="text-xs bg-white p-3 rounded border border-gray-200 overflow-x-auto">
{`item1,item2,item3,item4,item5
4,5,3,4,5
3,3,4,3,4
5,4,5,5,4
2,3,2,3,3
4,4,4,4,5`}
                  </pre>
                  <p className="text-xs text-gray-600 mt-2">
                    This shows 5 participants responding to 5 items on a 1-5 scale
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Best Practices</h2>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900">Use Clear Variable Names</h4>
                    <p className="text-sm text-gray-600">e.g., "anxiety1", "anxiety2" instead of "q1", "q2"</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900">Remove Non-Numeric Data</h4>
                    <p className="text-sm text-gray-600">Keep demographic columns separate or code them numerically</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900">Check for Duplicates</h4>
                    <p className="text-sm text-gray-600">Ensure each row represents a unique participant</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900">Reverse-Code Before Upload</h4>
                    <p className="text-sm text-gray-600">Pre-process reverse-scored items in your original file</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-red-50 rounded-xl border-l-4 border-red-500 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Common Errors to Avoid</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>❌ Including text values in item columns</li>
                <li>❌ Using different missing data codes (be consistent!)</li>
                <li>❌ Swapping rows and columns (items should be columns)</li>
                <li>❌ Including duplicate column headers</li>
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'ctt' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Classical Test Theory (CTT) Analysis</h1>
              <p className="text-gray-600 mt-2">Reliability and item analysis guide</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">When to Use CTT</h2>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-1">✓ Use CTT When:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• You need quick initial quality checks</li>
                    <li>• Your sample size is small (under 200)</li>
                    <li>• You're doing exploratory test development</li>
                    <li>• Items have similar difficulty levels</li>
                    <li>• You need easy-to-understand metrics</li>
                  </ul>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg">
                  <h4 className="font-semibold text-amber-900 mb-1">⚠ Consider Alternatives When:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Items vary widely in difficulty</li>
                    <li>• You need sample-independent estimates</li>
                    <li>• Planning computerized adaptive testing</li>
                    <li>• Large sample available (500+)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Metrics Explained</h2>

              <div className="space-y-4">
                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Cronbach's Alpha (α)</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Measures internal consistency - how well items measure the same construct.
                  </p>
                  <div className="text-sm space-y-1">
                    <p><strong>α ≥ 0.90:</strong> Excellent (high-stakes tests)</p>
                    <p><strong>α ≥ 0.80:</strong> Good (research purposes)</p>
                    <p><strong>α ≥ 0.70:</strong> Acceptable (exploratory research)</p>
                    <p><strong>α &lt; 0.70:</strong> Poor (needs revision)</p>
                  </div>
                </div>

                <div className="border-l-4 border-green-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Item-Total Correlation</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    How well each item correlates with the total score.
                  </p>
                  <div className="text-sm space-y-1">
                    <p><strong>≥ 0.30:</strong> Good item, keep it</p>
                    <p><strong>0.20-0.29:</strong> Marginal, consider revision</p>
                    <p><strong>&lt; 0.20:</strong> Poor item, likely remove</p>
                  </div>
                </div>

                <div className="border-l-4 border-purple-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Item Difficulty</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Mean score as proportion of maximum (e.g., mean of 3 on 1-5 scale = 0.60)
                  </p>
                  <div className="text-sm space-y-1">
                    <p><strong>&gt; 0.80:</strong> Very easy item</p>
                    <p><strong>0.50-0.80:</strong> Ideal difficulty range</p>
                    <p><strong>&lt; 0.50:</strong> Difficult item</p>
                  </div>
                </div>

                <div className="border-l-4 border-orange-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Alpha if Item Deleted</h3>
                  <p className="text-sm text-gray-700">
                    If removing an item <strong>increases</strong> alpha, that item may be:
                  </p>
                  <ul className="text-sm text-gray-700 mt-1 space-y-1">
                    <li>• Measuring a different construct</li>
                    <li>• Poorly worded or ambiguous</li>
                    <li>• A candidate for removal or revision</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">How to Run CTT Analysis</h2>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>Navigate to <strong>CTT Analysis</strong> from sidebar</li>
                <li>Select your uploaded dataset</li>
                <li>Choose items to include in the scale</li>
                <li>Click <strong>Run Analysis</strong></li>
                <li>Review reliability statistics and item metrics</li>
                <li>Export results using the download buttons</li>
              </ol>
            </div>
          </div>
        )}

        {activeSection === 'irt' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Item Response Theory (IRT)</h1>
              <p className="text-gray-600 mt-2">Advanced item analysis and ability estimation</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">When to Use IRT</h2>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-1">✓ Use IRT When:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• You have large sample size (300+ recommended)</li>
                    <li>• Need sample-independent item parameters</li>
                    <li>• Planning adaptive testing (CAT)</li>
                    <li>• Want to equate different test forms</li>
                    <li>• Items vary in difficulty and discrimination</li>
                    <li>• Measuring latent traits on a continuous scale</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Choosing an IRT Model</h2>

              <div className="space-y-4">
                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                  <h3 className="font-semibold text-blue-900 mb-2">1PL (Rasch) Model</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Parameters:</strong> Difficulty (b) only
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Use when:</strong>
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• All items should discriminate equally (theoretical requirement)</li>
                    <li>• Creating item banks for linking</li>
                    <li>• Strict measurement requirements (fundamental measurement)</li>
                    <li>• Educational assessments with curriculum standards</li>
                  </ul>
                </div>

                <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                  <h3 className="font-semibold text-green-900 mb-2">2PL Model (Recommended)</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Parameters:</strong> Difficulty (b) + Discrimination (a)
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Use when:</strong>
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Items naturally vary in quality (most real tests)</li>
                    <li>• You want realistic item parameters</li>
                    <li>• Psychological scales and attitude measures</li>
                    <li>• Most educational and certification tests</li>
                  </ul>
                  <p className="text-xs text-green-800 mt-2 italic">
                    ★ This is the most commonly used model in practice
                  </p>
                </div>

                <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                  <h3 className="font-semibold text-purple-900 mb-2">3PL Model</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Parameters:</strong> Difficulty (b) + Discrimination (a) + Guessing (c)
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Use when:</strong>
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Multiple-choice tests where guessing is possible</li>
                    <li>• High-stakes certification exams</li>
                    <li>• Aptitude and achievement tests</li>
                    <li>• Large sample sizes (500+) for stable estimates</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Parameter Interpretation</h2>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Difficulty (b) Parameter</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    The ability level (θ) where probability of correct response is 50%.
                  </p>
                  <div className="bg-gray-50 p-3 rounded text-sm">
                    <p><strong>b &gt; 2.0:</strong> Very difficult items (only high-ability examinees succeed)</p>
                    <p><strong>b = 0.0:</strong> Medium difficulty (50% at average ability)</p>
                    <p><strong>b &lt; -2.0:</strong> Very easy items (most examinees succeed)</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Discrimination (a) Parameter</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Steepness of the item characteristic curve - how well the item separates high from low ability.
                  </p>
                  <div className="bg-gray-50 p-3 rounded text-sm">
                    <p><strong>a &gt; 1.5:</strong> Excellent discrimination (keep)</p>
                    <p><strong>a = 1.0:</strong> Good discrimination (typical)</p>
                    <p><strong>a &lt; 0.5:</strong> Poor discrimination (revise or remove)</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Guessing (c) Parameter</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Lower asymptote - probability even very low-ability examinees answer correctly.
                  </p>
                  <div className="bg-gray-50 p-3 rounded text-sm">
                    <p><strong>4-option MC:</strong> c ≈ 0.25 expected (1/4 chance)</p>
                    <p><strong>5-option MC:</strong> c ≈ 0.20 expected (1/5 chance)</p>
                    <p><strong>c &gt; 0.35:</strong> Possible item flaw (eliminate distractors)</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Sample Size Requirements</h2>
              <div className="space-y-2 text-sm text-gray-700">
                <p><strong>1PL Model:</strong> Minimum 200, ideal 300+</p>
                <p><strong>2PL Model:</strong> Minimum 300, ideal 500+</p>
                <p><strong>3PL Model:</strong> Minimum 500, ideal 1000+</p>
                <p className="text-xs text-amber-700 mt-2">
                  ⚠ Smaller samples may produce unstable parameter estimates
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'validity' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Validity Analysis</h1>
              <p className="text-gray-600 mt-2">Testing different types of validity evidence</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Types of Validity</h2>

              <div className="space-y-4">
                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Content Validity</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Question:</strong> Do items represent the full domain of the construct?
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Methods:</strong>
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Content Validity Index (CVI) from expert ratings</li>
                    <li>• Content Validity Ratio (CVR)</li>
                    <li>• Specification table matching</li>
                  </ul>
                  <p className="text-sm text-gray-700 mt-2">
                    <strong>When to use:</strong> Initial test development, expert panel available
                  </p>
                </div>

                <div className="border-l-4 border-green-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Construct Validity</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Question:</strong> Does the test measure the theoretical construct?
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Methods:</strong>
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Factor analysis (EFA/CFA)</li>
                    <li>• Convergent validity (correlations with similar measures)</li>
                    <li>• Discriminant validity (low correlations with different constructs)</li>
                    <li>• Known-groups method</li>
                  </ul>
                  <p className="text-sm text-gray-700 mt-2">
                    <strong>When to use:</strong> Have related measures, need theoretical evidence
                  </p>
                </div>

                <div className="border-l-4 border-purple-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Criterion Validity</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Question:</strong> Do scores relate to external outcomes?
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Types:</strong>
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• <strong>Concurrent:</strong> Correlation with current criterion</li>
                    <li>• <strong>Predictive:</strong> Correlation with future outcome</li>
                  </ul>
                  <p className="text-sm text-gray-700 mt-2">
                    <strong>When to use:</strong> Have criterion data, need practical justification
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Convergent vs. Discriminant Validity</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-2">Convergent Validity</h4>
                  <p className="text-sm text-gray-700 mb-2">
                    Your test should correlate <strong>highly</strong> with other measures of the same construct.
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Expected:</strong> r &gt; 0.50
                  </p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <h4 className="font-semibold text-red-900 mb-2">Discriminant Validity</h4>
                  <p className="text-sm text-gray-700 mb-2">
                    Your test should correlate <strong>weakly</strong> with measures of different constructs.
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Expected:</strong> r &lt; 0.30
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'path-analysis' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Path Analysis</h1>
              <p className="text-gray-600 mt-2">Testing mediation, moderation, and structural relationships</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">When to Use Path Analysis</h2>
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-1">Use Path Analysis When:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Testing causal theories with observed variables</li>
                    <li>• Examining direct and indirect effects</li>
                    <li>• Testing mediation hypotheses</li>
                    <li>• Exploring moderation (interaction) effects</li>
                    <li>• All variables are measured (no latent factors)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Types of Path Models</h2>

              <div className="space-y-4">
                <div className="border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">Simple Mediation</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Model:</strong> X → M → Y
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Question:</strong> Does the effect of X on Y occur through M?
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Example:</strong> Stress (X) → Coping (M) → Well-being (Y)
                  </p>
                </div>

                <div className="border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-2">Parallel Mediation</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Model:</strong> X → M1 → Y, X → M2 → Y
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Question:</strong> Multiple mediators operating simultaneously
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Example:</strong> Training (X) → [Skills (M1), Confidence (M2)] → Performance (Y)
                  </p>
                </div>

                <div className="border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-900 mb-2">Serial Mediation</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Model:</strong> X → M1 → M2 → Y
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Question:</strong> Mediators in a causal chain
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Example:</strong> Mindfulness (X) → Awareness (M1) → Emotion Regulation (M2) → Anxiety (Y)
                  </p>
                </div>

                <div className="border border-orange-200 rounded-lg p-4">
                  <h3 className="font-semibold text-orange-900 mb-2">Moderation</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Model:</strong> X × W → Y
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Question:</strong> Does the effect of X on Y depend on W?
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Example:</strong> Study Time (X) × Motivation (W) → Exam Score (Y)
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Interpreting Results</h2>
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Direct Effects</h4>
                  <p className="text-sm text-gray-700">
                    The effect of X on Y controlling for mediators
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Indirect Effects</h4>
                  <p className="text-sm text-gray-700">
                    The effect of X on Y through mediators (product of path coefficients)
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Total Effects</h4>
                  <p className="text-sm text-gray-700">
                    Sum of direct and indirect effects
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'adaptive' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Adaptive Testing</h1>
              <p className="text-gray-600 mt-2">Computerized Adaptive Testing (CAT) simulation</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">What is CAT?</h2>
              <p className="text-sm text-gray-700 mb-4">
                Computerized Adaptive Testing adjusts item difficulty based on examinee responses,
                providing more precise ability estimates with fewer items.
              </p>

              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">How CAT Works:</h4>
                <ol className="text-sm text-gray-700 space-y-2">
                  <li>1. Start with medium difficulty item</li>
                  <li>2. If correct → present harder item</li>
                  <li>3. If incorrect → present easier item</li>
                  <li>4. Continue until stopping rule met</li>
                  <li>5. Final ability estimate based on all responses</li>
                </ol>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">When to Use CAT</h2>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-1">✓ Use CAT When:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• You have large item bank (100+ items)</li>
                    <li>• Need efficient testing (fewer items)</li>
                    <li>• Want tailored difficulty for each examinee</li>
                    <li>• Testing individually (computer-based)</li>
                    <li>• Have IRT parameters calibrated</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">CAT Stopping Rules</h2>
              <div className="space-y-2 text-sm text-gray-700">
                <p><strong>Fixed-length:</strong> Stop after N items (e.g., 20 items)</p>
                <p><strong>Precision-based:</strong> Stop when SE &lt; threshold (e.g., SE &lt; 0.30)</p>
                <p><strong>Hybrid:</strong> Minimum items + precision requirement</p>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'sandbox' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Scale Sandbox</h1>
              <p className="text-gray-600 mt-2">Design, test, and validate new measurement scales</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">What is Scale Sandbox?</h2>
              <p className="text-sm text-gray-700 mb-4">
                A comprehensive workspace for creating new psychological or educational scales from scratch.
                Design items, test psychometric properties, and iterate until you have a robust instrument.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Scale Development Workflow</h2>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Define Construct</h4>
                    <p className="text-sm text-gray-600">Clearly define what you're measuring</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Generate Items</h4>
                    <p className="text-sm text-gray-600">Create item pool (3-5x final scale length)</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Pilot Test</h4>
                    <p className="text-sm text-gray-600">Collect data from representative sample</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Analyze & Refine</h4>
                    <p className="text-sm text-gray-600">Use CTT/IRT to identify best items</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">5</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Validate</h4>
                    <p className="text-sm text-gray-600">Test validity with new sample</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">When to Use Sandbox</h2>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>• Creating a new measure for a specific construct</li>
                <li>• No existing scale meets your needs</li>
                <li>• Adapting existing scale for new context</li>
                <li>• Testing item variants before full study</li>
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'cultural' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Cultural Adaptation</h1>
              <p className="text-gray-600 mt-2">Cross-cultural validation and equivalence testing</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">What is Cultural Adaptation?</h2>
              <p className="text-sm text-gray-700 mb-4">
                The process of adapting and validating a psychological measure for use in a different
                cultural or linguistic context, ensuring measurement equivalence.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Types of Equivalence</h2>

              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Configural Invariance</h4>
                  <p className="text-sm text-gray-700">
                    Same factor structure across groups. Items load on same factors.
                  </p>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-2">Metric Invariance</h4>
                  <p className="text-sm text-gray-700">
                    Same factor loadings across groups. Scale intervals are equivalent.
                  </p>
                </div>

                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-semibold text-purple-900 mb-2">Scalar Invariance</h4>
                  <p className="text-sm text-gray-700">
                    Same intercepts across groups. Mean comparisons are valid.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">DIF Analysis</h2>
              <p className="text-sm text-gray-700 mb-3">
                <strong>Differential Item Functioning (DIF)</strong> occurs when people from different
                groups with the same ability level have different probabilities of answering an item correctly.
              </p>
              <div className="p-3 bg-amber-50 rounded-lg text-sm text-gray-700">
                <strong>When to test for DIF:</strong> Comparing groups by language, culture, gender,
                age, or any demographic variable where bias might exist.
              </div>
            </div>
          </div>
        )}

        {activeSection === 'cfa' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Confirmatory Factor Analysis (CFA)</h1>
              <p className="text-gray-600 mt-2">Testing measurement models with latent factors</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">When to Use CFA</h2>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-1">✓ Use CFA When:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• You have a theoretical model to test</li>
                    <li>• Confirming factor structure from EFA</li>
                    <li>• Testing competing models</li>
                    <li>• Validating translated scales</li>
                    <li>• Need evidence of construct validity</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Model Fit Indices</h2>
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold text-gray-900 mb-1">χ² (Chi-square)</h4>
                  <p className="text-sm text-gray-700">
                    Tests exact fit. Non-significant preferred (p &gt; .05), but sensitive to sample size.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold text-gray-900 mb-1">CFI (Comparative Fit Index)</h4>
                  <p className="text-sm text-gray-700">
                    <strong>Excellent:</strong> &gt; 0.95 | <strong>Acceptable:</strong> &gt; 0.90
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold text-gray-900 mb-1">TLI (Tucker-Lewis Index)</h4>
                  <p className="text-sm text-gray-700">
                    <strong>Excellent:</strong> &gt; 0.95 | <strong>Acceptable:</strong> &gt; 0.90
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold text-gray-900 mb-1">RMSEA (Root Mean Square Error)</h4>
                  <p className="text-sm text-gray-700">
                    <strong>Excellent:</strong> &lt; 0.05 | <strong>Good:</strong> &lt; 0.08 | <strong>Acceptable:</strong> &lt; 0.10
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold text-gray-900 mb-1">SRMR (Standardized RMR)</h4>
                  <p className="text-sm text-gray-700">
                    <strong>Good:</strong> &lt; 0.08 | <strong>Acceptable:</strong> &lt; 0.10
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl border-l-4 border-amber-500 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Reporting CFA Results</h3>
              <p className="text-sm text-gray-700 mb-2">Always report:</p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• All fit indices (not just the best ones)</li>
                <li>• Standardized factor loadings</li>
                <li>• Factor correlations</li>
                <li>• Modification indices if model revised</li>
                <li>• Sample size and missing data handling</li>
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'sem' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Structural Equation Modeling (SEM)</h1>
              <p className="text-gray-600 mt-2">Full models with measurement and structural components</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">SEM vs. Other Methods</h2>
              <div className="space-y-3 text-sm">
                <div className="p-3 bg-blue-50 rounded">
                  <strong className="text-blue-900">SEM =</strong> CFA (measurement model) + Path Analysis (structural model)
                </div>
                <p className="text-gray-700">
                  SEM allows you to test relationships between latent constructs while accounting
                  for measurement error, which traditional regression cannot do.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">When to Use SEM</h2>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-1">✓ Use SEM When:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Testing complex theoretical models</li>
                    <li>• Have latent variables (factors)</li>
                    <li>• Want to account for measurement error</li>
                    <li>• Testing mediation with latent variables</li>
                    <li>• Multiple dependent variables</li>
                    <li>• Large sample size (200+ minimum)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Sample Size Requirements</h2>
              <div className="space-y-2 text-sm text-gray-700">
                <p><strong>Minimum:</strong> 200 cases</p>
                <p><strong>Adequate:</strong> 10-20 cases per estimated parameter</p>
                <p><strong>Ideal:</strong> 500+ cases for complex models</p>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'plssem' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Partial Least Squares SEM (PLS-SEM)</h1>
              <p className="text-gray-600 mt-2">Variance-based SEM with publication-grade path diagrams</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">PLS-SEM vs. Covariance-Based SEM</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Use PLS-SEM When:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Exploratory research and theory building</li>
                    <li>• Small to moderate sample sizes (50+)</li>
                    <li>• Prediction-oriented research goals</li>
                    <li>• Complex models with many constructs</li>
                    <li>• Data is non-normal</li>
                    <li>• Formative measurement models</li>
                  </ul>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-2">Use CB-SEM When:</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Confirmatory research</li>
                    <li>• Large sample sizes (200+)</li>
                    <li>• Theory testing and validation</li>
                    <li>• Need overall model fit statistics</li>
                    <li>• Primarily reflective models</li>
                    <li>• Error theory is important</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Path Diagram Types</h2>
              <p className="text-sm text-gray-700 mb-4">
                Psychtrix Web generates three types of professional path diagrams following global academic standards:
              </p>

              <div className="space-y-4">
                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">1. Measurement Model Diagram</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Shows the relationships between constructs and their indicators.
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Displays outer loadings for reflective constructs</li>
                    <li>• Shows outer weights for formative constructs</li>
                    <li>• Visual distinction between reflective (blue) and formative (yellow) constructs</li>
                    <li>• Indicators shown as rectangles</li>
                  </ul>
                </div>

                <div className="border-l-4 border-green-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">2. Structural Model Diagram</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Shows relationships between constructs (latent variables).
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Displays path coefficients between constructs</li>
                    <li>• Shows R² values for endogenous constructs</li>
                    <li>• Significance levels indicated with asterisks</li>
                    <li>• Arrow thickness represents strength of relationships</li>
                  </ul>
                </div>

                <div className="border-l-4 border-purple-600 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">3. Full Model Diagram</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Complete PLS-SEM model with both measurement and structural components.
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Comprehensive view of entire model</li>
                    <li>• Shows all constructs, indicators, and paths</li>
                    <li>• Includes all loadings, weights, and path coefficients</li>
                    <li>• Publication-ready for academic papers</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Diagram Visual Standards</h2>
              <p className="text-sm text-gray-700 mb-4">
                All diagrams follow conventions from leading SEM software (SmartPLS, AMOS, Mplus):
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <h4 className="font-semibold text-sm text-gray-900 mb-1">Constructs (Latent Variables)</h4>
                    <ul className="text-xs text-gray-700 space-y-1">
                      <li>• Ovals with colored backgrounds</li>
                      <li>• Blue = Reflective constructs</li>
                      <li>• Yellow = Formative constructs</li>
                      <li>• R² displayed inside endogenous constructs</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <h4 className="font-semibold text-sm text-gray-900 mb-1">Indicators (Observed Variables)</h4>
                    <ul className="text-xs text-gray-700 space-y-1">
                      <li>• Rectangles with gray borders</li>
                      <li>• Variable names clearly labeled</li>
                      <li>• Positioned around constructs</li>
                    </ul>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <h4 className="font-semibold text-sm text-gray-900 mb-1">Paths and Arrows</h4>
                    <ul className="text-xs text-gray-700 space-y-1">
                      <li>• Arrows show direction of relationships</li>
                      <li>• Line thickness = relationship strength</li>
                      <li>• Coefficients displayed on paths</li>
                      <li>• Color indicates significance level</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <h4 className="font-semibold text-sm text-gray-900 mb-1">Significance Indicators</h4>
                    <ul className="text-xs text-gray-700 space-y-1">
                      <li>• * p &lt; 0.05</li>
                      <li>• ** p &lt; 0.01</li>
                      <li>• *** p &lt; 0.001</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">How to Generate Diagrams</h2>
              <ol className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">Build Your Model</h4>
                    <p className="text-sm text-gray-600">
                      In the PLS-SEM section, define your constructs (reflective or formative) and specify paths between them
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">Run Analysis</h4>
                    <p className="text-sm text-gray-600">
                      Execute the PLS algorithm with bootstrapping to get measurement and structural results
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">Navigate to Path Diagrams Tab</h4>
                    <p className="text-sm text-gray-600">
                      Click the "Path Diagrams" tab to view all three diagram types automatically generated
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">Customize View</h4>
                    <p className="text-sm text-gray-600">
                      Use zoom controls to adjust the view (50% to 200%)
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">5</div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">Export for Publication</h4>
                    <p className="text-sm text-gray-600">
                      Download as PNG (recommended) or JPEG for use in papers, presentations, or reports
                    </p>
                  </div>
                </div>
              </ol>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Export Options</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">PNG Format (Recommended)</h4>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Best for:</strong>
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Academic publications and journals</li>
                    <li>• Presentations and posters</li>
                    <li>• High-quality prints</li>
                    <li>• Web publishing</li>
                  </ul>
                  <p className="text-xs text-blue-800 mt-2">
                    ✓ Lossless compression, sharp edges, transparent backgrounds supported
                  </p>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">JPEG Format</h4>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Best for:</strong>
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Smaller file sizes</li>
                    <li>• Email attachments</li>
                    <li>• Quick sharing</li>
                    <li>• Space-constrained situations</li>
                  </ul>
                  <p className="text-xs text-gray-600 mt-2">
                    ⚠ Lossy compression may affect fine details
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Interpreting Diagrams</h2>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Measurement Model Interpretation</h4>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• <strong>Loadings ≥ 0.70:</strong> Indicator is strongly related to construct (acceptable)</li>
                    <li>• <strong>Loadings 0.60-0.69:</strong> Acceptable if other indicators are strong</li>
                    <li>• <strong>Loadings &lt; 0.60:</strong> Consider removing indicator</li>
                    <li>• <strong>Weights (formative):</strong> Interpret direction and significance, not magnitude</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Structural Model Interpretation</h4>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• <strong>Path coefficients:</strong> Standardized values between -1 and +1</li>
                    <li>• <strong>R² values:</strong> Variance explained in endogenous constructs</li>
                    <li>• <strong>R² ≥ 0.75:</strong> Substantial</li>
                    <li>• <strong>R² ≥ 0.50:</strong> Moderate</li>
                    <li>• <strong>R² ≥ 0.25:</strong> Weak</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Arrow Thickness Guide</h4>
                  <p className="text-sm text-gray-700 mb-1">Line thickness indicates relationship strength:</p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• <strong>Thick green lines:</strong> Strong effect (|β| ≥ 0.3)</li>
                    <li>• <strong>Medium blue lines:</strong> Moderate effect (|β| ≥ 0.1)</li>
                    <li>• <strong>Thin gray lines:</strong> Weak effect (|β| &lt; 0.1)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Publication Guidelines</h2>
              <div className="prose prose-sm text-gray-700">
                <p className="mb-3">When including PLS-SEM diagrams in publications:</p>
                <ul className="space-y-2">
                  <li>
                    <strong>Figure Caption:</strong> Clearly describe what the diagram shows
                    (e.g., "Structural model with path coefficients and R² values")
                  </li>
                  <li>
                    <strong>Legend:</strong> Include a legend explaining symbols (the system provides one automatically)
                  </li>
                  <li>
                    <strong>Significance:</strong> Note significance levels in caption or legend
                  </li>
                  <li>
                    <strong>Sample Size:</strong> Report sample size in figure caption
                  </li>
                  <li>
                    <strong>Resolution:</strong> Export at 300 DPI minimum for print publications
                  </li>
                  <li>
                    <strong>Color vs. B&W:</strong> Ensure diagrams are readable in grayscale if journal prints in B&W
                  </li>
                  <li>
                    <strong>Supplementary Tables:</strong> Provide detailed numerical results in tables alongside diagrams
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-2">Best Practices</h3>
                  <ul className="text-sm text-blue-900 space-y-1">
                    <li>• Always run bootstrapping (5000+ samples) before generating diagrams</li>
                    <li>• Check measurement model quality before interpreting structural paths</li>
                    <li>• Export all three diagram types for comprehensive documentation</li>
                    <li>• Use PNG format for publications, JPEG for quick sharing</li>
                    <li>• Verify all significance indicators match your statistical results</li>
                    <li>• Save high-resolution versions for future use</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-500 rounded-xl border-l-4 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Reporting PLS-SEM Results</h3>
              <p className="text-sm text-gray-700 mb-2">
                Following Hair et al. (2019) guidelines, always report:
              </p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Sample size and data collection method</li>
                <li>• Measurement model assessment (reliability, validity)</li>
                <li>• Structural model results (path coefficients, t-values, p-values)</li>
                <li>• R² and Q² values for endogenous constructs</li>
                <li>• Effect sizes (f²) for significant paths</li>
                <li>• Complete path diagram with all coefficients</li>
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'interpretation' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Interpretation Guidelines</h1>
              <p className="text-gray-600 mt-2">How to interpret and report your results</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Effect Sizes</h2>
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold text-gray-900 mb-1">Correlation (r)</h4>
                  <p className="text-sm text-gray-700">
                    <strong>Small:</strong> 0.10 | <strong>Medium:</strong> 0.30 | <strong>Large:</strong> 0.50
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold text-gray-900 mb-1">Cohen's d</h4>
                  <p className="text-sm text-gray-700">
                    <strong>Small:</strong> 0.20 | <strong>Medium:</strong> 0.50 | <strong>Large:</strong> 0.80
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold text-gray-900 mb-1">R² (Variance Explained)</h4>
                  <p className="text-sm text-gray-700">
                    <strong>Small:</strong> 0.02 | <strong>Medium:</strong> 0.13 | <strong>Large:</strong> 0.26
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Reporting Standards</h2>
              <div className="prose prose-sm text-gray-700">
                <p className="mb-3">Follow APA 7th edition and journal-specific requirements:</p>
                <ul className="space-y-1">
                  <li>• Always report sample size and response rate</li>
                  <li>• Include exact p-values (not just p &lt; .05)</li>
                  <li>• Report effect sizes for all tests</li>
                  <li>• Provide 95% confidence intervals</li>
                  <li>• Include descriptive statistics (M, SD)</li>
                  <li>• Report all fit indices for SEM/CFA</li>
                  <li>• State missing data handling method</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'troubleshooting' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Troubleshooting</h1>
              <p className="text-gray-600 mt-2">Common issues and solutions</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Import Issues</h2>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Problem: File won't upload</h4>
                  <p className="text-sm text-gray-700 mb-2">Solutions:</p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Ensure file is in CSV format (not Excel .xlsx)</li>
                    <li>• Check file size is under 10MB</li>
                    <li>• Remove special characters from filename</li>
                    <li>• Try exporting CSV with UTF-8 encoding</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Problem: Data preview looks wrong</h4>
                  <p className="text-sm text-gray-700 mb-2">Solutions:</p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Check that first row contains headers</li>
                    <li>• Ensure delimiter is comma (not semicolon or tab)</li>
                    <li>• Remove empty rows at bottom of file</li>
                    <li>• Check for merged cells (Excel)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Analysis Issues</h2>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Problem: Low reliability (α &lt; 0.70)</h4>
                  <p className="text-sm text-gray-700 mb-2">Possible causes:</p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Too few items (add more items)</li>
                    <li>• Items measure different constructs (check item-total correlations)</li>
                    <li>• Heterogeneous sample (check subgroup reliability)</li>
                    <li>• Poor item quality (revise low-performing items)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Problem: IRT model won't converge</h4>
                  <p className="text-sm text-gray-700 mb-2">Solutions:</p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Try simpler model (3PL → 2PL → 1PL)</li>
                    <li>• Check for items with no variance (all same response)</li>
                    <li>• Increase sample size (need 300+ for 2PL)</li>
                    <li>• Remove extreme difficulty items</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Problem: Poor CFA model fit</h4>
                  <p className="text-sm text-gray-700 mb-2">Solutions:</p>
                  <ul className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>• Check modification indices (but theory first!)</li>
                    <li>• Allow error correlations if theoretically justified</li>
                    <li>• Remove items with low loadings (&lt; 0.40)</li>
                    <li>• Consider that your theory might be wrong</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl border-l-4 border-blue-600 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Still Need Help?</h3>
              <p className="text-sm text-gray-700 mb-3">
                If you're still experiencing issues, check that:
              </p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• You're using a modern browser (Chrome, Firefox, Safari, Edge)</li>
                <li>• Your internet connection is stable</li>
                <li>• You've cleared your browser cache</li>
                <li>• You're logged in to your account</li>
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'community-forum' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Community Forum</h1>
              <p className="text-gray-600 mt-2">Connect with other researchers and get help from the community</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">About the Forum</h2>
              <p className="text-sm text-gray-700 mb-4">
                The Psychtrix Community Forum is a collaborative space where researchers, educators, and psychometricians
                can share knowledge, ask questions, and discuss best practices in psychometric analysis.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2">Ask Questions</h3>
                  <p className="text-sm text-gray-700">
                    Get help with analyses, interpretation, or technical issues from experienced community members and admins.
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-2">Share Knowledge</h3>
                  <p className="text-sm text-gray-700">
                    Share your expertise, best practices, and insights with fellow researchers.
                  </p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg">
                  <h3 className="font-semibold text-amber-900 mb-2">Collaborate</h3>
                  <p className="text-sm text-gray-700">
                    Connect with other researchers working on similar projects or methodologies.
                  </p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h3 className="font-semibold text-purple-900 mb-2">Stay Updated</h3>
                  <p className="text-sm text-gray-700">
                    Learn about new features, best practices, and updates to the platform.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating and Managing Posts</h2>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Creating a New Post</h4>
                  <ol className="text-sm text-gray-700 space-y-1 ml-4">
                    <li>1. Click the "New Post" button in the forum</li>
                    <li>2. Choose a clear, descriptive title</li>
                    <li>3. Select the appropriate category (General, Technical, Methodology, Analysis Help)</li>
                    <li>4. Write a detailed description of your question or topic</li>
                    <li>5. Click "Post" to publish</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Replying to Posts</h4>
                  <p className="text-sm text-gray-700 mb-2">
                    Click on any post to view its full content and replies. You can add your own reply at the bottom
                    of the discussion. Be respectful and constructive in your responses.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Marking Solutions</h4>
                  <p className="text-sm text-gray-700 mb-2">
                    If you're the original post author and someone provides a helpful answer, you can mark their reply
                    as the solution. This helps other users find answers quickly.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Forum Categories</h2>
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-1">General Discussion</h4>
                  <p className="text-sm text-gray-600">
                    Broad topics related to psychometrics, research design, and platform usage
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-1">Technical Support</h4>
                  <p className="text-sm text-gray-600">
                    Help with data import, analysis errors, or platform-specific issues
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-1">Methodology Questions</h4>
                  <p className="text-sm text-gray-600">
                    Questions about choosing the right analysis method or interpreting results
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-1">Analysis Help</h4>
                  <p className="text-sm text-gray-600">
                    Specific help with CTT, IRT, CFA, SEM, or other analyses
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Forum Features</h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-gray-900">Pinned Posts</h4>
                    <p className="text-sm text-gray-600">
                      Important announcements and frequently referenced posts are pinned to the top by admins
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-gray-900">View Tracking</h4>
                    <p className="text-sm text-gray-600">
                      See how many people have viewed each post to gauge community interest
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-gray-900">Solution Marking</h4>
                    <p className="text-sm text-gray-600">
                      Post authors can mark the most helpful reply as the solution for quick reference
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-gray-900">Real-time Updates</h4>
                    <p className="text-sm text-gray-600">
                      Reply counts and activity timestamps update automatically
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl border-l-4 border-amber-600 p-6">
              <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-600" />
                Best Practices for Posting
              </h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>• Search existing posts before creating a new one to avoid duplicates</li>
                <li>• Use clear, descriptive titles that summarize your question</li>
                <li>• Provide context: sample size, type of data, what you've already tried</li>
                <li>• Include relevant details about error messages or unexpected results</li>
                <li>• Be patient and respectful when waiting for responses</li>
                <li>• Mark helpful replies as solutions to help future users</li>
                <li>• Follow up if you solve the problem yourself to share your solution</li>
              </ul>
            </div>

            <div className="bg-blue-50 rounded-xl border-l-4 border-blue-600 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Community Guidelines</h3>
              <p className="text-sm text-gray-700 mb-3">
                To maintain a welcoming and productive environment:
              </p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Be respectful and professional in all interactions</li>
                <li>• Stay on topic and relevant to psychometric analysis</li>
                <li>• Don't share confidential or sensitive research data</li>
                <li>• Give credit when referencing others' work or ideas</li>
                <li>• Report inappropriate content to forum admins</li>
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'references' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">References & Resources</h1>
              <p className="text-gray-600 mt-2">Academic sources and recommended readings</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Essential Textbooks</h2>
              <div className="prose prose-sm text-gray-700 space-y-3">
                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-xs mb-1">
                    <strong>Kline, R. B. (2015).</strong> Principles and practice of structural equation modeling (4th ed.). New York: Guilford Press.
                  </p>
                  <p className="text-xs text-gray-600 italic">The definitive guide to SEM, accessible to beginners yet comprehensive</p>
                </div>

                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-xs mb-1">
                    <strong>Embretson, S. E., & Reise, S. P. (2000).</strong> Item response theory for psychologists. Mahwah, NJ: Erlbaum.
                  </p>
                  <p className="text-xs text-gray-600 italic">Practical introduction to IRT for applied researchers</p>
                </div>

                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-xs mb-1">
                    <strong>Nunnally, J. C., & Bernstein, I. H. (1994).</strong> Psychometric theory (3rd ed.). New York: McGraw-Hill.
                  </p>
                  <p className="text-xs text-gray-600 italic">Classic text on CTT and test theory fundamentals</p>
                </div>

                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-xs mb-1">
                    <strong>Byrne, B. M. (2016).</strong> Structural equation modeling with AMOS (3rd ed.). New York: Routledge.
                  </p>
                  <p className="text-xs text-gray-600 italic">Step-by-step guide with examples</p>
                </div>

                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-xs mb-1">
                    <strong>DeVellis, R. F. (2016).</strong> Scale development: Theory and applications (4th ed.). Thousand Oaks, CA: Sage.
                  </p>
                  <p className="text-xs text-gray-600 italic">Complete guide to creating psychological measures</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Journal Articles</h2>
              <div className="prose prose-sm text-gray-700 space-y-2">
                <p className="text-xs">
                  <strong>Hu, L., & Bentler, P. M. (1999).</strong> Cutoff criteria for fit indexes in covariance structure analysis:
                  Conventional criteria versus new alternatives. <em>Structural Equation Modeling, 6</em>(1), 1-55.
                </p>
                <p className="text-xs">
                  <strong>Cronbach, L. J. (1951).</strong> Coefficient alpha and the internal structure of tests.
                  <em>Psychometrika, 16</em>(3), 297-334.
                </p>
                <p className="text-xs">
                  <strong>Muthén, B., & Asparouhov, T. (2012).</strong> Bayesian structural equation modeling: A more flexible
                  representation of substantive theory. <em>Psychological Methods, 17</em>(3), 313-335.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Online Resources</h2>
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 rounded">
                  <h4 className="font-semibold text-sm text-blue-900 mb-1">Standards for Educational and Psychological Testing</h4>
                  <p className="text-xs text-gray-700">AERA, APA, & NCME (2014) - Essential professional standards</p>
                </div>
                <div className="p-3 bg-green-50 rounded">
                  <h4 className="font-semibold text-sm text-green-900 mb-1">APA Style Guide</h4>
                  <p className="text-xs text-gray-700">For reporting statistical results in publications</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-2">Need Additional Help?</h2>
          <p className="mb-6 opacity-90">
            Contact our support team for personalized assistance with your analyses
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="mailto:support@psychtrixinnovative.com"
              className="bg-white text-blue-600 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition flex items-center justify-center gap-2"
            >
              <Mail className="w-5 h-5" />
              Email Support
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('navigate', { detail: 'forum' }));
              }}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition border-2 border-blue-400 flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              Community Forum
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
