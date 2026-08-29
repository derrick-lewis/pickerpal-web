// Minimal typings for the Google Identity Services client we load at
// runtime from https://accounts.google.com/gsi/client. Only the surface
// GoogleSignInButton actually uses.
export {};

declare global {
  interface CredentialResponse {
    credential: string;
    select_by?: string;
  }

  interface GsiButtonConfiguration {
    type?: 'standard' | 'icon';
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    logo_alignment?: 'left' | 'center';
    width?: number;
  }

  interface GoogleAccountsId {
    initialize(config: {
      client_id: string;
      callback: (response: CredentialResponse) => void;
      auto_select?: boolean;
      ux_mode?: 'popup' | 'redirect';
    }): void;
    renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
    prompt(): void;
    disableAutoSelect(): void;
  }

  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}
