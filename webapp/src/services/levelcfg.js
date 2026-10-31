import { supabase } from '../lib/supabase'
import { setLevelCfg } from '../lib/levelcurve'

export async function loadLevelCfg() {
  if (!supabase) return false
  try {
    const { data, error } = await supabase.rpc('level_config_get')
    return !error && data ? setLevelCfg(data) : false
  } catch { return false }
}

export async function devLevelCfgSet(base, growth, tiers) {
  const { data, error } = await supabase.rpc('dev_level_config_set', { p_base: base, p_growth: growth, p_tiers: tiers })
  if (error) throw new Error(error.message)
  setLevelCfg(data)
  return data
}
