/** Generic placeholder for routes that are scaffolded but not implemented yet. */

export default function Placeholder({ title, detail }) {
  return (
    <div className="flex h-full min-h-[24rem] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-2xl">
        <span aria-hidden="true">⛏</span>
      </div>
      <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-500">{detail}</p>
      <p className="mt-4 rounded-md bg-slate-200 px-3 py-1.5 font-mono text-xs text-slate-600">
        Coming in a later milestone
      </p>
    </div>
  );
}
