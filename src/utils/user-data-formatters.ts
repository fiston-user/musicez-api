export interface UserPlaylist {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  isPublic: boolean;
  owner: string;
}

export interface RecentTrack {
  trackId: string;
  name: string;
  artist: string;
  album: string;
  popularity: number;
  playedAt: string;
}

export interface UserPlaylistsResponse {
  success: true;
  data: {
    playlists: UserPlaylist[];
  };
  timestamp: string;
  requestId: string;
}

export interface RecentTracksResponse {
  success: true;
  data: {
    tracks: RecentTrack[];
  };
  timestamp: string;
  requestId: string;
}

export interface SyncJobResponse {
  success: true;
  data: {
    jobId: string;
    status: string;
    estimatedProcessingTime: string;
  };
  requestId: string;
}

export interface UserSyncJob {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  processingTimeMs: number | null;
  retryCount: number;
}

export interface UserSyncJobsResponse {
  success: true;
  data: {
    jobs: UserSyncJob[];
  };
  timestamp: string;
  requestId: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export const formatUserPlaylistsResponse = (
  spotifyPlaylistsResponse: any,
  requestId: string
): UserPlaylistsResponse => {
  const playlists: UserPlaylist[] = (spotifyPlaylistsResponse.items || []).map((playlist: any) => ({
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    trackCount: playlist.tracks?.total || 0,
    isPublic: playlist.public,
    owner: playlist.owner?.display_name || 'Unknown',
  }));

  return {
    success: true,
    data: { playlists },
    timestamp: new Date().toISOString(),
    requestId,
  };
};

export const formatRecentTracksResponse = (
  spotifyTracksResponse: any,
  requestId: string
): RecentTracksResponse => {
  const tracks: RecentTrack[] = (spotifyTracksResponse.items || []).map((item: any) => ({
    trackId: item.track.id,
    name: item.track.name,
    artist: item.track.artists?.[0]?.name || 'Unknown Artist',
    album: item.track.album?.name || 'Unknown Album',
    popularity: item.track.popularity || 0,
    playedAt: item.played_at,
  }));

  return {
    success: true,
    data: { tracks },
    timestamp: new Date().toISOString(),
    requestId,
  };
};

export const formatSyncJobResponse = (
  jobId: string,
  status: string,
  estimatedProcessingTime: string,
  requestId: string
): SyncJobResponse => {
  return {
    success: true,
    data: {
      jobId,
      status,
      estimatedProcessingTime,
    },
    requestId,
  };
};

export const formatUserSyncJobsResponse = (
  jobs: any[],
  requestId: string
): UserSyncJobsResponse => {
  const formattedJobs: UserSyncJob[] = jobs.map((job) => {
    const processingTimeMs = job.startedAt && job.completedAt
      ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
      : null;

    return {
      id: job.id,
      type: job.jobType,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      processingTimeMs,
      retryCount: job.retryCount || 0,
    };
  });

  return {
    success: true,
    data: { jobs: formattedJobs },
    timestamp: new Date().toISOString(),
    requestId,
  };
};

export const userDataErrorResponses = {
  internalError: (requestId: string): ErrorResponse => ({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred. Please try again later.',
    },
    requestId,
  }),

  validationError: (message: string, requestId: string): ErrorResponse => ({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message,
    },
    requestId,
  }),

  spotifyConnectionRequired: (requestId: string): ErrorResponse => ({
    success: false,
    error: {
      code: 'SPOTIFY_CONNECTION_REQUIRED',
      message: 'Spotify account connection is required for this operation',
    },
    requestId,
  }),

  unauthorized: (requestId: string): ErrorResponse => ({
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    },
    requestId,
  }),

  rateLimitExceeded: (): ErrorResponse => ({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
    requestId: '',
  }),
};