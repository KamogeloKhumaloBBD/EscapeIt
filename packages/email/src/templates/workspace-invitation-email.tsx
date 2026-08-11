import { Button, Heading, Text } from "react-email";
import * as React from "react";

import { EmailLayout, emailColors } from "../components/email-layout";

export interface WorkspaceInvitationEmailProperties {
  invitationUrl: string;
  workspaceName: string;
}

const headingStyle: React.CSSProperties = {
  fontSize: "28px",
  letterSpacing: "-0.04em",
  lineHeight: "34px",
  margin: "0 0 16px",
};

export function WorkspaceInvitationEmail({
  invitationUrl,
  workspaceName,
}: WorkspaceInvitationEmailProperties) {
  return (
    <EmailLayout preview={`You've been invited to ${workspaceName}`}>
      <Heading as="h1" style={headingStyle}>
        You&apos;ve been invited
      </Heading>
      <Text
        style={{
          color: emailColors.muted,
          fontSize: "15px",
          lineHeight: "24px",
          margin: "0 0 24px",
        }}
      >
        You&apos;ve been invited to the {workspaceName} workspace.
      </Text>
      <Button
        href={invitationUrl}
        style={{
          backgroundColor: emailColors.primary,
          color: emailColors.white,
          display: "inline-block",
          fontSize: "13px",
          fontWeight: 700,
          letterSpacing: "0.03em",
          padding: "13px 20px",
          textDecoration: "none",
          textTransform: "uppercase",
        }}
      >
        Accept invitation
      </Button>
      <Text
        style={{
          color: emailColors.muted,
          fontSize: "13px",
          lineHeight: "20px",
          margin: "24px 0 0",
        }}
      >
        This invitation expires in 7 days.
      </Text>
    </EmailLayout>
  );
}

WorkspaceInvitationEmail.PreviewProps = {
  invitationUrl: "http://localhost:3000/invite/example-token",
  workspaceName: "Acme Engineering",
} satisfies WorkspaceInvitationEmailProperties;

export function workspaceInvitationEmail(
  properties: WorkspaceInvitationEmailProperties,
) {
  return React.createElement(WorkspaceInvitationEmail, properties);
}

export default WorkspaceInvitationEmail;
