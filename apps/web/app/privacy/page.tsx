import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  description: "How Context Layer handles data.",
  title: "Privacy Policy | Context Layer",
};

const sectionClassName = "space-y-3";
const headingClassName =
  "text-lg font-semibold tracking-[-0.025em] text-[#15130f]";
const listClassName = "list-disc space-y-2 pl-5";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#514c44]">
      <header className="border-b border-[#dedbd2]">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5 lg:px-8">
          <Link
            className="text-sm font-semibold tracking-[-0.02em] text-[#15130f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
            href="/"
          >
            Context Layer
          </Link>
          <Link
            className="text-sm underline-offset-4 hover:text-[#15130f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
            href="/"
          >
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-14 leading-7 sm:py-20 lg:px-8">
        <header className="border-b border-[#dedbd2] pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5a41e8]">
            Legal
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-[#15130f] sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-5 text-lg leading-8">
            Context Layer connects authorized Jira and Confluence resources to
            an MCP client.
          </p>
          <p className="mt-4 text-sm text-[#817b73]">
            Last updated: 13 August 2026
          </p>
        </header>

        <div className="space-y-9 py-10">
          <section className={sectionClassName}>
            <h2 className={headingClassName}>What we store</h2>
            <ul className={listClassName}>
              <li>Your Context Layer account name and email address.</li>
              <li>Your workspace membership, role, and configuration.</li>
              <li>
                Selected Jira projects or Confluence spaces and connection
                status.
              </li>
              <li>Encrypted Atlassian OAuth access and refresh tokens.</li>
              <li>MCP token hashes and MCP activity records.</li>
            </ul>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Atlassian identity</h2>
            <p>
              Context Layer does not store Atlassian account IDs or profile
              names. The identity tools retrieve that information from Atlassian
              when invoked and return it directly to the MCP client.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Content handling</h2>
            <p>
              Read tools return requested Jira and Confluence content to the MCP
              client. Write tools send content from the MCP client to Atlassian.
              Context Layer does not store that content in its database.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Retention and security</h2>
            <p>
              Disconnecting an integration clears its stored OAuth credentials.
              Other account, workspace, configuration, and activity records
              remain in the database until the service operator removes them.
              Invitation and MCP tokens are stored as SHA-256 hashes. OAuth
              credentials are encrypted with AES-256-GCM.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
