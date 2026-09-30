/** Labelled form field with inline validation messaging. */
export default function Field({
  label,
  id,
  error,
  hint,
  className = '',
  inputClassName = '',
  ...inputProps
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 ${
          error
            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
            : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/20'
        } ${inputClassName}`}
        {...inputProps}
      />
      {error ? (
        <p className="text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
