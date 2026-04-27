"use client";

export default function Page() {
  return (
    <main className="min-h-screen text-white bg-[radial-gradient(circle_at_20%_20%,#1a1f3a,transparent),radial-gradient(circle_at_80%_80%,#0b0f1a,black)]">

      {/* HEADER */}
      <div className="flex justify-between items-center px-10 py-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🚀 STARZ-OS v8.0
          </h1>
          <p className="text-sm opacity-50">Orbital Command Center</p>
        </div>

        <div className="text-right">
          <p className="text-green-400 drop-shadow-[0_0_6px_rgba(34,197,94,0.8)] text-sm">
            ● Systems Online
          </p>
          <p className="text-xs opacity-60">Commander</p>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-3 gap-8 px-10">

        {/* LEFT PANEL */}
        <div className="space-y-6">

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            <h2 className="font-semibold mb-2">Mission Control</h2>
            <p className="text-sm opacity-70">Active Missions: 12</p>
            <p className="text-green-400 drop-shadow-[0_0_6px_rgba(34,197,94,0.8)] text-sm">
              Success Rate: 94%
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            <h2 className="font-semibold mb-2">Resources</h2>
            <p className="text-sm">CPU: 67%</p>
            <p className="text-sm">Memory: 42%</p>
            <p className="text-sm">Storage: 28%</p>
          </div>

        </div>

        {/* CENTER */}
        <div className="flex items-center justify-center">
          <h2 className="opacity-60 text-lg tracking-wide">
            STARZ OS Core Active
          </h2>
        </div>

        {/* RIGHT PANEL */}
        <div className="space-y-6">

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            <h2 className="font-semibold mb-2">Alerts</h2>
            <p className="text-sm">New lead assigned</p>
            <p className="text-sm">Deal closed</p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            <h2 className="font-semibold mb-3">Quick Actions</h2>

            <button className="w-full py-3 rounded-xl mb-3 bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold hover:scale-105 transition duration-300 shadow-lg">
              Email
            </button>

            <button className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 transition duration-300 shadow-lg">
              Schedule
            </button>

          </div>

        </div>
      </div>

      {/* ORBITAL DOCK */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2">
        <div className="flex gap-4 bg-black/40 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-2xl shadow-2xl">

          <div className="w-14 h-14 rounded-xl bg-purple-500 hover:scale-110 hover:-translate-y-2 transition duration-300 shadow-lg" />
          <div className="w-14 h-14 rounded-xl bg-cyan-400 hover:scale-110 hover:-translate-y-2 transition duration-300 shadow-lg" />
          <div className="w-14 h-14 rounded-xl bg-pink-500 hover:scale-110 hover:-translate-y-2 transition duration-300 shadow-lg" />
          <div className="w-14 h-14 rounded-xl bg-green-500 hover:scale-110 hover:-translate-y-2 transition duration-300 shadow-lg" />
          <div className="w-14 h-14 rounded-xl bg-red-500 hover:scale-110 hover:-translate-y-2 transition duration-300 shadow-lg" />

        </div>
      </div>

    </main>
  );
}