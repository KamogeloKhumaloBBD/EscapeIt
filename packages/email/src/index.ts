// Exported so callers can turn a template into HTML without depending on
// react-email themselves. This package owns how an email is rendered.
export { renderEmail } from "./render";
export {
  DailyDigestEmail,
  dailyDigestEmail,
  type DailyDigestEmailProperties,
  type DigestLink,
} from "./templates/daily-digest-email";
export {
  SignInCodeEmail,
  signInCodeEmail,
  type SignInCodeEmailProperties,
} from "./templates/sign-in-code-email";
export {
  WorkspaceInvitationEmail,
  workspaceInvitationEmail,
  type WorkspaceInvitationEmailProperties,
} from "./templates/workspace-invitation-email";
