export interface User {
  id: string;
  email: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  success: true;
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
  };
  timestamp: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  success: true;
  data: {
    accessToken: string;
    refreshToken: string;
  };
  timestamp: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    field?: string;
  };
  timestamp: string;
}