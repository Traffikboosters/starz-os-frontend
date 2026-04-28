"use client"

import { useEffect, useState } from "react"

type Email = {
  id: string
  subject: string
  from_email: string
  to_email: string
  body: string
  created_at: string
  lead_id?: string
  is_read?: boolean
}

export default function StarzInbox() {
  const [emails, setEmails] = useState<Email[]>([])
  const [selected, setSelected] = useState<Email | null>(null)
  const [reply, setReply] = useState("")

  async function loadEmails() {
    const res = await fetch("/api/inbox")
    const data = await res.json()
    setEmails(data || [])
  }

  async function sendReply() {
    if (!selected) return

    await fetch("/api/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: selected.from_email,
        subject: "Re: " + selected.subject,
        body: reply,
        lead_id: selected.lead_id
      })
    })

    setReply("")
    loadEmails()
  }

  useEffect(() => {
    loadEmails()
  }, [])

  return (
    <div className="flex h-screen bg-black text-white">
      
      {/* Sidebar */}
      <div className="w-1/3 border-r border-gray-800 overflow-y-auto">
        <div className="p-4 text-xl font-bold">📩 STARZ INBOX</div>

        {emails.map((email) => (
          <div
            key={email.id}
            onClick={() => setSelected(email)}
            className="p-4 border-b border-gray-800 hover:bg-gray-900 cursor-pointer"
          >
            <div className="text-sm text-gray-400">{email.from_email}</div>
            <div className="font-semibold">{email.subject}</div>
            <div className="text-xs text-gray-500">
              {new Date(email.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Email Viewer */}
      <div className="flex-1 flex flex-col">
        {selected ? (
          <>
            <div className="p-4 border-b border-gray-800">
              <div className="text-lg font-bold">{selected.subject}</div>
              <div className="text-sm text-gray-400">
                From: {selected.from_email}
              </div>
            </div>

            <div className="p-4 flex-1 overflow-y-auto whitespace-pre-wrap">
              {selected.body}
            </div>

            {/* Reply Box */}
            <div className="p-4 border-t border-gray-800">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply..."
                className="w-full p-3 bg-gray-900 border border-gray-700 rounded"
              />
              <button
                onClick={sendReply}
                className="mt-2 px-4 py-2 bg-blue-600 rounded hover:bg-blue-500"
              >
                Send Reply 🚀
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select an email
          </div>
        )}
      </div>
    </div>
  )
}