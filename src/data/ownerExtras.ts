import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

export interface EvidenceRow {
  id: string
  org_id: string
  instance_id: string | null
  delivery_id: string | null
  item_id: string | null
  type: 'photo' | 'signature' | 'qr' | 'metadata'
  storage_path: string | null
  metadata: Record<string, unknown> | null
  uploader: string | null
  device_ts: string
  geofence_verdict: string | null
}

export function useEvidence(instanceId: string | null) {
  return useQuery({
    queryKey: ['evidence', instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evidence')
        .select('*')
        .eq('instance_id', instanceId!)
        .order('device_ts')
      if (error) throw error
      return data as EvidenceRow[]
    },
  })
}

export function useDeliveryEvidence(deliveryId: string | null) {
  return useQuery({
    queryKey: ['evidence-delivery', deliveryId],
    enabled: !!deliveryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evidence')
        .select('*')
        .eq('delivery_id', deliveryId!)
        .order('device_ts')
      if (error) throw error
      return data as EvidenceRow[]
    },
  })
}

export async function evidenceSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('evidence').createSignedUrl(path, 300)
  if (error || !data?.signedUrl) throw error ?? new Error('Could not create a signed URL')
  return data.signedUrl
}

export { useUserStoreRoles, type UserStoreRole } from './admin'

/** Presence rule: online iff is_online AND last_seen_at within the last 5 minutes. */
export function isOnline(p: Profile): boolean {
  const seen = (p as Profile & { last_seen_at?: string | null }).last_seen_at
  return !!p.is_online && !!seen && Date.now() - new Date(seen).getTime() < 5 * 60_000
}
