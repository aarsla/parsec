export default function LevelMeter({ level }: { level: number }) {
  const pct = Math.round(level * 100);

  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${
          level > 0.8 ? "bg-red-500" : "bg-primary"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
