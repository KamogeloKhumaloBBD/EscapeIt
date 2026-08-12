export interface NotificationActionState {
  message: string | null;
  status: "error" | "idle" | "success";
}

export const initialNotificationActionState: NotificationActionState = {
  message: null,
  status: "idle",
};
