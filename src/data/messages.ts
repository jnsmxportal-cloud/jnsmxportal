import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, ORG_ID } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { notify, roleLink } from './ops'
import type { AppRole } from '../lib/types'

export interface Message {
  id: string
  org_id: string
  thread_id: string
  from_user: string
  to_user: string
  task_link: string | null
  body: string
  sent_at: string
  read_at: string | null
}

export interface Thread {
  threadId: string
  otherUser: string
  lastMessage: Message
  unread: number
  messages: Message[]
}

export function useMessages() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['messages', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('sent_at', { ascending: true })
      if (error) throw error
      return data as Message[]
    },
  })
}

export function useThreads(): { threads: Thread[]; unreadTotal: number } {
  const { session } = useAuth()
  const { data: messages } = useMessages()
  const me = session?.user.id
  const byThread = new Map<string, Message[]>()
  for (const m of messages ?? []) {
    if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, [])
    byThread.get(m.thread_id)!.push(m)
  }
  const threads: Thread[] = [...byThread.entries()]
    .map(([threadId, msgs]) => {
      const last = msgs[msgs.length - 1]
      const other = last.from_user === me ? last.to_user : last.from_user
      const unread = msgs.filter((m) => m.to_user === me && !m.read_at).length
      return { threadId, otherUser: other, lastMessage: last, unread, messages: msgs }
    })
    .sort((a, b) => b.lastMessage.sent_at.localeCompare(a.lastMessage.sent_at))
  return { threads, unreadTotal: threads.reduce((a, t) => a + t.unread, 0) }
}

export function useSendMessage() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: {
      threadId?: string
      toUser: string
      body: string
      taskLink?: string | null
    }) => {
      const threadId = args.threadId ?? crypto.randomUUID()
      const { error } = await supabase.from('messages').insert({
        org_id: ORG_ID,
        thread_id: threadId,
        from_user: session!.user.id,
        to_user: args.toUser,
        task_link: args.taskLink ?? null,
        body: args.body,
      })
      if (error) throw error
      // deep link must match the recipient's surface, not the sender's
      const { data: recip, error: recipError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', args.toUser)
        .maybeSingle()
      if (recipError) console.warn('message notify: role lookup failed —', recipError.message)
      const role = ((recip as { role?: AppRole } | null)?.role ?? 'staff') as AppRole
      await notify([args.toUser], {
        org_id: ORG_ID,
        type: 'message',
        title: 'New message',
        body: args.body.slice(0, 120),
        deep_link: roleLink(role, {
          mgmt: '/owner/inbox',
          team_leader: '/staff/inbox',
          staff: '/staff/inbox',
        }),
        icon: 'chat-circle-dots',
      } as never)
      return threadId
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  })
}

export function useMarkThreadRead() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('thread_id', threadId)
        .eq('to_user', session!.user.id)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  })
}
