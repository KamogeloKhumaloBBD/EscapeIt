import {
  BellRingingIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { ProviderMark } from "@/components/integrations/provider-mark";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import {
  getNotificationChannelsState,
  getNotificationPreferencesState,
} from "@/lib/server/notification";
import { AddChannelDialog } from "./add-channel-dialog";
import {
  DeleteChannelButton,
  PreferenceToggle,
  TestChannelButton,
} from "./notification-forms";

export default async function NotificationsPage() {
  const [channelsState, preferencesState] = await Promise.all([
    getNotificationChannelsState(),
    getNotificationPreferencesState(),
  ]);

  if (channelsState.status === "anonymous") redirect("/sign-in");

  const channels =
    channelsState.status === "available" ? channelsState.data : [];
  const preferences =
    preferencesState.status === "available" ? preferencesState.data : [];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-7 lg:px-10 lg:pt-10">
      <WorkspacePageHeader
        action={<AddChannelDialog />}
        description="Send Microsoft Teams messages when things happen in this workspace."
        eyebrow="Notifications"
        title="Teams channels"
      />

      {channelsState.status !== "available" ? (
        <Alert className="mt-10" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Notifications unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load your notification channels. Refresh to try
            again.
          </AlertDescription>
        </Alert>
      ) : channels.length === 0 ? (
        <Card className="mt-10">
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellRingingIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No Teams channels connected</EmptyTitle>
                <EmptyDescription>
                  Connect a Microsoft Teams channel to start receiving workspace
                  notifications.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <section aria-label="Connected channels" className="mt-10">
          <Card>
            <CardHeader>
              <CardTitle>Connected channels</CardTitle>
              <CardDescription>
                Each channel receives every enabled event below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ItemGroup className="gap-0">
                {channels.map((channel, index) => (
                  <div key={channel.id}>
                    {index > 0 ? <ItemSeparator /> : null}
                    <Item>
                      <ItemMedia>
                        <ProviderMark
                          displayName={channel.name}
                          provider={channel.provider}
                          size="sm"
                        />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{channel.name}</ItemTitle>
                        <ItemDescription>
                          {channel.status === "connected" ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-600">
                              <CheckCircleIcon
                                aria-hidden="true"
                                weight="fill"
                              />
                              Connected
                            </span>
                          ) : (
                            (channel.lastErrorCode ?? "Not connected")
                          )}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="gap-2">
                        <TestChannelButton channelId={channel.id} />
                        <DeleteChannelButton
                          channelId={channel.id}
                          channelName={channel.name}
                        />
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            </CardContent>
          </Card>
        </section>
      )}

      <section aria-label="Notification events" className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>
              Choose which workspace events are sent to your connected channels.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">
                {preferences.filter((preference) => preference.enabled).length}{" "}
                enabled
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {preferences.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No events available yet</EmptyTitle>
                  <EmptyDescription>
                    Notification events will appear here as they become
                    available.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup className="gap-0">
                {preferences.map((preference, index) => (
                  <div key={preference.eventKey}>
                    {index > 0 ? <ItemSeparator /> : null}
                    <Item>
                      <ItemContent>
                        <ItemTitle>{preference.displayName}</ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <PreferenceToggle
                          enabled={preference.enabled}
                          eventKey={preference.eventKey}
                        />
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
