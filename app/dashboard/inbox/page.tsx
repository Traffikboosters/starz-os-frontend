"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function InboxPage() {
  const [emails, setEmails] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);

  async function load() {
    const res = await fetch("/api/emails", { cache: "no-store" });
    setEmails(await res.json());
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("inbox:communications:emails", { config: { private: true } })
      .on("broadcast", { event: "INSERT" }, load)
      .on("broadcast", { event: "UPDATE" }, load)
      .on("broadcast", { event: "DELETE" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const hot = useMemo(() => emails.filter(e => e.priority === "hot"), [emails]);
  const normal = useMemo(() => emails.filter(e => e.priority !== "hot"), [emails]);

  const list = [...hot, ...normal];

  return (
    <div className="h-screen flex bg-black text-white">
      <div className="w-1/3 border-r border-gray-800 overflow-y-auto">
        {list.map((e) => (
          <div
            key={e.id}
            onClick={() => setSelected(e)}
            className={`p-4 border-b border-gray-800 cursor-pointer hover:bg-gray-900 ${e.priority === "hot" ? "ring-1 ring-cyan-400/60 bg-cyan-500/5" : ""}`}
          >
            {e.priority === "hot" && <p className="text-cyan-300 text-xs font-semibold">HOT LEAD</p>}
            <p className="text-sm text-gray-400">{e.from}</p>
            <p className="font-bold">{e.subject}</p>
            <p className="text-xs text-gray-500 truncate">{e.text}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 p-6">
        {!selected ? (
          <div className="text-gray-500">Select an email</div>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-2">{selected.subject}</h2>
            <p className="text-sm text-gray-400 mb-4">{selected.from}</p>
            <div className="bg-gray-900 p-4 rounded-xl mb-6 whitespace-pre-wrap">{selected.text}</div>
          </>
        )}
      </div>
    </div>
  );
}