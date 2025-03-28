export interface RegisterPayload {
  username: string;
  password: string;
  inviteCode: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    username: string;
  };
}

export interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}
