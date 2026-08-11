export interface AcceptInvitationActionState {
  message: string | null;
  status: "error" | "idle";
}

export const initialAcceptInvitationState: AcceptInvitationActionState = {
  message: null,
  status: "idle",
};
