'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SessionDebug() {
  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const { data, error } = await supabase.auth.getSession()
      console.log('session:', data.session)
      console.log('error:', error)
    }
    run()
  }, [])

  return null
}