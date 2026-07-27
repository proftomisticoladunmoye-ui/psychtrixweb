import React, { useState } from 'react';
import { Shield, X } from 'lucide-react';

/**
 * App footer with a Privacy Policy modal. The policy is a clear, standard
 * template for the platform; the operator should confirm the entity name,
 * contact address and governing jurisdiction before relying on it publicly.
 */
export function Footer() {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const year = new Date().getFullYear();

  return (
    <>
      <footer className="border-t border-gray-200 bg-white px-4 py-4 lg:px-8">
        <div className="max-w-screen-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
          <p>© {year} Psychtrix Initiative Limited · Publication-grade psychometrics</p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'about' }))}
              className="hover:text-blue-600 transition font-medium"
            >
              About
            </button>
            <button
              onClick={() => setShowPrivacy(true)}
              className="flex items-center gap-1.5 hover:text-blue-600 transition font-medium"
            >
              <Shield className="w-4 h-4" />
              Privacy Policy
            </button>
            <a href="mailto:support@psychtrixweb.online" className="hover:text-blue-600 transition">
              Contact
            </a>
          </div>
        </div>
      </footer>

      {showPrivacy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPrivacy(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                Privacy Policy
              </h2>
              <button
                onClick={() => setShowPrivacy(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto text-sm text-gray-700 space-y-4">
              <p className="text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

              <p>
                Psychtrix Web ("the Platform", "we", "us") is a web application for
                psychometric analysis. This policy explains what data we collect,
                why, and the choices you have.
              </p>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1">1. Information we collect</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Account details:</strong> your email address and a securely hashed password.</li>
                  <li><strong>Research data you upload:</strong> the datasets, scale definitions and
                    analysis configurations you create. This may include participant response data
                    that <em>you</em> are responsible for having collected lawfully.</li>
                  <li><strong>Results you generate:</strong> analysis outputs, reports and saved projects.</li>
                  <li><strong>Basic technical logs</strong> needed to operate and secure the service.</li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1">2. How we use it</h3>
                <p>
                  Your data is used solely to provide the analysis features you request, to store
                  your work between sessions, and to keep your account secure. We do not sell your
                  data, and we do not use your uploaded research data to train models or for
                  advertising.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1">3. Where it is stored</h3>
                <p>
                  Data is stored in a managed PostgreSQL database and served over encrypted (HTTPS)
                  connections. Passwords are stored only as salted cryptographic hashes and are never
                  recoverable in plain text.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1">4. Data isolation</h3>
                <p>
                  Your datasets, analyses and projects are private to your account. Other users
                  cannot access them. The one exception is a survey link you deliberately choose to
                  share, which grants anonymous access only to that specific shared scale.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1">5. Your responsibilities as a researcher</h3>
                <p>
                  If you upload data about human participants, you are the data controller for that
                  data. You are responsible for obtaining informed consent, anonymising or
                  pseudonymising responses where appropriate, and complying with the ethical and
                  legal requirements (e.g. GDPR, your institution's IRB/ethics board) that apply to
                  your research.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1">6. Your rights and choices</h3>
                <p>
                  You can view, export, or delete your datasets, analyses and reports from within the
                  app at any time. To close your account and remove your associated data, contact us
                  at the address below.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1">7. Contact</h3>
                <p>
                  Questions about this policy or your data can be sent to{' '}
                  <a href="mailto:support@psychtrixweb.online" className="text-blue-600 hover:underline">
                    support@psychtrixweb.online
                  </a>.
                </p>
              </section>

              <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                This policy is provided as a general template for the Platform. The operator should
                confirm the legal entity name, contact address, and governing jurisdiction, and seek
                independent legal review before publishing it as a binding policy.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
