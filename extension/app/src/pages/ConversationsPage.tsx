import type { ConversationWithoutContentPublicType } from "@dust-tt/client";
import {
  BarHeader,
  Button,
  ChevronLeftIcon,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Spinner,
} from "@dust-tt/sparkle";
import { useConversations } from "@extension/components/conversation/useConversations";
import moment from "moment";
import { useNavigate } from "react-router-dom";

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

export const ConversationsPage = () => {
  const navigate = useNavigate();
  const { conversations, isConversationsLoading } = useConversations();

  if (isConversationsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const groupConversationsByDate = (
    conversations: ConversationWithoutContentPublicType[]
  ) => {
    const today = moment().startOf("day");
    const yesterday = moment().subtract(1, "days").startOf("day");
    const lastWeek = moment().subtract(1, "weeks").startOf("day");
    const lastMonth = moment().subtract(1, "months").startOf("day");
    const lastYear = moment().subtract(1, "years").startOf("day");

    const groups: Record<GroupLabel, ConversationWithoutContentPublicType[]> = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      "Last Month": [],
      "Last 12 Months": [],
      Older: [],
    };

    conversations.forEach((conversation) => {
      const createdDate = moment(conversation.created);
      if (createdDate.isSameOrAfter(today)) {
        groups["Today"].push(conversation);
      } else if (createdDate.isSameOrAfter(yesterday)) {
        groups["Yesterday"].push(conversation);
      } else if (createdDate.isSameOrAfter(lastWeek)) {
        groups["Last Week"].push(conversation);
      } else if (createdDate.isSameOrAfter(lastMonth)) {
        groups["Last Month"].push(conversation);
      } else if (createdDate.isSameOrAfter(lastYear)) {
        groups["Last 12 Months"].push(conversation);
      } else {
        groups["Older"].push(conversation);
      }
    });

    return groups;
  };

  const conversationsByDate = conversations.length
    ? groupConversationsByDate(conversations)
    : ({} as Record<GroupLabel, ConversationWithoutContentPublicType[]>);

  return (
    <>
      <BarHeader
        title="Conversations"
        leftActions={
          <div className="flex flex-row items-right">
            <Button
              icon={ChevronLeftIcon}
              variant="ghost"
              onClick={() => navigate("/")}
              size="md"
            />
          </div>
        }
      />
      <div className="h-full w-full mt-12">
        {conversationsByDate &&
          Object.keys(conversationsByDate).map((dateLabel) => (
            <RenderConversations
              key={dateLabel}
              conversations={conversationsByDate[dateLabel as GroupLabel]}
              dateLabel={dateLabel}
              navigate={navigate}
            />
          ))}
      </div>
    </>
  );
};

const RenderConversations = ({
  conversations,
  dateLabel,
  navigate,
}: {
  conversations: ConversationWithoutContentPublicType[];
  dateLabel: string;
  navigate: (path: string) => void;
}) => {
  if (!conversations.length) {
    return null;
  }

  const getLabel = (
    conversation: ConversationWithoutContentPublicType
  ): string => {
    const conversationLabel =
      conversation.title ||
      (moment(conversation.created).isSame(moment(), "day")
        ? "New Conversation"
        : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);

    return conversationLabel;
  };

  return (
    <div>
      <NavigationListLabel label={dateLabel} />
      <NavigationList>
        {conversations.map((conversation) => (
          <NavigationListItem
            key={conversation.sId}
            label={getLabel(conversation)}
            onClick={() => navigate(`/conversations/${conversation.sId}`)}
          />
        ))}
      </NavigationList>
    </div>
  );
};
