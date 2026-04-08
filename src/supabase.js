import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://datqjbnetudvqjsxjczl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhdHFqYm5ldHVkdnFqc3hqY3psIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjMxMTIsImV4cCI6MjA4NzUzOTExMn0.8QY1ew74ahBLmhU5vAyZF-ygRGr0p4xpM8i0OLTV4-4',
)
