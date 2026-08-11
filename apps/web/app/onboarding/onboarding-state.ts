export interface OnboardingActionState {
  fieldErrors: {
    name?: string;
  };
  message: string | null;
  name: string;
  status: "error" | "idle";
}

export const initialOnboardingState: OnboardingActionState = {
  fieldErrors: {},
  message: null,
  name: "",
  status: "idle",
};
