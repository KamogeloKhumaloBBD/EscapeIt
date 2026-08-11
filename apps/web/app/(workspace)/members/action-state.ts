export interface InviteMemberActionState {
  email: string;
  fieldError?: string;
  message: string | null;
  status: "error" | "idle" | "success";
}

export interface RevokeInvitationActionState {
  message: string | null;
  status: "error" | "idle" | "success";
}

export const initialInviteMemberState: InviteMemberActionState = {
  email: "",
  message: null,
  status: "idle",
};

export const initialRevokeInvitationState: RevokeInvitationActionState = {
  message: null,
  status: "idle",
};
