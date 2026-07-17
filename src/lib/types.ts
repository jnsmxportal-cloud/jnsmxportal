export type AppRole = 'owner' | 'manager' | 'team_leader' | 'remote_office' | 'staff'

export type TaskStatus =
  | 'scheduled'
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'missed'

export type TaskCategory = 'daily' | 'weekly' | 'ad_hoc' | 'incident' | 'delivery' | 'maintenance'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type DeliveryStatus = 'review' | 'verified' | 'approved' | 'rejected'

export interface Profile {
  id: string
  org_id: string
  full_name: string
  role: AppRole
  avatar_color: string
  is_online: boolean
}

export interface Store {
  id: string
  org_id: string
  name: string
  city: string | null
  timezone: string
  lat: number | null
  lng: number | null
  geofence_radius_m: number
  qr_zones: number
}

export interface StoreUnit {
  id: string
  store_id: string
  name: string
  type: 'chiller' | 'freezer'
  safe_limit: number
  breach_above: number
  min_pick: number
  max_pick: number
  display_order: number
}

export interface EvidenceReqs {
  photo?: boolean
  temp?: boolean
  qr?: boolean
  signature?: boolean
  note?: boolean
  geofence?: boolean
}

export interface TaskInstance {
  id: string
  org_id: string
  template_id: string | null
  store_id: string
  title: string
  description: string | null
  category: TaskCategory
  priority: TaskPriority
  status: TaskStatus
  evidence: EvidenceReqs
  geofence_policy: 'none' | 'flag' | 'block'
  is_temperature_log: boolean
  due_at: string | null
  cutoff_at: string | null
  assigned_to: string | null
  submitted_at: string | null
  submitted_by: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  review_feedback: string | null
  completed_at: string | null
  geofence_verdict: string | null
  created_at: string
}

export interface ChecklistItem {
  id: string
  instance_id: string
  label: string
  position: number
  requires_photo: boolean
  requires_temp: boolean
  temp_limit: number | null
  temp_is_max: boolean
  requires_qr: boolean
  requires_signature: boolean
  checked: boolean
  temp_value: number | null
  photo_count: number
  qr_verified: boolean
}

export interface Delivery {
  id: string
  org_id: string
  store_id: string
  supplier: string
  invoice_no: string | null
  invoice_total: number | null
  discrepancy_units: number
  remarks: string | null
  photo_count: number
  status: DeliveryStatus
  submitted_by: string | null
  submitted_at: string
  review_due_at: string | null
  geofence_verdict: string | null
}

export interface Invoice {
  id: string
  org_id: string
  store_id: string
  supplier: string
  invoice_no: string | null
  invoice_date: string | null
  pdf_path: string | null
  uploaded_by: string | null
  uploaded_at: string
}

export interface Escalation {
  id: string
  org_id: string
  store_id: string
  source: string
  title: string
  detail: string | null
  level: 'high' | 'critical'
  stage: 'team_leader' | 'owner'
  status: 'open' | 'investigating' | 'resolved'
  action_due_at: string | null
  created_at: string
}

export interface AppNotification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  deep_link: string | null
  icon: string | null
  created_at: string
  read_at: string | null
}
