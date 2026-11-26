export function ChunkFallback() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-xl">
      <div className="bg-surface rounded-lg px-xl py-md shadow-card text-[14px] text-ink-secondary">
        Loading workspace…
      </div>
    </div>
  );
}
