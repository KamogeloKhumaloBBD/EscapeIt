import { Heading, Section, Text } from "react-email";
import * as React from "react";

import { EmailLayout, emailColors } from "../components/email-layout";

export interface SignInCodeEmailProperties {
  otp: string;
}

const headingStyle: React.CSSProperties = {
  fontSize: "28px",
  letterSpacing: "-0.04em",
  lineHeight: "34px",
  margin: "0 0 16px",
};

export function SignInCodeEmail({ otp }: SignInCodeEmailProperties) {
  return (
    <EmailLayout preview={`${otp} is your Context Layer sign-in code`}>
      <Heading as="h1" style={headingStyle}>
        Your sign-in code
      </Heading>
      <Text
        style={{
          color: emailColors.muted,
          fontSize: "15px",
          lineHeight: "24px",
          margin: "0 0 24px",
        }}
      >
        Enter this code to finish signing in to Context Layer.
      </Text>
      <Section
        style={{
          backgroundColor: emailColors.background,
          border: `1px solid ${emailColors.border}`,
          padding: "20px",
          textAlign: "center",
        }}
      >
        <Text
          style={{
            color: emailColors.foreground,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "32px",
            fontWeight: 700,
            letterSpacing: "0.28em",
            margin: 0,
          }}
        >
          {otp}
        </Text>
      </Section>
      <Text
        style={{
          color: emailColors.muted,
          fontSize: "13px",
          lineHeight: "20px",
          margin: "20px 0 0",
        }}
      >
        This code expires in 5 minutes. If you did not request it, you can
        safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

SignInCodeEmail.PreviewProps = {
  otp: "482193",
} satisfies SignInCodeEmailProperties;

export function signInCodeEmail(properties: SignInCodeEmailProperties) {
  return React.createElement(SignInCodeEmail, properties);
}

export default SignInCodeEmail;
