// Legacy setting values are accepted during upgrades; the interface is unified.
export const PUBLIC_STYLE_PRESETS = ['schale'] as const
export type PublicStylePreset = 'schale'
export const DEFAULT_PUBLIC_STYLE_PRESET: PublicStylePreset = 'schale'
export function normalizePublicStylePreset(_raw?: string | null): PublicStylePreset { return 'schale' }
