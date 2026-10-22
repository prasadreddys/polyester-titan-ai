import React from 'react';
import { X, Key, ShieldCheck, Copy, Check } from 'lucide-react';

interface SecretsGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecretsGuideModal: React.FC<SecretsGuideModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const envSample = `# Polyester Testnet API Configuration (Server-Side Only)
POLYESTER_API_HOST=https://testnet.polyester.com
POLYESTER_API_KEY_ID=your_api_key_id_here
POLYESTER_API_PRIVATE_KEY=your_private_key_here
POLYESTER_ACCOUNT_ID=your_account_id_here

# Optional: Companion Python FastAPI Service URL
FASTAPI_BACKEND_URL=http://localhost:8000`;

  const handleCopy = () => {
    navigator.clipboard.writeText(envSample);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Server-Side Secrets Configuration Guide
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs leading-relaxed">
          <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded flex items-start gap-2.5 text-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>
              <strong>Zero-Client Leak Guarantee:</strong> All trading credentials and private keys are read exclusively by the Node.js server bridge (<code className="font-mono text-emerald-100">server/config.ts</code>). They are never injected into browser Vite env variables (<code className="font-mono text-emerald-100">VITE_*</code>) or serialized into client API responses.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-200 mb-1">1. Required Server Variables</h4>
            <ul className="space-y-2 text-slate-400 font-mono">
              <li className="p-2 bg-slate-950 border border-slate-800 rounded">
                <span className="text-sky-400 font-bold">POLYESTER_API_HOST</span>: Target Polyester Testnet REST host. Defaults to <code className="text-slate-300">https://testnet.polyester.com</code>.
              </li>
              <li className="p-2 bg-slate-950 border border-slate-800 rounded">
                <span className="text-emerald-400 font-bold">POLYESTER_API_KEY_ID</span>: Your API Key identifier obtained from the Polyester Testnet web dashboard.
              </li>
              <li className="p-2 bg-slate-950 border border-slate-800 rounded">
                <span className="text-purple-400 font-bold">POLYESTER_API_PRIVATE_KEY</span>: Your cryptographic signing private key. Never logged or printed in audit trails.
              </li>
              <li className="p-2 bg-slate-950 border border-slate-800 rounded">
                <span className="text-amber-400 font-bold">POLYESTER_ACCOUNT_ID</span>: The default account ID to execute trades for on testnet.
              </li>
              <li className="p-2 bg-slate-950 border border-slate-800 rounded">
                <span className="text-slate-400 font-bold">FASTAPI_BACKEND_URL</span>: (Optional) URL of the companion Python 3.11+ FastAPI service (e.g. <code className="text-slate-300">http://localhost:8000</code>).
              </li>
            </ul>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="font-semibold text-slate-200">2. Configuration Template</h4>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy Template'}</span>
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-slate-300 font-mono text-[11px] overflow-x-auto">
              {envSample}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
