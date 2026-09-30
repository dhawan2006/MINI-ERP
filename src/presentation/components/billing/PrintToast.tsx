import { useBillingStore } from '../../../application/state/billingStore';

export function PrintToast() {
  const printJobState = useBillingStore(state => state.printJobState);
  const printJobError = useBillingStore(state => state.printJobError);
  const lastFinalizedBill = useBillingStore(state => state.lastFinalizedBill);
  const retryPrint = useBillingStore(state => state.retryPrint);

  const pdfExportState = useBillingStore(state => state.pdfExportState);
  const pdfExportError = useBillingStore(state => state.pdfExportError);
  const lastExportedPdf = useBillingStore(state => state.lastExportedPdf);
  const exportPdf = useBillingStore(state => state.exportPdf);
  const openPdf = useBillingStore(state => state.openPdf);

  // Nothing to show
  if (!printJobState && pdfExportState === 'idle') return null;

  const isPrintError = printJobState === 'FAILED';
  const isPrinting = printJobState === 'PRINTING' || printJobState === 'QUEUED';
  const isPrintAccepted = printJobState === 'ACCEPTED';

  const isPdfExporting = pdfExportState === 'exporting';
  const isPdfSaved = pdfExportState === 'saved';
  const isPdfFailed = pdfExportState === 'failed';
  const showPdfSection = pdfExportState !== 'idle';

  return (
    <div className="fixed bottom-4 left-4 flex flex-col gap-2 z-50">
      {/* Print job toast */}
      {printJobState && (
        <div className={`p-4 rounded-lg shadow-lg border text-sm transition-all ${
          isPrintError ? 'bg-red-50 border-red-200 text-red-800' :
          isPrintAccepted ? 'bg-green-50 border-green-200 text-green-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center gap-4">
            <div>
              <div className="font-bold">
                {isPrintError ? 'Print Failed' : isPrintAccepted ? 'Print Accepted' : 'Printing Receipt...'}
              </div>
              {lastFinalizedBill && (
                <div className="opacity-80">Bill #{lastFinalizedBill.billNumber}</div>
              )}
              {isPrintError && printJobError && (
                <div className="text-xs mt-1 max-w-[200px] truncate" title={printJobError}>
                  {printJobError}
                </div>
              )}
            </div>

            {isPrintError && lastFinalizedBill && (
              <button
                className="px-3 py-1 bg-red-100 hover:bg-red-200 border border-red-300 rounded font-medium transition-colors"
                onClick={() => retryPrint(lastFinalizedBill.id)}
              >
                Retry
              </button>
            )}
            {isPrinting && (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70" />
            )}

            {/* Export PDF button — shown on print accepted or failed (bill is finalized) */}
            {(isPrintAccepted || isPrintError) && lastFinalizedBill && pdfExportState === 'idle' && (
              <button
                className="px-3 py-1 bg-current/10 hover:bg-current/20 border border-current/30 rounded font-medium transition-colors text-xs"
                onClick={() => exportPdf(lastFinalizedBill.id)}
                title="Export receipt as PDF"
              >
                Export PDF
              </button>
            )}
          </div>
        </div>
      )}

      {/* PDF export toast */}
      {showPdfSection && (
        <div className={`p-4 rounded-lg shadow-lg border text-sm transition-all ${
          isPdfFailed ? 'bg-red-50 border-red-200 text-red-800' :
          isPdfSaved ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          'bg-slate-50 border-slate-200 text-slate-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-bold">
                {isPdfExporting && 'Generating PDF...'}
                {isPdfSaved && lastExportedPdf && `PDF Saved — Bill-${String(lastExportedPdf.billNumber).padStart(6, '0')}.pdf`}
                {isPdfFailed && 'PDF Export Failed'}
              </div>
              {isPdfFailed && pdfExportError && (
                <div className="text-xs mt-1 max-w-[220px] truncate" title={pdfExportError}>
                  {pdfExportError}
                </div>
              )}
            </div>

            {isPdfExporting && (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70 flex-shrink-0" />
            )}

            {/* Open PDF button — shown after successful save; user explicitly clicks it */}
            {isPdfSaved && lastExportedPdf && (
              <button
                className="px-3 py-1 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded font-medium transition-colors text-xs flex-shrink-0"
                onClick={() => openPdf(lastExportedPdf.filePath)}
                title={lastExportedPdf.filePath}
              >
                Open
              </button>
            )}

            {/* Retry PDF export — shown on failure when bill is still available */}
            {isPdfFailed && lastFinalizedBill && (
              <button
                className="px-3 py-1 bg-red-100 hover:bg-red-200 border border-red-300 rounded font-medium transition-colors text-xs flex-shrink-0"
                onClick={() => exportPdf(lastFinalizedBill.id)}
              >
                Retry PDF
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
