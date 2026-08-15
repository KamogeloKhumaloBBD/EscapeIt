import {
  BellRingingIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react/dist/ssr";

import { ProviderMark } from "@/components/integrations/provider-mark";
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
import type { NotificationChannel } from "@/lib/validation/notification";
import { AddChannelDialog } from "./add-channel-dialog";
import {
  ChannelSourceSelector,
  DeleteChannelButton,
  TestChannelButton,
} from "./notification-forms";

export interface NotificationSourceOption {
  displayName: string;
  provider: string;
}

export function NotificationChannelsSection({
  canManage,
  channels,
  providerDisplayName,
}: {
  canManage: boolean;
  channels: NotificationChannel[];
  providerDisplayName: string;
}) {
  return (
    <Card className="relative overflow-visible">
      <CardHeader>
        <CardTitle>Connected channels</CardTitle>
        <CardDescription>
          Configure which integrations each channel hears from in Routing below.
        </CardDescription>
        {canManage ? (
          <CardAction>
            <AddChannelDialog providerDisplayName={providerDisplayName} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellRingingIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No channels connected</EmptyTitle>
              <EmptyDescription>
                {canManage
                  ? `Connect a ${providerDisplayName} channel to start receiving workspace notifications.`
                  : `Ask a workspace owner to connect a ${providerDisplayName} channel.`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
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
                          <CheckCircleIcon aria-hidden="true" weight="fill" />
                          Connected
                        </span>
                      ) : (
                        (channel.lastErrorCode ?? "Not connected")
                      )}
                    </ItemDescription>
                  </ItemContent>
                  {canManage ? (
                    <ItemActions className="w-full justify-end gap-2 sm:w-auto">
                      <TestChannelButton channelId={channel.id} />
                      <DeleteChannelButton
                        channelId={channel.id}
                        channelName={channel.name}
                        providerDisplayName={providerDisplayName}
                      />
                    </ItemActions>
                  ) : null}
                </Item>
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

export function NotificationRoutingSection({
  canManage,
  channels,
  sourceOptions,
}: {
  canManage: boolean;
  channels: NotificationChannel[];
  sourceOptions: NotificationSourceOption[];
}) {
  return (
    <Card className="relative overflow-visible">
      <CardHeader>
        <CardTitle>Routing</CardTitle>
        <CardDescription>
          Choose which integrations each channel hears from. A channel with no
          integrations selected receives nothing.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">{sourceOptions.length} available</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No channels connected yet</EmptyTitle>
              <EmptyDescription>
                Connect a channel above to configure its routing.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : sourceOptions.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No integrations send notifications yet</EmptyTitle>
              <EmptyDescription>
                Turn on notifications for an integration to route its updates
                here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-0">
            {channels.map((channel, channelIndex) => (
              <div key={channel.id}>
                {channelIndex > 0 ? <ItemSeparator /> : null}
                <div className="py-4">
                  <p className="text-sm font-semibold">{channel.name}</p>
                  <ChannelSourceSelector
                    channelId={channel.id}
                    currentSources={channel.sourceProviders}
                    disabled={!canManage}
                    options={sourceOptions}
                  />
                </div>
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
