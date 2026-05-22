export type TimeSource = 'auto' | 'manual'

export type StatKey =
  | 'has_flat_hp'
  | 'has_flat_atk'
  | 'has_flat_def'
  | 'has_hp_pct'
  | 'has_atk_pct'
  | 'has_def_pct'
  | 'has_dmg_pct'
  | 'has_crit_rate'
  | 'has_crit_dmg'
  | 'has_break_intensity'
  | 'has_cycle_intensity'

export const STAT_LABELS: Record<StatKey, string> = {
  has_flat_hp: 'HP',
  has_flat_atk: 'ATK',
  has_flat_def: 'DEF',
  has_hp_pct: 'HP%',
  has_atk_pct: 'ATK%',
  has_def_pct: 'DEF%',
  has_dmg_pct: 'DMG%',
  has_crit_rate: 'CRIT Rate',
  has_crit_dmg: 'CRIT DMG',
  has_break_intensity: 'Break Intensity',
  has_cycle_intensity: 'Cycle Intensity',
}

export const HIGH_VALUE_STATS: StatKey[] = [
  'has_crit_rate',
  'has_crit_dmg',
  'has_dmg_pct',
  'has_atk_pct',
  'has_break_intensity',
  'has_cycle_intensity',
]

export const SECOND_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const

export type SecondOption = (typeof SECOND_OPTIONS)[number]

export type DateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'last7'

export const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yday' },
  { value: 'week', label: 'Week' },
  { value: 'last7', label: '7d' },
]

export interface PullInsertPayload {
  user_tag: string
  session_id: string
  pull_hour: number
  pull_minute: number
  pull_second: SecondOption
  time_source: TimeSource
  logged_client_at: string
  timezone_offset_minutes: number
  team_label?: string
  notes?: string
  has_flat_hp: boolean
  has_flat_atk: boolean
  has_flat_def: boolean
  has_hp_pct: boolean
  has_atk_pct: boolean
  has_def_pct: boolean
  has_dmg_pct: boolean
  has_crit_rate: boolean
  has_crit_dmg: boolean
  has_break_intensity: boolean
  has_cycle_intensity: boolean
}

export interface PullRow {
  id: string
  user_tag: string
  session_id: string
  pull_hour: number
  pull_minute: number
  pull_second: SecondOption
  time_source: TimeSource
  logged_client_at: string
  timezone_offset_minutes: number
  team_label: string | null
  notes: string | null
  has_flat_hp: boolean
  has_flat_atk: boolean
  has_flat_def: boolean
  has_hp_pct: boolean
  has_atk_pct: boolean
  has_def_pct: boolean
  has_dmg_pct: boolean
  has_crit_rate: boolean
  has_crit_dmg: boolean
  has_break_intensity: boolean
  has_cycle_intensity: boolean
  is_dual_crit: boolean
  created_at: string
}

export interface SecondStatsRow {
  pull_second: SecondOption
  total_pulls: number
  dual_crit_count: number
  cdmg_count: number
  crate_count: number
  dmg_pct_count: number
  atk_pct_count: number
  hp_pct_count: number
  def_pct_count: number
  break_count: number
  cycle_count: number
  dual_crit_pct: number | null
}
