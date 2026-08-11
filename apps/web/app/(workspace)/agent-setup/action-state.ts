export interface CreateMcpTokenActionState {
  fieldError?: string;
  message: string | null;
  name: string;
  rawToken: string | null;
  status: "error" | "idle" | "success";
}

export interface RevokeMcpTokenActionState {
  message: string | null;
  status: "error" | "idle" | "success";
}

export const initialCreateMcpTokenState: CreateMcpTokenActionState = {
  message: null,
  name: "",
  rawToken: null,
  status: "idle",
};

export const initialRevokeMcpTokenState: RevokeMcpTokenActionState = {
  message: null,
  status: "idle",
};
