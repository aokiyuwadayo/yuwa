export interface LoginFormState {
  step: "request" | "verify";
  email: string;
  error?: string;
  notice?: string;
}

export const initialLoginState: LoginFormState = {
  step: "request",
  email: "",
};
