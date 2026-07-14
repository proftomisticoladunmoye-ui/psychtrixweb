import React from 'react';
import { Globe, Languages, Users, BarChart } from 'lucide-react';

export function CulturalAdaptation() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Cultural Adaptation</h1>
        <p className="text-gray-600 mt-1">Cross-cultural validation and adaptation tools</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-teal-100 rounded-full mb-4">
              <Globe className="w-10 h-10 text-teal-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Cultural Adaptation Tools</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Validate and adapt psychometric instruments across cultural contexts with advanced
              differential item functioning (DIF) analysis and measurement invariance testing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 border border-gray-200 rounded-lg">
              <Languages className="w-10 h-10 text-blue-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Translation Management</h3>
              <p className="text-sm text-gray-600 mb-4">
                Track and manage translations across multiple languages with back-translation
                verification.
              </p>
              <button className="text-sm font-medium text-blue-600 hover:text-blue-700">
                Start Translation →
              </button>
            </div>

            <div className="p-6 border border-gray-200 rounded-lg">
              <BarChart className="w-10 h-10 text-green-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">DIF Analysis</h3>
              <p className="text-sm text-gray-600 mb-4">
                Detect items that function differently across cultural groups using multiple DIF
                detection methods.
              </p>
              <button className="text-sm font-medium text-green-600 hover:text-green-700">
                Run DIF Analysis →
              </button>
            </div>

            <div className="p-6 border border-gray-200 rounded-lg">
              <Users className="w-10 h-10 text-purple-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Cultural Groups</h3>
              <p className="text-sm text-gray-600 mb-4">
                Define and manage cultural groups for comparative analyses and norm development.
              </p>
              <button className="text-sm font-medium text-purple-600 hover:text-purple-700">
                Manage Groups →
              </button>
            </div>

            <div className="p-6 border border-gray-200 rounded-lg">
              <Globe className="w-10 h-10 text-orange-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Measurement Invariance
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Test configural, metric, and scalar invariance across cultural groups.
              </p>
              <button className="text-sm font-medium text-orange-600 hover:text-orange-700">
                Test Invariance →
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Best Practices</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-1">•</span>
                <span>Conduct thorough pilot testing in each target culture</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-1">•</span>
                <span>Involve cultural experts in the adaptation process</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-1">•</span>
                <span>Test for measurement equivalence before comparing groups</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-1">•</span>
                <span>Document all adaptations and rationale comprehensively</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
