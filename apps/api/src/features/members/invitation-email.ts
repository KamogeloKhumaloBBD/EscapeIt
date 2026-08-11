import { workspaceInvitationEmail } from "@context-layer/email";
import type { Logger } from "pino";
import { Resend } from "resend";

export interface InvitationEmail {
  invitationUrl: string;
  recipientEmail: string;
  workspaceName: string;
}

export interface InvitationEmailSender {
  sendInvitation(email: InvitationEmail): Promise<boolean>;
}

export function createInvitationEmailSender(config: {
  from: string;
  logger: Pick<Logger, "warn">;
  resendApiKey: string;
}): InvitationEmailSender {
  const resend = new Resend(config.resendApiKey);

  return {
    async sendInvitation(email) {
      try {
        const { error } = await resend.emails.send({
          from: config.from,
          react: workspaceInvitationEmail({
            invitationUrl: email.invitationUrl,
            workspaceName: email.workspaceName,
          }),
          subject: `You've been invited to ${email.workspaceName}`,
          to: email.recipientEmail,
        });

        if (error !== null) {
          config.logger.warn(
            {
              providerError: {
                name: error.name,
                statusCode: error.statusCode,
              },
            },
            "Resend rejected a workspace invitation email",
          );
          return false;
        }

        return true;
      } catch (error) {
        config.logger.warn(
          {
            providerError: {
              name: error instanceof Error ? error.name : "UnknownError",
            },
          },
          "Workspace invitation email delivery failed",
        );
        return false;
      }
    },
  };
}
