export interface CustomMcpActionState {
  fieldErrors?: { endpointUrl?: string; name?: string; token?: string };
  message: string | null;
  status: "error" | "idle" | "success";
}

export const initialCustomMcpActionState: CustomMcpActionState = {
  message: null,
  status: "idle",
};
