"use client";

import { CallExport } from "@/lib/api";

interface CallExportModalProps {
  viewingCallExports: CallExport[];
  viewingCallId: number | null;
  selectedCallExportType: 'agfeo' | 'taifun';
  onExportTypeChange: (type: 'agfeo' | 'taifun') => void;
  onClose: () => void;
  getCurrentCallExport: () => CallExport | undefined;
}

export function CallExportModal({
  viewingCallExports,
  viewingCallId,
  selectedCallExportType,
  onExportTypeChange,
  onClose,
  getCurrentCallExport,
}: CallExportModalProps) {
  if (viewingCallExports.length === 0) return null;

  const currentExport = getCurrentCallExport();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] w-full max-w-4xl max-h-[90vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <div>
            <h3 className="text-lg font-semibold">Call Exports</h3>
            <p className="text-sm text-[var(--text-secondary)]">Call ID: {viewingCallId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--border)] rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-[var(--border)]">
          <button
            onClick={() => onExportTypeChange('agfeo')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              selectedCallExportType === 'agfeo'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            AGFEO JSON
            {viewingCallExports.some(e => e.export_type === 'agfeo') && (
              <span className="ml-2 w-2 h-2 bg-blue-400 rounded-full inline-block" />
            )}
          </button>
          <button
            onClick={() => onExportTypeChange('taifun')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              selectedCallExportType === 'taifun'
                ? 'text-green-400 border-b-2 border-green-400 bg-green-500/10'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Taifun XML
            {viewingCallExports.some(e => e.export_type === 'taifun') ? (
              <span className="ml-2 w-2 h-2 bg-green-400 rounded-full inline-block" />
            ) : (
              <span className="ml-2 text-xs text-[var(--text-secondary)]">(pending)</span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {currentExport ? (
            <pre className="text-sm font-mono bg-[var(--bg-tertiary)] p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-words">
              {currentExport.content}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-[var(--text-secondary)]">
              <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>Taifun XML wird gerade generiert...</p>
              <p className="text-xs mt-2">Conversion runs in the background via Temporal</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

