import {
  UsersThreeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";

import {
  InviteMemberForm,
  RevokeInvitationButton,
} from "@/app/(workspace)/members/member-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspacePage } from "@/components/workspace-page";
import { getMemberListState } from "@/lib/server/member";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export default async function MembersPage() {
  const state = await getMemberListState();

  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "without-workspace") redirect("/onboarding");

  if (state.status === "unavailable") {
    return (
      <WorkspacePage>
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Members unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load the workspace members. Refresh to try again.
          </AlertDescription>
        </Alert>
      </WorkspacePage>
    );
  }

  const { data } = state;
  const ownerCount = data.members.filter(
    (member) => member.role === "owner",
  ).length;
  const pendingCount = data.pendingInvitations?.length ?? 0;

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        description={
          <>
            See who belongs to {data.workspaceName} and invite teammates to
            bring their own provider identities.
          </>
        }
        title="Members"
      />

      <section
        aria-label="Member summary"
        className="mt-10 grid overflow-hidden border border-border bg-card sm:grid-cols-3"
      >
        {[
          ["Active members", data.members.length],
          ["Workspace owners", ownerCount],
          ["Pending invitations", pendingCount],
        ].map(([label, value], index) => (
          <div
            className={`relative px-6 py-5 ${index > 0 ? "border-t sm:border-l sm:border-t-0" : ""}`}
            key={label}
          >
            <div className="absolute left-6 top-0 h-px w-10 bg-primary sm:left-0 sm:top-6 sm:h-10 sm:w-px" />
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-3xl font-medium tabular-nums">
              {value}
            </p>
          </div>
        ))}
      </section>

      {data.permissions.canInvite ? (
        <Card className="relative mt-10 overflow-hidden">
          <div className="absolute -right-16 -top-24 size-64 rounded-full bg-primary/7 blur-3xl" />
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>
              Invitations are email-specific and expire after seven days.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <InviteMemberForm />
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Workspace roster</CardTitle>
          <CardDescription>
            Provider accounts remain personal to each member.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y border md:hidden">
            {data.members.map((member) => (
              <article
                className="flex items-center gap-3 p-4"
                key={member.membershipId}
              >
                <Avatar className="ring-2 ring-background shadow-sm">
                  <AvatarFallback>
                    {initials(member.name || member.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Joined {formatDate(member.joinedAt)}
                  </p>
                </div>
                <Badge
                  variant={member.role === "owner" ? "default" : "outline"}
                >
                  {member.role}
                </Badge>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((member) => (
                  <TableRow key={member.membershipId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="ring-2 ring-background shadow-sm">
                          <AvatarFallback>
                            {initials(member.name || member.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{member.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          member.role === "owner" ? "default" : "outline"
                        }
                      >
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      <time dateTime={member.joinedAt}>
                        {formatDate(member.joinedAt)}
                      </time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {data.pendingInvitations === null ? null : (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>
              Invitations that have not yet been accepted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.pendingInvitations.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersThreeIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No pending invitations</EmptyTitle>
                  <EmptyDescription>
                    New invitations will appear here until they are accepted.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <div className="divide-y border md:hidden">
                  {data.pendingInvitations.map((invitation) => (
                    <article className="space-y-3 p-4" key={invitation.id}>
                      <div>
                        <p className="truncate text-sm font-medium">
                          {invitation.email}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Expires {formatDate(invitation.expiresAt)}
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <RevokeInvitationButton
                          email={invitation.email}
                          invitationId={invitation.id}
                        />
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.pendingInvitations.map((invitation) => (
                        <TableRow key={invitation.id}>
                          <TableCell className="font-medium">
                            {invitation.email}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <time dateTime={invitation.expiresAt}>
                              {formatDate(invitation.expiresAt)}
                            </time>
                          </TableCell>
                          <TableCell className="text-right">
                            <RevokeInvitationButton
                              email={invitation.email}
                              invitationId={invitation.id}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </WorkspacePage>
  );
}
