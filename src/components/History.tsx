import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Search, Copy, Trash2, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface HistoryEntry {
  id: string;
  text: string;
  timestamp: number;
  app_name: string | null;
  window_title: string | null;
  char_count: number;
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDateGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getTitle(entry: HistoryEntry): string {
  const text = entry.text.trim();
  // First sentence or first ~50 chars
  const firstSentence = text.split(/[.!?\n]/)[0].trim();
  if (firstSentence.length <= 60) return firstSentence;
  return firstSentence.slice(0, 57) + "...";
}

export default function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [page, setPage] = useState(0);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday">("all");
  const PAGE_SIZE = 15;

  const loadEntries = async () => {
    try {
      const data = await invoke<HistoryEntry[]>("get_history");
      setEntries(data);
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  };

  useEffect(() => {
    loadEntries();
    const unlisten = listen("history-updated", () => {
      loadEntries();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const filtered = useMemo(() => {
    let result = entries;

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 86400000);
      const cutoff = dateFilter === "today" ? today : yesterday;
      result = result.filter((e) => e.timestamp >= cutoff.getTime());
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.text.toLowerCase().includes(q) ||
          (e.app_name && e.app_name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, search, dateFilter]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const grouped = useMemo(() => {
    const groups: { label: string; entries: HistoryEntry[] }[] = [];
    let currentLabel = "";
    for (const entry of paged) {
      const label = getDateGroup(entry.timestamp);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, entries: [entry] });
      } else {
        groups[groups.length - 1].entries.push(entry);
      }
    }
    return groups;
  }, [paged]);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_history_entry", { id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      console.error("Failed to delete entry:", e);
    }
  };

  const handleClearAll = async () => {
    if (!clearing) {
      setClearing(true);
      return;
    }
    try {
      await invoke("clear_history");
      setEntries([]);
      setSelectedId(null);
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
    setClearing(false);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  // Reset clearing confirmation when clicking elsewhere
  useEffect(() => {
    if (!clearing) return;
    const timeout = setTimeout(() => setClearing(false), 3000);
    return () => clearTimeout(timeout);
  }, [clearing]);

  return (
    <div className="flex h-full">
      {/* Left panel — list */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col">
        <div className="p-3 space-y-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search transcriptions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-7 h-8 text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 bg-secondary rounded-md p-0.5">
            {([["today", "Today"], ["yesterday", "Yesterday"], ["all", "All"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setDateFilter(id)}
                className={`flex-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                  dateFilter === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                {entries.length === 0
                  ? "No transcriptions yet"
                  : "No results found"}
              </p>
            ) : (
              grouped.map((group) => (
                <div key={group.label}>
                  <div className="px-3 pt-3 pb-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </span>
                  </div>
                  {group.entries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedId(entry.id)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg mb-0.5 transition-colors ${
                        selectedId === entry.id
                          ? "bg-sidebar-accent"
                          : "hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-foreground truncate">
                          {getTitle(entry)}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatTime(entry.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {entry.app_name && (
                          <span className="text-[10px] text-muted-foreground/70">
                            {entry.app_name}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/50">
                          {entry.char_count} chars
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="px-3 py-2 border-t border-border space-y-1.5">
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[11px] text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </span>
            {entries.length > 0 && (
              <button
                onClick={handleClearAll}
                className={`text-[11px] transition-colors ${
                  clearing
                    ? "text-destructive font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {clearing ? "Confirm Clear All?" : "Clear All"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right panel — detail */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium text-foreground">
                    {formatFullDate(selected.timestamp)}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selected.app_name || "Unknown App"}
                    {selected.window_title && ` — ${selected.window_title}`}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(selected.text)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md
                             bg-secondary border border-border hover:bg-accent
                             text-muted-foreground transition-colors shrink-0"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <Separator />

              {/* Text */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Transcribed Text
                </h3>
                <div className="bg-card border border-border rounded-lg p-4">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {selected.text}
                  </p>
                </div>
              </div>

              {/* Details */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Details
                </h3>
                <div className="bg-card border border-border rounded-lg divide-y divide-border">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Application</span>
                    <span className="text-xs text-foreground">{selected.app_name || "Unknown"}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Window</span>
                    <span className="text-xs text-foreground truncate ml-4 max-w-[200px]">
                      {selected.window_title || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Characters</span>
                    <span className="text-xs text-foreground">{selected.char_count.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Delete */}
              <div>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                             border border-destructive/30 text-destructive
                             hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={12} />
                  Delete Entry
                </button>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {entries.length === 0
                ? "Transcriptions will appear here"
                : "Select a transcription to view details"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
