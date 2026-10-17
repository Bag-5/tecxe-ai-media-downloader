export type JobStatus =
  | 'queued'
  | 'extracting'
  | 'running'
  | 'complete'
  | 'error'
  | 'cancelled'

export type MediaKind = 'video' | 'audio' | 'image' | 'unknown'

export interface ExtractedMedia {
  id: string
  url: string
  platform: string
  title: string
  uploader: string | null
  duration: number | null
  thumbnail: string | null
  isPlaylist: boolean
  entryCount: number | null
  extractor: 'ytdlp' | 'gallerydl'
  raw: Record<string, unknown>
}

export interface DownloadJob {
  id: string
  status: JobStatus
  url: string
  platform: string | null
  title: string | null
  progress: number
  error: string | null
  filepath: string | null
  createdAt: number
  updatedAt: number
}

export interface AiMetadata {
  cleanTitle: string
  artist: string | null
  kind: MediaKind
  tags: string[]
  folder: string | null
  reason: string | null
  model: string
}

export interface MediaItem {
  id: string
  title: string
  artist: string | null
  platform: string
  url: string
  kind: MediaKind
  duration: number | null
  filepath: string
  sizeBytes: number | null
  tags: string[]
  aiMetadata: AiMetadata | null
  createdAt: number
}

export interface SearchIntent {
  literalQuery: string
  duration: 'any' | 'short' | 'medium' | 'long'
  order: 'relevance' | 'viewCount' | 'rating' | 'date'
  excludeTerms: string[]
  isMusic: boolean
  rationale: string
}

export interface SearchCandidate {
  videoId: string
  title: string
  channel: string
  description: string
  thumbnail: string | null
  duration: number | null
  viewCount: number | null
  publishedAt: string | null
  url: string
  score: number
  reason: string
  suggestedFilename: string
}

export interface SearchResult {
  id: string
  query: string
  intent: SearchIntent
  candidates: SearchCandidate[]
  quotaRemaining: number | null
  createdAt: number
}