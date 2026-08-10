export type SignInIntent = "request-code" | "verify-code";
export type SignInStep = "code" | "email";
export type SignInStatus = "error" | "idle" | "success";

export interface SignInFieldErrors {
  code?: string;
  email?: string;
}

export interface SignInActionState {
  email: string;
  fieldErrors: SignInFieldErrors;
  message: string | null;
  status: SignInStatus;
  step: SignInStep;
}

export const initialSignInState: SignInActionState = {
  email: "",
  fieldErrors: {},
  message: null,
  status: "idle",
  step: "email",
};
