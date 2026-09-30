const TONES = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
  info: 'bg-sky-50 border-sky-200 text-sky-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
};

const ICONS = { success: '✓', error: '!', info: 'i', warning: '!' };

/** Dismissible inline status message. */
export default function Alert({ tone = 'info', title, children, onDismiss }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-bold"
        aria-hidden="true"
      >
        {ICONS[tone]}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded px-1 text-lg leading-none opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          &times;
        </button>
      )}
    </div>
  );
}
