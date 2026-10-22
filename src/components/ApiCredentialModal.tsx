/**
 * Secure, Non-Persistent React Form Component for Polyester API Credentials
 * Ensures credentials are stored only in React memory state (never in localStorage/sessionStorage)
 * and transmitted securely via HTTPS POST. Inputs use type='password'.
 * Includes client-side sanitization to strip whitespace and newline characters.
 */

import React, { useState } from 'react';
import { X, Key, ShieldCheck, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ApiCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiCredentialModal: React.FC<ApiCredentialModalProps> = ({ isOpen, onClose }) => {
  const [apiKeyId, setApiKeyId] = useState('');
  const [apiPrivateKey, setApiPrivateKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ success: boolean; text: string } | null>(null);

  if (!isOpen) return null;

  const handleClear = () => {
    setApiKeyId('');
    setApiPrivateKey('');
    setResultMessage(null);
  };

  const handleClose = () => {
    handleClear();
    onClose();
  };

  /**
   * Client-side sanitization function ensuring whitespace, carriage returns,
   * and newline characters are stripped from API Key and Secret inputs before transmission.
   */
  const sanitizeCredential = (input: string): string => {
    if (!input) return '';
    return input.replace(/[\r\n]+/g, '').trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKeyId = sanitizeCredential(apiKeyId);
    const cleanPrivateKey = sanitizeCredential(apiPrivateKey);

    if (!cleanKeyId || !cleanPrivateKey) {
      setResultMessage({ success: false, text: 'Both API Key ID and Private Key are required.' });
      return;
    }

    if (cleanKeyId.length < 4 || cleanPrivateKey.length < 8) {
      setResultMessage({
        success: false,
        text: 'Invalid credential length. API Key ID must be at least 4 characters and Private Key at least 8 characters.',
      });
      return;
    }

    setIsSubmitting(true);
    setResultMessage(null);

    try {
      const response = await fetch('/api/credentials/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeyId: cleanKeyId, apiPrivateKey: cleanPrivateKey }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setResultMessage({ success: true, text: data.message || 'Credentials successfully verified in memory.' });
        // Clear sensitive values from memory immediately after verification response
        setApiKeyId('');
        setApiPrivateKey('');
      } else {
        setResultMessage({ success: false, text: data.error || 'Credential verification failed.' });
      }
    } catch (err) {
      setResultMessage({ success: false, text: (err as Error).message || 'Network error during verification.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Secure API Credential Testing
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body (Authenticated / Secure Scope) */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs" autoComplete="off">
          <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded flex items-start gap-2.5 text-amber-200">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              <strong>Non-Persistent Memory Only:</strong> Credentials entered here are stored strictly in React component state (memory) and transmitted securely to the server endpoint via HTTPS. They are never saved to disk or persistent storage.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block font-medium text-slate-300">API Key ID</label>
            <input
              type="password"
              value={apiKeyId}
              onChange={(e) => setApiKeyId(e.target.value)}
              placeholder="Enter Polyester API Key ID (min 4 chars)"
              autoComplete="new-password"
              required
              minLength={4}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-amber-500 font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-medium text-slate-300">Private Key</label>
            <input
              type="password"
              value={apiPrivateKey}
              onChange={(e) => setApiPrivateKey(e.target.value)}
              placeholder="Enter Private Key (min 8 chars, masked)"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-amber-500 font-mono text-xs"
            />
          </div>

          {resultMessage && (
            <div
              className={`p-3 rounded border flex items-center gap-2 ${
                resultMessage.success
                  ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
              }`}
            >
              {resultMessage.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{resultMessage.text}</span>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 font-medium text-white bg-amber-600 hover:bg-amber-500 rounded transition-colors disabled:opacity-50"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Verifying...' : 'Test Credentials'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
