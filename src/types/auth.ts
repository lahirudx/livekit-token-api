export interface RegisterPayload {
  email: string;
  password: string;
  inviteCode: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

export interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}
