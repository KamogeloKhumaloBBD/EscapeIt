export interface SendDigestState {
  message: string | null;
  status: "idle" | "error" | "success";
}

export const initialSendDigestState: SendDigestState = {
  message: null,
  status: "idle",
};
