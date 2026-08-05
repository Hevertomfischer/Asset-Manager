import "express-session";

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

declare module "express-session" {
  interface SessionData {
    /** Parâmetros OAuth do MCP preservados durante o fluxo de login do Google. */
    mcpOauthPending?: {
      responseType: string;
      clientId: string;
      redirectUri: string;
      state: string | undefined;
      codeChallenge: string;
      codeChallengeMethod: string;
    };
  }
}

export {};
