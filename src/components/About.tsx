import React from 'react';
import { Scale, Globe2, GraduationCap, HeartHandshake, Sparkles, BarChart3, Users } from 'lucide-react';

export function About() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <Scale className="w-9 h-9" />
          <h1 className="text-3xl font-bold">About Psychtrix Web</h1>
        </div>
        <p className="text-blue-100 text-lg">
          Publication-grade psychometrics and advanced statistics — accessible to everyone.
        </p>
        <p className="text-blue-200 text-sm mt-4">
          A product of <span className="font-semibold text-white">Psychtrix Initiative Limited</span>
        </p>
      </div>

      {/* Mission */}
      <section className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="flex items-center gap-2 mb-4">
          <HeartHandshake className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Our Purpose</h2>
        </div>
        <p className="text-gray-700 leading-relaxed">
          Psychtrix Web exists to bring ease to <strong>psychologists, researchers, and students</strong>{' '}
          who have long struggled with limited access to rigorous psychometric and advanced
          statistical tools because of the <strong>high cost of commercial software</strong> —
          a barrier felt most acutely across <strong>Africa</strong> and other under-resourced
          research communities.
        </p>
        <p className="text-gray-700 leading-relaxed mt-4">
          By delivering reference-standard analysis in the browser — at little to no cost — we aim
          to level the playing field, so that the quality of a researcher's work is decided by the
          strength of their ideas and data, not by the size of their software budget.
        </p>
      </section>

      {/* Leadership */}
      <section className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Leadership</h2>
        </div>
        <p className="text-gray-700 leading-relaxed">
          This initiative is championed by{' '}
          <strong>Associate Professor Enoch O. Oladunmoye</strong>, whose vision is to democratise
          access to advanced measurement and statistics for the next generation of African — and
          global — social scientists.
        </p>
      </section>

      {/* What it offers */}
      <section className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">What the Platform Offers</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            ['Classical Test Theory', 'Reliability, item analysis and scale statistics.'],
            ['Item Response Theory', '1PL/2PL/3PL, information, DIF and adaptive testing.'],
            ['Validity & Factor Analysis', 'EFA, CFA and SEM with ordinal (polychoric/DWLS) estimation.'],
            ['Measurement Invariance', 'Configural to strict, multi-group comparisons.'],
            ['Path Analysis & PLS-SEM', 'Mediation, moderation and composite modelling.'],
            ['Network Psychometrics', 'Regularised networks, centrality and stability.'],
            ['Scale Sandbox', 'Design, pilot and validate new instruments.'],
            ['Cultural Adaptation', 'Cross-cultural validation workflows.'],
          ].map(([title, desc]) => (
            <div key={title} className="flex gap-3">
              <BarChart3 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">{title}</p>
                <p className="text-gray-600 text-sm">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Standards */}
      <section className="bg-blue-50 rounded-xl border border-blue-200 p-8">
        <div className="flex items-center gap-2 mb-4">
          <Globe2 className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Built to a Global Standard</h2>
        </div>
        <p className="text-gray-700 leading-relaxed">
          Our estimation engines are validated against the behaviour of established reference
          software (such as lavaan, AMOS, Mplus, IRTPRO and SmartPLS). The goal is simple: results
          you can trust and defend in publication and peer review — produced on any device, anywhere.
        </p>
      </section>

      {/* Footer note */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500 pb-4">
        <Users className="w-4 h-4" />
        <span>© {new Date().getFullYear()} Psychtrix Initiative Limited. All rights reserved.</span>
      </div>
    </div>
  );
}
