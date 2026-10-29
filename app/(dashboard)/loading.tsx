/** Shimmer placeholder shown while a page opens. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading page">
      <div className="mb-6 space-y-2">
        <div className="shimmer h-7 w-48 rounded-lg" />
        <div className="shimmer h-4 w-72 max-w-full rounded" />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="shimmer h-3 w-24 rounded" />
              <div className="shimmer size-10 rounded-xl" />
            </div>
            <div className="shimmer mt-4 h-8 w-32 rounded-lg" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
        <div className="shimmer mb-5 h-10 w-full max-w-md rounded-xl" />
        <div className="space-y-4">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center gap-4">
              <div className="shimmer h-4 w-20 rounded" />
              <div className="shimmer h-4 flex-1 rounded" />
              <div className="shimmer hidden h-4 w-28 rounded sm:block" />
              <div className="shimmer hidden h-6 w-24 rounded-full md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
