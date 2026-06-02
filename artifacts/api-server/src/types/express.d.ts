declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      role: string | null;
    }
  }
}

export {};
