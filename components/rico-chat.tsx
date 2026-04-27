'use client'

import { useState } from 'react'
import { engine } from '@/lib/api'

type Message = {
  role: 'user' | 'assistant'
  text: string
}

export function RicoChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: "Hi, I'm Rico. I manage fulfillment and work orders. What do you need?" }
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setBusy(true)
    try {
      const res = await engine<{ reply: string }>('rico-engine', 'chat', { message: text })
      const reply = res?.data?.reply ?? 'Got it. I will handle that.'
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Try again.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-cyan-500 hover:bg-cyan-400 transition-colors flex items-center justify-center shadow-lg z-50"
        aria-label="Toggle Rico chat"
      >
        <span className="text-2xl">{open ? '✕' : '💬'}</span>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 w-80 h-96 bg-gray-900 border border-white/10 rounded-2xl flex flex-col shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-gray-950">
            <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-sm font-bold">R</div>
            <div>
              <p className="text-sm font-semibold text-white">Rico BGE</p>
              <p className="text-xs text-cyan-400">Fulfillment Supervisor</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                  m.role === 'user'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-white/10 text-white/90'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white/10 px-3 py-2 rounded-xl text-sm text-white/50 animate-pulse">
                  Rico is typing...
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-white/10">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send() }}
              placeholder="Ask Rico..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={send}
              disabled={busy}
              className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  )
}
