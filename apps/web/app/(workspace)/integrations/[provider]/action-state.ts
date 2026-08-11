export interface IntegrationActionState {
  message: string | null;
  status: "error" | "idle" | "success";
}

export const initialIntegrationActionState: IntegrationActionState = {
  message: null,
  status: "idle",
};
