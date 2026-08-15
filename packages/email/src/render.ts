import { render } from "react-email";

type EmailElement = Parameters<typeof render>[0];

/**
 * Turns a template into the HTML an email client receives.
 *
 * Wrapped rather than re-exporting `render` directly so the signature is
 * declared here, where react-email's own types resolve. A consumer outside this
 * package sees an ordinary `Promise<string>` instead of an unresolved type.
 */
export async function renderEmail(email: EmailElement): Promise<string> {
  return render(email);
}
