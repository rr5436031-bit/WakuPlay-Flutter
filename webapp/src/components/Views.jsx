import { useAnimeViews, useEpisodeViews } from '../lib/views'
import { fmtViews } from '../lib/format'

export const AnimeViewsText = ({ id }) => fmtViews(useAnimeViews(id))
export const EpisodeViewsText = ({ id }) => fmtViews(useEpisodeViews(id))
