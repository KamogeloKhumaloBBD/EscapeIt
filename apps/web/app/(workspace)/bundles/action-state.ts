export interface CreateBundleActionState {
  bundleId: string | null;
  description: string;
  descriptionFieldError?: string;
  fieldError?: string;
  message: string | null;
  name: string;
  status: "error" | "idle" | "success";
}

export interface UpdateBundleActionState {
  description: string;
  descriptionFieldError?: string;
  fieldError?: string;
  message: string | null;
  name: string;
  status: "error" | "idle" | "success";
}

export interface DeleteBundleActionState {
  message: string | null;
  status: "error" | "idle" | "success";
}

export interface ReplaceBundleProvidersActionState {
  message: string | null;
  status: "error" | "idle" | "success";
}

export type ReplaceBundleCustomMcpServersActionState =
  ReplaceBundleProvidersActionState;

export const initialCreateBundleState: CreateBundleActionState = {
  bundleId: null,
  description: "",
  message: null,
  name: "",
  status: "idle",
};

export const initialUpdateBundleState: UpdateBundleActionState = {
  description: "",
  message: null,
  name: "",
  status: "idle",
};

export const initialDeleteBundleState: DeleteBundleActionState = {
  message: null,
  status: "idle",
};

export const initialReplaceBundleProvidersState: ReplaceBundleProvidersActionState =
  {
    message: null,
    status: "idle",
  };

export const initialReplaceBundleCustomMcpServersState: ReplaceBundleCustomMcpServersActionState =
  { message: null, status: "idle" };
